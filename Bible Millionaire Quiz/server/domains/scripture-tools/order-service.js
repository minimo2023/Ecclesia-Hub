import { randomBytes, randomUUID } from 'node:crypto';
import { dbOps } from '../../database/index.js';
import { bibleTranslator } from '../../utils/bibleTranslator.js';
import { applyCoinDeltaTx } from '../economy/AssetLedgerService.js';
import {
    ORDER_LAB_DIFFICULTIES,
    ORDER_LAYOUT_DIFFICULTIES,
    ORDER_LAB_MODES,
    ORDER_LAB_TAGS,
    ORDER_LAB_VERSION,
    SEED_PASSAGES,
    buildStepOptions,
    canonicalizeVerses,
    classifyDifficulty,
    completionScore,
    publicOptions,
    rotateWrongOption,
    scoreCorrect,
    sha256,
    splitExactText,
    splitVersesForOrder,
    stableIndex,
    stripEditorialAnnotations,
    taipeiDate,
    timerSeconds,
    validateCustomRange,
    verifyFragments
} from './order-engine.js';
import { reviewCustomPassageSegmentation } from './segmentation-review-service.js';
import { SCRIPTURE_SEGMENTATION_RULE_VERSION } from './segmentation-review-policy.js';
import { gridAvailability } from './healthy-segmentation-engine.js';
import {
    resolvePassageSegmentation,
    segmentationCruiseEnabled
} from './segmentation-cruise-service.js';
import {
    externalDistractorCount,
    normalizeMemoryDifficulty,
    normalizeMemoryGrid,
    validateMemoryLayout
} from './scripture-memory-rules.js';
import {
    awardScriptureMemoryProgress,
    settleScriptureMemoryCompletion
} from './scripture-memory-reward-service.js';

const MAX_LIVES = 3;
const DAILY_RANKED_ATTEMPTS = 3;
const DEMO_FRAGMENT_MS = 550;
const SHARE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export function scriptureOrderHintCost() {
    const configured = Number.parseInt(process.env.SCRIPTURE_ORDER_HINT_COST || '5', 10);
    return Number.isSafeInteger(configured) && configured >= 1 && configured <= 50 ? configured : 5;
}

export class OrderLabError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'OrderLabError';
        this.code = code;
        this.status = status;
    }
}

function jsonValue(value, fallback) {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return fallback; }
}

function actorFromRequest(req, { required = true } = {}) {
    if (req.user?.userId) {
        return { userId: req.user.userId, ownerKey: `user:${req.user.userId}`, guest: false };
    }
    const raw = String(req.get('X-Scripture-Guest-Key') || '').trim();
    if (!raw && !required) return null;
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(raw)) {
        throw new OrderLabError('GUEST_KEY_REQUIRED', '需要有效的訪客識別碼', 401);
    }
    return { userId: null, ownerKey: `guest:${sha256(raw)}`, guest: true };
}

function passageReference(passage) {
    const bookName = bibleTranslator.toChinese(passage.book) || passage.book;
    return `${bookName} ${passage.chapter}:${passage.verseStart}–${passage.verseEnd}`;
}

function passageSummary(passage) {
    return {
        id: passage.id,
        title: passage.title === '自選經文練習' ? '自選經文挑戰' : passage.title,
        reference: passageReference(passage),
        book: passage.book,
        bookName: bibleTranslator.toChinese(passage.book),
        chapter: Number(passage.chapter),
        verseStart: Number(passage.verseStart),
        verseEnd: Number(passage.verseEnd),
        difficulty: passage.difficulty,
        fragmentCount: Number(passage.fragmentCount),
        gridAvailability: gridAvailability(Number(passage.fragmentCount)),
        revision: Number(passage.revision)
    };
}

async function loadExternalDistractorPool(passage, minimumCount = 0) {
    if (minimumCount <= 0) return [];
    const fragments = [];
    const seen = new Set();
    const add = (id, text) => {
        const value = stripEditorialAnnotations(text);
        const visible = value.replace(/[\p{P}\p{S}\s]/gu, '');
        if (!visible || seen.has(visible)) return;
        seen.add(visible);
        fragments.push({ id: `external:${id}`, text: value, publicKey: randomUUID(), external: true });
    };

    const entries = await dbOps.gamesDb.query(`
        SELECT entry_key, fragments
        FROM scripture_segmentation_entries
        WHERE version = 'CUV_TRAD' AND active = TRUE
          AND health_state IN ('VALID', 'VALID_LONG')
          AND NOT (book = $1 AND chapter = $2 AND verse BETWEEN $3 AND $4)
        ORDER BY RANDOM()
        LIMIT 24
    `, [passage.book, passage.chapter, passage.verseStart, passage.verseEnd]).catch(() => []);
    for (const entry of entries) {
        jsonValue(entry.fragments, []).forEach((text, index) => add(`${entry.entryKey}:${index}`, text));
        if (fragments.length >= Math.max(12, minimumCount * 3)) break;
    }

    if (fragments.length < minimumCount) {
        const rows = await dbOps.gamesDb.query(`
            SELECT id, fragments FROM scripture_order_lab_passages
            WHERE id <> $1
              AND NOT (
                  book = $2 AND chapter = $3
                  AND verse_start <= $5 AND verse_end >= $4
              )
              AND audit_state IN ('DETERMINISTIC_PASS', 'PASS')
            ORDER BY RANDOM() LIMIT 12
        `, [passage.id, passage.book, passage.chapter, passage.verseStart, passage.verseEnd]).catch(() => []);
        for (const row of rows) {
            jsonValue(row.fragments, []).forEach((fragment, index) => add(
                `${row.id}:${index}`,
                typeof fragment === 'string' ? fragment : fragment?.text
            ));
        }
    }
    return fragments;
}

async function loadVerseRange({ book, chapter, verseStart, verseEnd }) {
    const englishBook = bibleTranslator.toEnglish(book);
    if (!bibleTranslator.isKnownBook(englishBook)) {
        throw new OrderLabError('INVALID_BIBLE_BOOK', '書卷名稱無效');
    }
    const rows = await dbOps.contentDb.query(`
        SELECT id, book, chapter, verse, text
        FROM bible_verses
        WHERE version = 'CUV_TRAD' AND book = $1 AND chapter = $2
          AND verse BETWEEN $3 AND $4
        ORDER BY verse
    `, [englishBook, chapter, verseStart, verseEnd]);
    const verses = canonicalizeVerses(rows);
    const expected = verseEnd - verseStart + 1;
    if (verses.length !== expected) {
        throw new OrderLabError('PASSAGE_INCOMPLETE', '正式和合本缺少所選範圍的部分經節', 422);
    }
    for (let index = 0; index < verses.length; index += 1) {
        if (verses[index].verse !== verseStart + index) {
            throw new OrderLabError('PASSAGE_INCOMPLETE', '所選經文範圍不連續', 422);
        }
    }
    return verses;
}

async function loadChapter({ book, chapter }) {
    const englishBook = bibleTranslator.toEnglish(book);
    const chapterNumber = Number(chapter);
    if (!bibleTranslator.isKnownBook(englishBook)) {
        throw new OrderLabError('INVALID_BIBLE_BOOK', '書卷名稱無效');
    }
    if (!Number.isSafeInteger(chapterNumber) || chapterNumber < 1 || chapterNumber > 150) {
        throw new OrderLabError('INVALID_BIBLE_CHAPTER', '章節無效');
    }
    const rows = await dbOps.contentDb.query(`
        SELECT id, book, chapter, verse, text
        FROM bible_verses
        WHERE version = 'CUV_TRAD' AND book = $1 AND chapter = $2
        ORDER BY verse
    `, [englishBook, chapterNumber]);
    const verses = canonicalizeVerses(rows);
    if (verses.length === 0) throw new OrderLabError('PASSAGE_NOT_FOUND', '找不到所選章節的正式和合本經文', 404);
    return {
        version: { id: 'CUV_TRAD', name: '和合本' },
        book: englishBook,
        bookName: bibleTranslator.toChinese(englishBook),
        chapter: chapterNumber,
        verses: verses.map(verse => {
            const text = stripEditorialAnnotations(verse.text);
            return {
                verse: verse.verse,
                verseStart: verse.verse,
                verseEnd: verse.verse,
                verseLabel: String(verse.verse),
                coveredVerses: [verse.verse],
                text,
                playable: Boolean(text),
                unplayableReason: text ? null : 'EDITORIAL_NOTE_ONLY_VERSE'
            };
        })
    };
}

async function upsertPassage(definition, { official, published, custom = false }) {
    const sourceVerses = await loadVerseRange(definition);
    const rawSourceText = sourceVerses.map(verse => verse.text).join('');
    const verses = sourceVerses.map(verse => ({
        ...verse,
        text: stripEditorialAnnotations(verse.text)
    }));
    const sourceText = verses.map(verse => verse.text).join('');
    if (!sourceText) {
        throw new OrderLabError(
            'PASSAGE_HAS_NO_PLAYABLE_TEXT',
            '所選範圍只有譯本註記，沒有可用於遊戲的經文',
            422
        );
    }
    // The 20 curated/"常用經文" passages are repaired immediately. Custom
    // passages remain behind the cruise feature flag until full activation.
    const useHealthyLibrary = official || segmentationCruiseEnabled();
    const machineSegmentation = useHealthyLibrary
        ? await resolvePassageSegmentation({ version: 'CUV_TRAD', book: verses[0].book, chapter: definition.chapter, verses })
        : custom ? splitVersesForOrder(verses) : null;
    const fragments = machineSegmentation
        ? machineSegmentation.fragments
        : splitExactText(sourceText, { difficulty: definition.difficulty, custom });
    if (!verifyFragments(sourceText, fragments)) {
        throw new OrderLabError('FRAGMENT_REASSEMBLY_FAILED', `經文切分驗證失敗：${definition.id}`, 500);
    }
    const difficulty = definition.difficulty || classifyDifficulty(fragments.length);
    const sourceHash = sha256(sourceText);
    const row = await dbOps.gamesDb.get('SELECT * FROM scripture_order_lab_passages WHERE id = $1', [definition.id]);
    const officialSegmentationChanged = Boolean(row && official) && (
        row.segmentationVersion !== SCRIPTURE_SEGMENTATION_RULE_VERSION
        || row.segmentationMethod !== 'healthy_per_verse_library'
        || JSON.stringify(jsonValue(row.fragments, [])) !== JSON.stringify(fragments)
    );
    const revision = row && (row.sourceHash !== sourceHash || officialSegmentationChanged)
        ? Number(row.revision) + 1
        : Number(row?.revision || 1);
    await dbOps.gamesDb.run(`
        INSERT INTO scripture_order_lab_passages
            (id, version, book, chapter, verse_start, verse_end, title, difficulty,
             source_text, source_hash, source_verses, fragments, fragment_count,
             segmentation_method, segmentation_version, audit_state, audit_details,
             revision, is_official, is_published, updated_at)
        VALUES ($1, 'CUV_TRAD', $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb,
                $11::jsonb, $12, $13, $14,
                'DETERMINISTIC_PASS', $15::jsonb, $16, $17, $18, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title, difficulty = EXCLUDED.difficulty,
            source_text = EXCLUDED.source_text, source_hash = EXCLUDED.source_hash,
            source_verses = EXCLUDED.source_verses,
            fragments = CASE
                WHEN EXCLUDED.is_official = FALSE
                 AND scripture_order_lab_passages.source_hash = EXCLUDED.source_hash
                 AND scripture_order_lab_passages.audit_state = 'PASS'
                THEN scripture_order_lab_passages.fragments ELSE EXCLUDED.fragments END,
            fragment_count = CASE
                WHEN EXCLUDED.is_official = FALSE
                 AND scripture_order_lab_passages.source_hash = EXCLUDED.source_hash
                 AND scripture_order_lab_passages.audit_state = 'PASS'
                THEN scripture_order_lab_passages.fragment_count ELSE EXCLUDED.fragment_count END,
            segmentation_method = CASE
                WHEN EXCLUDED.is_official = FALSE
                 AND scripture_order_lab_passages.source_hash = EXCLUDED.source_hash
                 AND scripture_order_lab_passages.audit_state = 'PASS'
                THEN scripture_order_lab_passages.segmentation_method ELSE EXCLUDED.segmentation_method END,
            segmentation_version = CASE
                WHEN EXCLUDED.is_official = FALSE
                 AND scripture_order_lab_passages.source_hash = EXCLUDED.source_hash
                 AND scripture_order_lab_passages.audit_state = 'PASS'
                THEN scripture_order_lab_passages.segmentation_version ELSE EXCLUDED.segmentation_version END,
            generation_model = CASE WHEN EXCLUDED.is_official = FALSE
                AND scripture_order_lab_passages.source_hash = EXCLUDED.source_hash
                THEN scripture_order_lab_passages.generation_model ELSE NULL END,
            audit_model = CASE WHEN EXCLUDED.is_official = FALSE
                AND scripture_order_lab_passages.source_hash = EXCLUDED.source_hash
                THEN scripture_order_lab_passages.audit_model ELSE NULL END,
            audit_state = CASE WHEN EXCLUDED.is_official = FALSE
                AND scripture_order_lab_passages.source_hash = EXCLUDED.source_hash
                THEN scripture_order_lab_passages.audit_state ELSE EXCLUDED.audit_state END,
            audit_details = CASE WHEN EXCLUDED.is_official = FALSE
                AND scripture_order_lab_passages.source_hash = EXCLUDED.source_hash
                THEN scripture_order_lab_passages.audit_details || EXCLUDED.audit_details ELSE EXCLUDED.audit_details END,
            revision = EXCLUDED.revision,
            is_official = EXCLUDED.is_official, is_published = EXCLUDED.is_published,
            updated_at = CURRENT_TIMESTAMP
    `, [definition.id, verses[0].book, definition.chapter, definition.verseStart, definition.verseEnd,
        definition.title, difficulty, sourceText, sourceHash, JSON.stringify(verses), JSON.stringify(fragments),
        fragments.length,
        useHealthyLibrary ? 'healthy_per_verse_library'
            : custom ? 'per_verse_punctuation_length_rules' : 'punctuation_length_rules',
        machineSegmentation ? SCRIPTURE_SEGMENTATION_RULE_VERSION : 'rule-v2',
        JSON.stringify({
            exactReassembly: true,
            source: 'bible_verses',
            rawSourceHash: sha256(rawSourceText),
            displayTransform: useHealthyLibrary
                ? 'remove_marked_editorial_notes_v2'
                : 'remove_parenthetical_editorial_notes_v1',
            runtimeAi: false,
            perVerseBoundaries: Boolean(machineSegmentation),
            segmentationEntries: machineSegmentation?.segmentationEntries || [],
            lowConfidenceVerses: (machineSegmentation?.lowConfidenceVerses || [])
                .map(item => typeof item === 'number' ? item : item.verse)
        }),
        revision, official, published]);
    return dbOps.gamesDb.get('SELECT * FROM scripture_order_lab_passages WHERE id = $1', [definition.id]);
}

let seedPromise;
export async function ensureOrderLabSeeds() {
    if (!seedPromise) {
        seedPromise = (async () => {
            for (const definition of SEED_PASSAGES) {
                await upsertPassage(definition, { official: true, published: true });
            }
        })().catch(error => {
            seedPromise = null;
            throw error;
        });
    }
    await seedPromise;
}

async function officialPassages() {
    await ensureOrderLabSeeds();
    return dbOps.gamesDb.query(`
        SELECT * FROM scripture_order_lab_passages
        WHERE is_official = TRUE AND is_published = TRUE
          AND version = 'CUV_TRAD' AND audit_state IN ('DETERMINISTIC_PASS', 'PASS')
        ORDER BY book, chapter, verse_start
    `);
}

async function createCustomPassage(input) {
    const range = validateCustomRange(input, { min: 1, max: 20 });
    if (!range.valid) {
        throw new OrderLabError(range.code, '自選範圍必須是同章連續 1 至 20 節');
    }
    const englishBook = bibleTranslator.toEnglish(input.book);
    if (!bibleTranslator.isKnownBook(englishBook)) throw new OrderLabError('INVALID_BIBLE_BOOK', '書卷名稱無效');
    const id = `custom-${sha256(`${englishBook}:${range.chapter}:${range.verseStart}:${range.verseEnd}`).slice(0, 24)}`;
    const passage = await upsertPassage({
        id,
        title: '自選經文挑戰',
        book: englishBook,
        chapter: range.chapter,
        verseStart: range.verseStart,
        verseEnd: range.verseEnd,
        difficulty: null
    }, { official: false, published: false, custom: true });
    if (segmentationCruiseEnabled()) {
        return { ...passage, segmentationReview: { state: 'HEALTHY_LIBRARY', runtimeAi: false } };
    }
    const reviewed = await reviewCustomPassageSegmentation(passage);
    return { ...reviewed.passage, segmentationReview: reviewed.review };
}

function orderedFragments(passage) {
    return jsonValue(passage.fragments, []).map((fragment, index) => ({
        id: fragment.id || `f${index + 1}`,
        text: String(fragment.text || '')
    }));
}

async function runtimePassageFromSharedSegmentation(passage) {
    const verses = jsonValue(passage.sourceVerses, []);
    if (!verses.length) throw new OrderLabError('PASSAGE_SOURCE_MISSING', '這段經文缺少完整原文，無法建立新版切片', 422);
    const segmentation = await resolvePassageSegmentation({
        version: 'CUV_TRAD',
        book: passage.book,
        chapter: Number(passage.chapter),
        verses
    });
    const fragments = segmentation.fragments;
    const sourceText = verses.map(verse => String(verse.text || '')).join('');
    if (!verifyFragments(sourceText, fragments)) {
        throw new OrderLabError('FRAGMENT_REASSEMBLY_FAILED', '新版切片未通過逐字重組驗證', 500);
    }
    const oversized = fragments.filter(fragment =>
        Array.from(String(fragment.text || '').replace(/[\p{P}\p{S}\s]/gu, '')).length > 10
    );
    if (oversized.length) {
        throw new OrderLabError('PASSAGE_SEGMENTATION_TOO_LONG', '這段經文仍有過長片段，請重新產生新版切片', 422);
    }
    return {
        ...passage,
        fragments,
        fragmentCount: fragments.length,
        segmentationMethod: 'healthy_per_verse_library',
        segmentationVersion: SCRIPTURE_SEGMENTATION_RULE_VERSION
    };
}

function difficultyForStage(mode, stageNumber) {
    if (mode === 'daily') return ['INTRO', 'STANDARD', 'CHALLENGE'][stageNumber - 1] || 'CHALLENGE';
    if (mode === 'endless') return stageNumber <= 2 ? 'INTRO' : stageNumber <= 5 ? 'STANDARD' : 'CHALLENGE';
    return null;
}

async function dailySet(date, passages) {
    const existing = await dbOps.gamesDb.get('SELECT * FROM scripture_order_lab_daily_sets WHERE challenge_date = $1', [date]);
    if (existing) return jsonValue(existing.passageIds, []);
    const ids = ['INTRO', 'STANDARD', 'CHALLENGE'].map((difficulty, offset) => {
        const candidates = passages.filter(passage => passage.difficulty === difficulty);
        return candidates[stableIndex(`${date}:${difficulty}:${offset}`, candidates.length)]?.id;
    });
    if (ids.some(id => !id)) throw new OrderLabError('DAILY_PASSAGES_UNAVAILABLE', '每日挑戰題組尚未備妥', 503);
    await dbOps.gamesDb.run(`
        INSERT INTO scripture_order_lab_daily_sets (challenge_date, passage_ids)
        VALUES ($1, $2::jsonb) ON CONFLICT (challenge_date) DO NOTHING
    `, [date, JSON.stringify(ids)]);
    const created = await dbOps.gamesDb.get('SELECT * FROM scripture_order_lab_daily_sets WHERE challenge_date = $1', [date]);
    return jsonValue(created.passageIds, ids);
}

function choosePassage(passages, { mode, stageNumber, seenIds = [], dailyIds = [], requestedId }) {
    if (requestedId) {
        const requested = passages.find(passage => passage.id === requestedId);
        if (!requested) throw new OrderLabError('PASSAGE_NOT_FOUND', '找不到指定的實驗經文', 404);
        return requested;
    }
    if (mode === 'daily') {
        const selected = passages.find(passage => passage.id === dailyIds[stageNumber - 1]);
        if (!selected) throw new OrderLabError('DAILY_PASSAGE_NOT_FOUND', '每日挑戰經文不存在', 500);
        return selected;
    }
    const required = difficultyForStage(mode, stageNumber);
    let candidates = required ? passages.filter(passage => passage.difficulty === required) : passages;
    const unseen = candidates.filter(passage => !seenIds.includes(passage.id));
    if (unseen.length) candidates = unseen;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

async function stageState(passage, session) {
    const runtimePassage = await runtimePassageFromSharedSegmentation(passage);
    const fragments = orderedFragments(runtimePassage).map(fragment => ({
        ...fragment,
        publicKey: randomUUID()
    }));
    const difficulty = runtimePassage.difficulty || classifyDifficulty(fragments.length);
    const seconds = timerSeconds(difficulty, fragments.length);
    const now = Date.now();
    const lastCorrectSlot = Number.isInteger(session.lastCorrectSlot) ? session.lastCorrectSlot : null;
    const gridSize = normalizeMemoryGrid(session.gridSize) || 4;
    const challengeDifficulty = normalizeMemoryDifficulty(session.challengeDifficulty) || 'SIMPLE';
    const layout = validateMemoryLayout({ gridSize, fragmentCount: fragments.length });
    if (!layout.valid) throw new OrderLabError(layout.code, layout.message);
    const requestedExternalCount = externalDistractorCount({
        game: 'order', gridSize, difficulty: challengeDifficulty
    });
    const externalFragments = await loadExternalDistractorPool(runtimePassage, requestedExternalCount);
    return {
        passageId: runtimePassage.id,
        passageRevision: Number(runtimePassage.revision),
        passage: passageSummary(runtimePassage),
        sourceText: runtimePassage.sourceText,
        sourceVerses: jsonValue(runtimePassage.sourceVerses, []),
        fragments,
        fragmentIndex: 0,
        options: buildStepOptions(
            fragments, 0, randomUUID, Math.random, lastCorrectSlot,
            gridSize, externalFragments, requestedExternalCount
        ),
        externalFragments,
        disabledTokens: [],
        rejectedFragmentIds: [],
        lastCorrectSlot,
        mistakes: 0,
        fragmentScore: 0,
        activeElapsedMs: 0,
        stageStartedAt: new Date(now).toISOString(),
        deadlineAt: new Date(now + seconds * 1000).toISOString(),
        timerSeconds: seconds,
        difficulty,
        layoutDifficulty: session.layoutDifficulty || 'RANDOM',
        challengeDifficulty,
        gridSize,
        layoutMessage: layout.message,
        dailyDate: session.dailyDate || null,
        dailyIds: session.dailyIds || [],
        seenPassageIds: [...new Set([...(session.seenPassageIds || []), passage.id])],
        lastStageResult: null
    };
}

function resultPassage(state) {
    return {
        ...state.passage,
        verses: state.sourceVerses.map(verse => ({ verse: Number(verse.verse), text: verse.text })),
        fullText: state.sourceText
    };
}

function snapshot(row) {
    const state = jsonValue(row.state, {});
    const status = row.status;
    const isPlaying = status === 'active';
    const response = {
        id: row.id,
        mode: row.mode,
        status,
        ranked: Boolean(row.ranked),
        score: Number(row.score),
        lives: row.lives === null || row.lives === undefined ? MAX_LIVES : Number(row.lives),
        streak: Number(row.streak),
        multiplier: Number(row.multiplier),
        stageNumber: Number(row.stageNumber),
        completedStages: Number(row.completedStages),
        assisted: Boolean(row.assisted),
        passage: state.passage,
        fragmentIndex: Number(state.fragmentIndex || 0),
        fragmentCount: state.fragments?.length || state.passage?.fragmentCount || 0,
        remainingCount: Math.max(0, (state.fragments?.length || 0) - Number(state.fragmentIndex || 0)),
        options: isPlaying ? publicOptions(state.options, state.disabledTokens) : [],
        completedFragments: isPlaying
            ? (state.fragments || []).slice(0, Number(state.fragmentIndex || 0)).map(fragment => fragment.text)
            : [],
        mistakes: Number(state.mistakes || 0),
        hintCount: Number(state.hintCount || 0),
        hintCost: scriptureOrderHintCost(),
        layoutDifficulty: state.layoutDifficulty || 'RANDOM',
        challengeDifficulty: state.challengeDifficulty || 'SIMPLE',
        gridSize: Number(state.gridSize || 4),
        layoutMessage: state.layoutMessage || '',
        timer: isPlaying ? {
            deadlineAt: state.deadlineAt,
            seconds: state.timerSeconds,
            startedAt: state.stageStartedAt,
            elapsedMs: Math.max(0, Date.now() - new Date(state.stageStartedAt).getTime()),
            mode: row.mode === 'practice' ? 'countup' : 'countdown'
        } : null,
        lastStageResult: state.lastStageResult || null,
        dailyDate: state.dailyDate || null,
        reward: state.reward || null,
        rewardPreview: status === 'completed' ? Number(state.reward?.coins || 0) : 0
    };
    if (!isPlaying) response.review = resultPassage(state);
    return response;
}

async function ownedSession(db, sessionId, ownerKey, lock = false) {
    return db.get(`
        SELECT * FROM scripture_order_lab_sessions
        WHERE id = $1 AND owner_key = $2 ${lock ? 'FOR UPDATE' : ''}
    `, [sessionId, ownerKey]);
}

async function saveSession(tx, row, state, overrides = {}) {
    await tx.run(`
        UPDATE scripture_order_lab_sessions SET
            status = $1, ranked = $2, score = $3, lives = $4, streak = $5,
            multiplier = $6, stage_number = $7, completed_stages = $8,
            assisted = $9, state = $10::jsonb, updated_at = CURRENT_TIMESTAMP,
            completed_at = CASE WHEN $1 IN ('completed','failed','abandoned')
                                THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE completed_at END
        WHERE id = $11
    `, [overrides.status ?? row.status, overrides.ranked ?? row.ranked, overrides.score ?? row.score,
        overrides.lives ?? row.lives, overrides.streak ?? row.streak, overrides.multiplier ?? row.multiplier,
        overrides.stageNumber ?? row.stageNumber, overrides.completedStages ?? row.completedStages,
        overrides.assisted ?? row.assisted, JSON.stringify(state), row.id]);
    return tx.get('SELECT * FROM scripture_order_lab_sessions WHERE id = $1', [row.id]);
}

async function storeAction(tx, sessionId, key, type, response) {
    await tx.run(`
        INSERT INTO scripture_order_lab_actions (id, session_id, idempotency_key, action_type, response)
        VALUES ($1, $2, $3, $4, $5::jsonb)
    `, [randomUUID(), sessionId, key, type, JSON.stringify(response)]);
}

async function idempotentSessionAction({ sessionId, actor, key, type, handler }) {
    if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(String(key || ''))) {
        throw new OrderLabError('IDEMPOTENCY_KEY_REQUIRED', '操作識別碼無效');
    }
    return dbOps.gamesDb.transaction(async tx => {
        const row = await ownedSession(tx, sessionId, actor.ownerKey, true);
        if (!row) throw new OrderLabError('SESSION_NOT_FOUND', '找不到這場實驗遊戲', 404);
        const duplicate = await tx.get(`
            SELECT response FROM scripture_order_lab_actions
            WHERE session_id = $1 AND idempotency_key = $2
        `, [sessionId, key]);
        if (duplicate) return jsonValue(duplicate.response, duplicate.response);
        const response = await handler(tx, row);
        await storeAction(tx, sessionId, key, type, response);
        return response;
    });
}

async function personalHistoryForActor(actor, limit = 8) {
    if (!actor) return { totalCompleted: 0, uniquePassages: 0, records: [], recent: [] };
    const boundedLimit = Math.min(20, Math.max(1, Number(limit) || 8));
    const records = await dbOps.gamesDb.query(`
        SELECT p.id, p.title, p.book, p.chapter, p.verse_start, p.verse_end,
               p.difficulty, p.fragment_count, p.revision,
               COUNT(*) AS play_count,
               MIN(r.duration_ms) FILTER (WHERE r.assisted = FALSE) AS best_duration_ms,
               MIN(r.mistakes) FILTER (WHERE r.assisted = FALSE) AS best_mistakes,
               MAX(r.created_at) AS last_played_at
        FROM scripture_order_lab_stage_results r
        JOIN scripture_order_lab_sessions s ON s.id = r.session_id
        JOIN scripture_order_lab_passages p ON p.id = r.passage_id
        WHERE s.owner_key = $1 AND s.mode = 'practice' AND r.status = 'completed'
        GROUP BY p.id, p.title, p.book, p.chapter, p.verse_start, p.verse_end,
                 p.difficulty, p.fragment_count, p.revision
        ORDER BY MAX(r.created_at) DESC
    `, [actor.ownerKey]);
    const recent = await dbOps.gamesDb.query(`
        SELECT p.id, p.title, p.book, p.chapter, p.verse_start, p.verse_end,
               p.difficulty, p.fragment_count, p.revision,
               r.duration_ms, r.mistakes, r.assisted, r.created_at
        FROM scripture_order_lab_stage_results r
        JOIN scripture_order_lab_sessions s ON s.id = r.session_id
        JOIN scripture_order_lab_passages p ON p.id = r.passage_id
        WHERE s.owner_key = $1 AND s.mode = 'practice' AND r.status = 'completed'
        ORDER BY r.created_at DESC
        LIMIT $2
    `, [actor.ownerKey, boundedLimit]);
    return {
        totalCompleted: records.reduce((total, row) => total + Number(row.playCount || 0), 0),
        uniquePassages: records.length,
        records: records.map(row => ({
            passage: passageSummary(row),
            playCount: Number(row.playCount || 0),
            bestDurationMs: Number(row.bestDurationMs || 0),
            bestMistakes: Number(row.bestMistakes || 0),
            lastPlayedAt: row.lastPlayedAt
        })),
        recent: recent.map(row => ({
            passage: passageSummary(row),
            durationMs: Number(row.durationMs || 0),
            mistakes: Number(row.mistakes || 0),
            assisted: Boolean(row.assisted),
            completedAt: row.createdAt
        }))
    };
}

async function finishStage(tx, row, state, { status = 'completed', now = Date.now() } = {}) {
    const scoreParts = status === 'completed'
        ? completionScore(state.deadlineAt, now)
        : { completionBonus: 0, timeBonus: 0, remainingSeconds: 0 };
    const earned = Number(state.fragmentScore || 0) + scoreParts.completionBonus + scoreParts.timeBonus;
    const stageResult = {
        status,
        difficulty: state.difficulty,
        scoreEarned: earned,
        fragmentScore: Number(state.fragmentScore || 0),
        completionBonus: scoreParts.completionBonus,
        timeBonus: scoreParts.timeBonus,
        remainingSeconds: scoreParts.remainingSeconds,
        mistakes: Number(state.mistakes || 0),
        assisted: Boolean(row.assisted),
        durationMs: Math.max(0, now - new Date(state.stageStartedAt).getTime())
    };
    await tx.run(`
        INSERT INTO scripture_order_lab_stage_results
            (id, session_id, stage_number, passage_id, passage_revision, difficulty,
             status, score_earned, fragment_score, completion_bonus, time_bonus,
             mistakes, assisted, duration_ms)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (session_id, stage_number) DO NOTHING
    `, [randomUUID(), row.id, row.stageNumber, state.passageId, state.passageRevision, state.difficulty,
        status === 'completed' ? 'completed' : status, earned, state.fragmentScore || 0,
        scoreParts.completionBonus, scoreParts.timeBonus, state.mistakes || 0,
        Boolean(row.assisted), stageResult.durationMs]);
    if (status === 'completed') {
        state.reward = await settleScriptureMemoryCompletion(tx, {
            userId: row.userId,
            sessionId: row.id,
            game: 'order',
            passage: { version: 'CUV_TRAD', ...state.passage },
            correctCount: Number(state.fragmentIndex || 0),
            fragmentCount: state.fragments?.length || 0,
            elapsedMs: stageResult.durationMs,
            mistakes: stageResult.mistakes,
            challengeSpeed: 'MEDIUM',
            now: new Date(now)
        });
    } else if (state.reward) {
        state.reward = { ...state.reward, awardedNow: false, awardedCoins: 0 };
    }
    state.lastStageResult = stageResult;
    const completedStages = Number(row.completedStages) + (status === 'completed' ? 1 : 0);
    const finalDaily = row.mode === 'daily' && Number(row.stageNumber) >= 3;
    const nextStatus = status !== 'completed' ? 'failed'
        : row.mode === 'practice' || finalDaily ? 'completed' : 'stage_complete';
    return saveSession(tx, row, state, {
        status: nextStatus,
        score: Number(row.score) + scoreParts.completionBonus + scoreParts.timeBonus,
        completedStages
    });
}

export class OrderLabService {
    static actor(req, options) { return actorFromRequest(req, options); }

    static async bootstrap(req) {
        const actor = actorFromRequest(req, { required: false });
        const passages = await officialPassages();
        const date = taipeiDate();
        const ids = await dailySet(date, passages);
        let dailyAttemptsUsed = 0;
        let resumeSession = null;
        if (actor) {
            const usage = await dbOps.gamesDb.get(`
                SELECT COUNT(*) AS value FROM scripture_order_lab_sessions
                WHERE owner_key = $1 AND mode = 'daily' AND ranked = TRUE
                  AND state->>'dailyDate' = $2
            `, [actor.ownerKey, date]);
            dailyAttemptsUsed = Number(usage?.value || 0);
            const resumable = await dbOps.gamesDb.get(`
                SELECT * FROM scripture_order_lab_sessions
                WHERE owner_key = $1 AND mode = 'practice' AND status = 'active'
                ORDER BY updated_at DESC
                LIMIT 1
            `, [actor.ownerKey]);
            resumeSession = resumable ? snapshot(resumable) : null;
        }
        return {
            enabled: true,
            labVersion: ORDER_LAB_VERSION,
            version: { id: 'CUV_TRAD', name: '和合本' },
            passages: passages.map(passageSummary),
            modes: ORDER_LAB_MODES,
            layoutDifficulties: ORDER_LAYOUT_DIFFICULTIES,
            challengeDifficulties: ['SIMPLE', 'MEDIUM', 'HARD'],
            gridSizes: [4, 9],
            tags: ORDER_LAB_TAGS,
            hintCost: scriptureOrderHintCost(),
            practiceRankings: await OrderLabService.practiceRankings(),
            personalHistory: await personalHistoryForActor(actor),
            resumeSession,
            daily: {
                date,
                passageIds: ids,
                rankedAttemptsUsed: dailyAttemptsUsed,
                rankedAttemptsRemaining: Math.max(0, DAILY_RANKED_ATTEMPTS - dailyAttemptsUsed)
            },
            disclaimer: '實驗分數與獎勵不會影響正式帳號'
        };
    }

    static async passages() {
        return (await officialPassages()).map(passageSummary);
    }

    static async personalHistory(req, input = {}) {
        return personalHistoryForActor(actorFromRequest(req), input.limit);
    }

    static async chapter(input) {
        return loadChapter(input);
    }

    static async customPreview(input) {
        const passage = await createCustomPassage(input);
        const fragments = orderedFragments(passage).map((fragment, index) => {
            const visibleLength = Array.from(fragment.text.replace(/[\p{P}\p{S}\s]/gu, '')).length;
            return {
                index: index + 1,
                text: fragment.text,
                visibleLength,
                withinMemoryLimit: visibleLength <= 10
            };
        });
        return {
            passage: passageSummary(passage),
            verses: jsonValue(passage.sourceVerses, []).map(verse => ({
                verse: Number(verse.verse),
                text: String(verse.text || '')
            })),
            fragments,
            maximumVisibleLength: 10,
            withinMemoryLimit: fragments.every(fragment => fragment.withinMemoryLimit),
            exactReassembly: verifyFragments(passage.sourceText, fragments),
            practiceOnly: true,
            segmentationReview: passage.segmentationReview || { state: 'RULES_ONLY' }
        };
    }

    static async createSession(req, input) {
        const actor = actorFromRequest(req);
        const mode = String(input.mode || 'practice');
        if (!ORDER_LAB_MODES.includes(mode)) throw new OrderLabError('INVALID_MODE', '遊戲模式無效');
        const layoutDifficulty = String(input.layoutDifficulty || 'RANDOM').toUpperCase();
        if (!ORDER_LAYOUT_DIFFICULTIES.includes(layoutDifficulty)) {
            throw new OrderLabError('INVALID_LAYOUT_DIFFICULTY', '四宮格難度無效');
        }
        const challengeDifficulty = normalizeMemoryDifficulty(input.challengeDifficulty);
        if (!challengeDifficulty) throw new OrderLabError('INVALID_CHALLENGE_DIFFICULTY', '挑戰難度無效');
        const gridSize = normalizeMemoryGrid(input.gridSize);
        if (!gridSize) throw new OrderLabError('INVALID_GRID_SIZE', '請選擇四宮格或九宮格');
        const clientSessionKey = String(input.clientSessionKey || '');
        if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(clientSessionKey)) {
            throw new OrderLabError('CLIENT_SESSION_KEY_REQUIRED', '開局識別碼無效');
        }
        const duplicate = await dbOps.gamesDb.get(`
            SELECT * FROM scripture_order_lab_sessions WHERE owner_key = $1 AND client_session_key = $2
        `, [actor.ownerKey, clientSessionKey]);
        if (duplicate) return snapshot(duplicate);

        let passages = await officialPassages();
        let requestedId = input.passageId || null;
        if (input.customRange) {
            if (mode !== 'practice') throw new OrderLabError('CUSTOM_PRACTICE_ONLY', '自選經文目前只支援單關挑戰');
            const custom = await createCustomPassage(input.customRange);
            passages = [...passages, custom];
            requestedId = custom.id;
        }
        const date = taipeiDate();
        const dailyIds = mode === 'daily' ? await dailySet(date, passages) : [];
        const passage = choosePassage(passages, { mode, stageNumber: 1, dailyIds, requestedId });
        const layout = validateMemoryLayout({ gridSize, fragmentCount: Number(passage.fragmentCount) });
        if (!layout.valid) throw new OrderLabError(layout.code, layout.message);
        let ranked = mode !== 'practice';
        if (mode === 'daily') {
            const count = await dbOps.gamesDb.get(`
                SELECT COUNT(*) AS value FROM scripture_order_lab_sessions
                WHERE owner_key = $1 AND mode = 'daily' AND ranked = TRUE
                  AND state->>'dailyDate' = $2
            `, [actor.ownerKey, date]);
            ranked = Number(count?.value || 0) < DAILY_RANKED_ATTEMPTS;
        }
        const id = randomUUID();
        const base = {
            dailyDate: mode === 'daily' ? date : null,
            dailyIds,
            seenPassageIds: [],
            layoutDifficulty,
            challengeDifficulty,
            gridSize
        };
        const state = await stageState(passage, base);
        await dbOps.gamesDb.run(`
            INSERT INTO scripture_order_lab_sessions
                (id, user_id, owner_key, client_session_key, mode, ranked, lives, state)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
        `, [id, actor.userId, actor.ownerKey, clientSessionKey, mode, ranked,
            MAX_LIVES, JSON.stringify(state)]);
        return snapshot(await dbOps.gamesDb.get('SELECT * FROM scripture_order_lab_sessions WHERE id = $1', [id]));
    }

    static async select(req, sessionId, input) {
        const actor = actorFromRequest(req);
        const action = String(input.action || 'select');
        return idempotentSessionAction({
            sessionId, actor, key: input.idempotencyKey, type: action,
            handler: async (tx, row) => {
                const state = jsonValue(row.state, {});
                if (state.reward) state.reward = { ...state.reward, awardedNow: false, awardedCoins: 0 };
                if (action === 'continue') {
                    if (row.status !== 'stage_complete') throw new OrderLabError('STAGE_NOT_READY', '目前無法進入下一關', 409);
                    const passages = await officialPassages();
                    const nextStage = Number(row.stageNumber) + 1;
                    const passage = choosePassage(passages, {
                        mode: row.mode,
                        stageNumber: nextStage,
                        seenIds: state.seenPassageIds,
                        dailyIds: state.dailyIds
                    });
                    let lives = row.lives;
                    if (row.mode === 'endless' && Number(row.completedStages) > 0 && Number(row.completedStages) % 5 === 0) {
                        lives = Math.min(MAX_LIVES, Number(lives) + 1);
                    }
                    const nextState = await stageState(passage, state);
                    return snapshot(await saveSession(tx, row, nextState, {
                        status: 'active', stageNumber: nextStage, lives,
                        streak: 0, multiplier: 1
                    }));
                }
                if (row.status !== 'active') return snapshot(row);

                const now = Date.now();
                const expired = now > new Date(state.deadlineAt).getTime();
                if ((action === 'timeout' || expired) && row.mode !== 'practice') {
                    return snapshot(await finishStage(tx, row, state, { status: 'timeout', now }));
                }
                if (action === 'timeout') return snapshot(row);
                if (action !== 'select') throw new OrderLabError('INVALID_ACTION', '無效的操作');

                const token = String(input.optionToken || '');
                const option = state.options.find(candidate => candidate.token === token);
                if (!option || state.disabledTokens.includes(token)) {
                    throw new OrderLabError('INVALID_OPTION', '這個選項已失效，請依最新畫面操作', 409);
                }
                if (!option.isCorrect) {
                    state.mistakes = Number(state.mistakes || 0) + 1;
                    state.activeElapsedMs = Math.max(0, now - new Date(state.stageStartedAt).getTime());
                    if (row.mode === 'practice') {
                        state.rejectedFragmentIds = [...new Set([
                            ...(state.rejectedFragmentIds || []),
                            option.fragmentId
                        ])];
                        state.options = rotateWrongOption({
                            fragments: state.fragments,
                            currentIndex: Number(state.fragmentIndex),
                            options: state.options,
                            wrongToken: token,
                            rejectedFragmentIds: state.rejectedFragmentIds,
                            distractorPool: state.externalFragments || []
                        });
                        state.disabledTokens = [];
                    } else {
                        state.disabledTokens.push(token);
                    }
                    const lives = Math.max(0, Number(row.lives ?? MAX_LIVES) - 1);
                    const updated = await saveSession(tx, row, state, { lives, streak: 0, multiplier: 1 });
                    if (lives <= 0) {
                        return snapshot(await finishStage(tx, updated, state, { status: 'failed', now }));
                    }
                    return snapshot(updated);
                }

                const scoring = scoreCorrect({ score: row.score, streak: row.streak, multiplier: row.multiplier });
                state.lastCorrectSlot = Number.isInteger(option.slot)
                    ? option.slot
                    : state.options.findIndex(candidate => candidate.token === option.token);
                state.fragmentScore = Number(state.fragmentScore || 0) + scoring.points;
                state.fragmentIndex = Number(state.fragmentIndex) + 1;
                state.reward = await awardScriptureMemoryProgress(tx, {
                    userId: row.userId,
                    sessionId: row.id,
                    game: 'order',
                    passage: { version: 'CUV_TRAD', ...state.passage },
                    correctCount: state.fragmentIndex,
                    fragmentCount: state.fragments?.length || 0,
                    now: new Date(now)
                });
                state.activeElapsedMs = Math.max(0, now - new Date(state.stageStartedAt).getTime());
                state.disabledTokens = [];
                state.rejectedFragmentIds = [];
                if (state.fragmentIndex >= state.fragments.length) {
                    const scoredRow = { ...row, score: scoring.score, streak: scoring.streak, multiplier: scoring.multiplier };
                    return snapshot(await finishStage(tx, scoredRow, state, { status: 'completed', now }));
                }
                state.options = buildStepOptions(
                    state.fragments,
                    state.fragmentIndex,
                    randomUUID,
                    Math.random,
                    state.lastCorrectSlot
                    , Number(state.gridSize || 4)
                    , state.externalFragments || []
                    , externalDistractorCount({
                        game: 'order',
                        gridSize: Number(state.gridSize || 4),
                        difficulty: state.challengeDifficulty || 'SIMPLE'
                    })
                );
                return snapshot(await saveSession(tx, row, state, {
                    score: scoring.score,
                    streak: scoring.streak,
                    multiplier: scoring.multiplier
                }));
            }
        });
    }

    static async demo(req, sessionId, input) {
        const actor = actorFromRequest(req);
        return idempotentSessionAction({
            sessionId, actor, key: input.idempotencyKey, type: 'demo',
            handler: async (tx, row) => {
                if (row.status !== 'active') throw new OrderLabError('SESSION_NOT_ACTIVE', '目前無法觀看示範', 409);
                if (row.mode !== 'practice' && Number(row.lives) < 2) {
                    throw new OrderLabError('DEMO_REQUIRES_TWO_LIVES', '至少需要兩顆心才能使用示範', 409);
                }
                const state = jsonValue(row.state, {});
                const durationMs = Math.min(12000, state.fragments.length * DEMO_FRAGMENT_MS);
                state.deadlineAt = new Date(new Date(state.deadlineAt).getTime() + durationMs).toISOString();
                const updated = await saveSession(tx, row, state, {
                    lives: row.mode === 'practice' ? row.lives : Number(row.lives) - 1,
                    streak: 0,
                    multiplier: 1,
                    assisted: true
                });
                return {
                    session: snapshot(updated),
                    demonstration: {
                        fragments: state.fragments.map(fragment => fragment.text),
                        durationMs
                    }
                };
            }
        });
    }

    static async resume(req, sessionId, input) {
        const actor = actorFromRequest(req);
        return idempotentSessionAction({
            sessionId, actor, key: input.idempotencyKey, type: 'resume',
            handler: async (tx, row) => {
                if (row.mode !== 'practice' || row.status !== 'active') {
                    throw new OrderLabError('SESSION_NOT_RESUMABLE', '這次挑戰已無法繼續', 409);
                }
                const state = jsonValue(row.state, {});
                const elapsedMs = Math.max(0, Number(state.activeElapsedMs || 0));
                const now = Date.now();
                state.stageStartedAt = new Date(now - elapsedMs).toISOString();
                state.deadlineAt = new Date(now + Number(state.timerSeconds || 0) * 1000).toISOString();
                return snapshot(await saveSession(tx, row, state, { lives: row.lives ?? MAX_LIVES }));
            }
        });
    }

    static async hint(req, sessionId, input) {
        const actor = actorFromRequest(req);
        return idempotentSessionAction({
            sessionId, actor, key: input.idempotencyKey, type: 'hint',
            handler: async (tx, row) => {
                if (row.mode !== 'practice' || row.status !== 'active') {
                    throw new OrderLabError('SESSION_NOT_HINTABLE', '目前無法使用高光提示', 409);
                }
                const state = jsonValue(row.state, {});
                const correct = state.options?.find(option => option.isCorrect);
                if (!correct) throw new OrderLabError('HINT_NOT_AVAILABLE', '目前沒有可提示的片段', 409);
                const cost = scriptureOrderHintCost();
                const fragmentIndex = Number(state.fragmentIndex || 0);
                if (Number.isInteger(state.lastHintedFragmentIndex)
                    && state.lastHintedFragmentIndex === fragmentIndex) {
                    return {
                        session: snapshot(row),
                        hint: {
                            optionToken: correct.token,
                            cost: 0,
                            balance: null,
                            charged: false,
                            alreadyRevealed: true,
                            guestDebitRequired: false
                        }
                    };
                }
                let debit = null;
                if (actor.userId) {
                    debit = await applyCoinDeltaTx(tx, {
                        userId: actor.userId,
                        delta: -cost,
                        reasonCode: 'spend_scripture_order_hint',
                        sourceId: row.id,
                        idempotencyKey: `scripture-order:hint:${actor.userId}:${row.id}:${input.idempotencyKey}`,
                        metadata: { game: 'scripture_order', sessionId: row.id }
                    });
                }
                state.lastHintedFragmentIndex = fragmentIndex;
                state.hintCount = Number(state.hintCount || 0) + 1;
                state.activeElapsedMs = Math.max(0, Date.now() - new Date(state.stageStartedAt).getTime());
                const updated = await saveSession(tx, row, state, { assisted: true });
                return {
                    session: snapshot(updated),
                    hint: {
                        optionToken: correct.token,
                        cost,
                        balance: debit?.balance ?? null,
                        charged: true,
                        alreadyRevealed: false,
                        guestDebitRequired: !actor.userId
                    }
                };
            }
        });
    }

    static async abandon(req, sessionId, input) {
        const actor = actorFromRequest(req);
        return idempotentSessionAction({
            sessionId, actor, key: input.idempotencyKey, type: 'abandon',
            handler: async (tx, row) => {
                if (!['active', 'stage_complete'].includes(row.status)) return snapshot(row);
                return snapshot(await saveSession(tx, row, jsonValue(row.state, {}), { status: 'abandoned' }));
            }
        });
    }

    static async forfeit(req, sessionId, input) {
        const actor = actorFromRequest(req);
        return idempotentSessionAction({
            sessionId, actor, key: input.idempotencyKey, type: 'forfeit',
            handler: async (tx, row) => {
                if (row.status !== 'active') return snapshot(row);
                return snapshot(await finishStage(tx, row, jsonValue(row.state, {}), {
                    status: 'failed'
                }));
            }
        });
    }

    static async publish(req, sessionId, input) {
        const actor = actorFromRequest(req);
        if (!actor.userId) throw new OrderLabError('MEMBER_REQUIRED', '登入會員後才能登上實驗英雄榜', 401);
        const nickname = String(input.nickname || '').trim();
        const tag = String(input.tag || '');
        if (Array.from(nickname).length < 2 || Array.from(nickname).length > 12) {
            throw new OrderLabError('INVALID_NICKNAME', '暱稱須為 2 至 12 個字');
        }
        if (!ORDER_LAB_TAGS.includes(tag)) throw new OrderLabError('INVALID_TAG', '請選擇有效的情緒標籤');
        return idempotentSessionAction({
            sessionId, actor, key: input.idempotencyKey, type: 'publish',
            handler: async (tx, row) => {
                if (!['completed', 'failed'].includes(row.status) || !row.ranked || row.assisted) {
                    throw new OrderLabError('SESSION_NOT_RANKABLE', '這場結果不符合實驗英雄榜資格', 409);
                }
                const state = jsonValue(row.state, {});
                const scopeKey = row.mode === 'daily' ? `daily:${state.dailyDate}` : `endless:${ORDER_LAB_VERSION}`;
                const total = await tx.get(`
                    SELECT COALESCE(SUM(duration_ms), 0) AS value
                    FROM scripture_order_lab_stage_results WHERE session_id = $1
                `, [row.id]);
                await tx.run(`
                    INSERT INTO scripture_order_lab_leaderboard
                        (id, scope_key, user_id, session_id, nickname, tag, score, lives_remaining, duration_ms)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                    ON CONFLICT (scope_key, user_id) DO UPDATE SET
                        session_id = CASE WHEN EXCLUDED.score > scripture_order_lab_leaderboard.score THEN EXCLUDED.session_id ELSE scripture_order_lab_leaderboard.session_id END,
                        nickname = EXCLUDED.nickname, tag = EXCLUDED.tag,
                        score = GREATEST(scripture_order_lab_leaderboard.score, EXCLUDED.score),
                        lives_remaining = CASE WHEN EXCLUDED.score >= scripture_order_lab_leaderboard.score THEN EXCLUDED.lives_remaining ELSE scripture_order_lab_leaderboard.lives_remaining END,
                        duration_ms = CASE WHEN EXCLUDED.score >= scripture_order_lab_leaderboard.score THEN EXCLUDED.duration_ms ELSE scripture_order_lab_leaderboard.duration_ms END,
                        updated_at = CURRENT_TIMESTAMP
                `, [randomUUID(), scopeKey, actor.userId, row.id, nickname, tag, row.score, row.lives, Number(total?.value || 0)]);
                return { published: true, scopeKey, labOnly: true };
            }
        });
    }

    static async leaderboard(scope = 'daily') {
        const scopeKey = scope === 'endless' ? `endless:${ORDER_LAB_VERSION}` : `daily:${taipeiDate()}`;
        const rows = await dbOps.gamesDb.query(`
            SELECT nickname, tag, score, lives_remaining, duration_ms, updated_at
            FROM scripture_order_lab_leaderboard WHERE scope_key = $1
            ORDER BY score DESC, lives_remaining DESC NULLS LAST, duration_ms, updated_at LIMIT 20
        `, [scopeKey]);
        return { scopeKey, labOnly: true, results: rows };
    }

    static async practiceRankings() {
        const rows = await dbOps.gamesDb.query(`
            SELECT p.*, grouped.layout_difficulty, grouped.play_count,
                   grouped.best_duration_ms, grouped.average_duration_ms
            FROM (
                SELECT r.passage_id,
                       COALESCE(NULLIF(s.state->>'layoutDifficulty', ''), 'RANDOM') AS layout_difficulty,
                       COUNT(*)::integer AS play_count,
                       MIN(r.duration_ms)::integer AS best_duration_ms,
                       ROUND(AVG(r.duration_ms))::integer AS average_duration_ms
                FROM scripture_order_lab_stage_results r
                JOIN scripture_order_lab_sessions s ON s.id = r.session_id
                WHERE r.status = 'completed' AND s.mode = 'practice'
                GROUP BY r.passage_id, COALESCE(NULLIF(s.state->>'layoutDifficulty', ''), 'RANDOM')
            ) grouped
            JOIN scripture_order_lab_passages p ON p.id = grouped.passage_id
            WHERE p.is_official = TRUE AND p.is_published = TRUE
        `);
        const grouped = new Map();
        for (const row of rows) {
            const item = grouped.get(row.id) || {
                passage: passageSummary(row),
                playCount: 0,
                bestDurationMs: null,
                averageDurationMs: 0,
                weightedDurationMs: 0,
                difficulties: {}
            };
            const playCount = Number(row.playCount || 0);
            const bestDurationMs = Number(row.bestDurationMs || 0);
            const averageDurationMs = Number(row.averageDurationMs || 0);
            item.playCount += playCount;
            item.bestDurationMs = item.bestDurationMs === null
                ? bestDurationMs
                : Math.min(item.bestDurationMs, bestDurationMs);
            item.weightedDurationMs += averageDurationMs * playCount;
            item.difficulties[row.layoutDifficulty] = {
                playCount,
                bestDurationMs,
                averageDurationMs
            };
            grouped.set(row.id, item);
        }
        return [...grouped.values()]
            .map(item => ({
                passage: item.passage,
                playCount: item.playCount,
                bestDurationMs: item.bestDurationMs,
                averageDurationMs: item.playCount > 0
                    ? Math.round(item.weightedDurationMs / item.playCount)
                    : 0,
                difficulties: item.difficulties
            }))
            .sort((left, right) => right.playCount - left.playCount
                || left.passage.title.localeCompare(right.passage.title, 'zh-Hant'))
            .slice(0, 10);
    }

    static async createShare(req, input) {
        const actor = actorFromRequest(req);
        if (!actor.userId) throw new OrderLabError('MEMBER_REQUIRED', '登入會員後才能建立實驗分享', 401);
        const session = await ownedSession(dbOps.gamesDb, input.sessionId, actor.ownerKey);
        if (!session || !['completed', 'stage_complete', 'failed'].includes(session.status)) {
            throw new OrderLabError('SHARE_RESULT_REQUIRED', '完成一關後才能建立分享', 409);
        }
        const state = jsonValue(session.state, {});
        const token = randomBytes(18).toString('base64url');
        await dbOps.gamesDb.run(`
            INSERT INTO scripture_order_lab_shares
                (token, creator_user_id, passage_id, passage_revision, difficulty, inviter_score, expires_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [token, actor.userId, state.passageId, state.passageRevision, state.difficulty,
            session.score, new Date(Date.now() + SHARE_LIFETIME_MS).toISOString()]);
        return { token, path: `/scripture-tools/order.html?share=${token}`, expiresInDays: 30, labOnly: true };
    }

    static async getShare(token) {
        const share = await dbOps.gamesDb.get(`
            SELECT s.*, p.title, p.book, p.chapter, p.verse_start, p.verse_end, p.fragment_count
            FROM scripture_order_lab_shares s
            JOIN scripture_order_lab_passages p ON p.id = s.passage_id
            WHERE s.token = $1 AND s.expires_at > CURRENT_TIMESTAMP
        `, [token]);
        if (!share) throw new OrderLabError('SHARE_NOT_FOUND', '這個實驗分享不存在或已過期', 404);
        return {
            token: share.token,
            passage: passageSummary(share),
            difficulty: share.difficulty,
            inviterScoreHidden: true,
            labOnly: true
        };
    }
}

export default OrderLabService;
