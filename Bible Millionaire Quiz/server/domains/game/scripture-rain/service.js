import { randomUUID } from 'node:crypto';
import { dbOps } from '../../../database/index.js';
import { bibleTranslator } from '../../../utils/bibleTranslator.js';
import { applyCoinDeltaTx } from '../../economy/AssetLedgerService.js';
import { presentBibleChapterVerses } from '../../content/bible/BibleTextPresentation.js';
import {
    sha256,
    stripEditorialAnnotations,
    validateCustomRange,
    verifyFragments
} from '../../scripture-tools/order-engine.js';
import { resolvePassageSegmentation } from '../../scripture-tools/segmentation-cruise-service.js';
import {
    externalDistractorCount,
    normalizeChallengeSpeed,
    normalizeMemoryDifficulty
} from '../../scripture-tools/scripture-memory-rules.js';
import {
    awardScriptureMemoryProgress,
    settleScriptureMemoryCompletion
} from '../../scripture-tools/scripture-memory-reward-service.js';
import {
    isCorrectRainSelection,
    SCRIPTURE_RAIN_PASSAGES,
    SCRIPTURE_RAIN_VERSION
} from './engine.js';

export class ScriptureRainError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'ScriptureRainError';
        this.code = code;
        this.status = status;
    }
}

export function scriptureRainHintCost() {
    const configured = Number.parseInt(process.env.SCRIPTURE_RAIN_HINT_COST || '5', 10);
    return Number.isSafeInteger(configured) && configured >= 1 && configured <= 50 ? configured : 5;
}

function passageReference(passage) {
    const bookName = bibleTranslator.toChinese(passage.book) || passage.book;
    return `${bookName} ${passage.chapter}:${passage.verseStart}–${passage.verseEnd}`;
}

function passageSummary(passage) {
    return {
        id: passage.id,
        title: passage.title,
        reference: passageReference(passage),
        level: passage.level,
        version: 'CUV_TRAD',
        custom: Boolean(passage.custom),
        fragmentCount: Number(passage.fragmentCount || 0) || undefined,
        book: passage.book,
        chapter: Number(passage.chapter),
        verseStart: Number(passage.verseStart),
        verseEnd: Number(passage.verseEnd)
    };
}

function jsonValue(value, fallback) {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return fallback; }
}

function actorFromRequest(req) {
    if (req.user?.userId) return { userId: req.user.userId, ownerKey: `user:${req.user.userId}` };
    const key = String(req.get('X-Scripture-Guest-Key') || '').trim();
    if (!/^[A-Za-z0-9_-]{16,128}$/u.test(key)) {
        throw new ScriptureRainError('GUEST_KEY_REQUIRED', '需要有效的訪客識別碼', 401);
    }
    return { userId: null, ownerKey: `guest:${sha256(key)}` };
}

async function loadExternalFragments(passage, minimumCount) {
    if (minimumCount <= 0) return [];
    const output = [];
    const seen = new Set();
    const add = (id, text) => {
        const value = stripEditorialAnnotations(text);
        const visible = value.replace(/[\p{P}\p{S}\s]/gu, '');
        if (!visible || seen.has(visible)) return;
        seen.add(visible);
        output.push({ id: `rain-external:${id}`, text: value, external: true });
    };
    const entries = await dbOps.gamesDb.query(`
        SELECT entry_key, fragments FROM scripture_segmentation_entries
        WHERE version = 'CUV_TRAD' AND active = TRUE
          AND health_state IN ('VALID', 'VALID_LONG')
          AND NOT (book = $1 AND chapter = $2 AND verse BETWEEN $3 AND $4)
        ORDER BY RANDOM() LIMIT 24
    `, [passage.book, passage.chapter, passage.verseStart, passage.verseEnd]).catch(() => []);
    for (const entry of entries) {
        jsonValue(entry.fragments, []).forEach((text, index) => add(`${entry.entryKey}:${index}`, text));
        if (output.length >= Math.max(8, minimumCount * 3)) break;
    }
    if (output.length < minimumCount) {
        const passages = await dbOps.gamesDb.query(`
            SELECT id, fragments FROM scripture_order_lab_passages
            WHERE NOT (
                book = $1 AND chapter = $2
                AND verse_start <= $4 AND verse_end >= $3
            )
              AND audit_state IN ('DETERMINISTIC_PASS', 'PASS')
            ORDER BY RANDOM() LIMIT 12
        `, [passage.book, passage.chapter, passage.verseStart, passage.verseEnd]).catch(() => []);
        passages.forEach(row => jsonValue(row.fragments, []).forEach((fragment, index) => add(
            `${row.id}:${index}`, typeof fragment === 'string' ? fragment : fragment?.text
        )));
    }
    return output;
}

function rainSnapshot(row) {
    const passage = jsonValue(row.passage, {});
    const fragments = jsonValue(row.fragments, []);
    const currentIndex = Number(row.currentIndex || 0);
    const startedAt = row.startedAt ? new Date(row.startedAt).getTime() : null;
    const completedAt = row.completedAt ? new Date(row.completedAt).getTime() : null;
    return {
        id: row.id,
        status: row.status,
        passage,
        verses: jsonValue(row.verses, []),
        fullText: row.fullText,
        fragments,
        externalFragments: jsonValue(row.externalFragments, []),
        fragmentCount: fragments.length,
        currentIndex,
        remainingCount: Math.max(0, fragments.length - currentIndex),
        difficulty: row.difficulty,
        challengeSpeed: row.challengeSpeed || row.challenge_speed || 'MEDIUM',
        lives: Number(row.lives),
        mistakes: Number(row.mistakes || 0),
        startedAt: row.startedAt || null,
        elapsedMs: startedAt ? Math.max(0, (completedAt || Date.now()) - startedAt) : 0,
        reward: jsonValue(row.reward, null),
        hintCost: scriptureRainHintCost(),
        version: SCRIPTURE_RAIN_VERSION,
        rewardsEnabled: true
    };
}

async function ownedRainSession(db, id, ownerKey, lock = false) {
    return db.get(`SELECT * FROM scripture_rain_sessions
        WHERE id = $1 AND owner_key = $2 ${lock ? 'FOR UPDATE' : ''}`, [id, ownerKey]);
}

async function idempotentRainAction({ actor, sessionId, key, type, handler }) {
    if (!/^[A-Za-z0-9:_-]{8,128}$/u.test(String(key || ''))) {
        throw new ScriptureRainError('IDEMPOTENCY_KEY_REQUIRED', '操作識別碼無效');
    }
    return dbOps.gamesDb.transaction(async tx => {
        const row = await ownedRainSession(tx, sessionId, actor.ownerKey, true);
        if (!row) throw new ScriptureRainError('SESSION_NOT_FOUND', '找不到這場經文雨', 404);
        const duplicate = await tx.get(`SELECT response FROM scripture_rain_actions
            WHERE session_id = $1 AND idempotency_key = $2`, [sessionId, key]);
        if (duplicate) return jsonValue(duplicate.response, duplicate.response);
        const response = await handler(tx, row);
        await tx.run(`INSERT INTO scripture_rain_actions
            (id, session_id, idempotency_key, action_type, response)
            VALUES ($1,$2,$3,$4,$5::jsonb)`, [randomUUID(), sessionId, key, type, JSON.stringify(response)]);
        return response;
    });
}

async function loadPassage(passage) {
    const englishBook = bibleTranslator.toEnglish(passage.book);
    if (!bibleTranslator.isKnownBook(englishBook)) {
        throw new ScriptureRainError('INVALID_BIBLE_BOOK', '書卷名稱無效');
    }
    const rows = await dbOps.contentDb.query(`
        SELECT id, book, chapter, verse, text, metadata
        FROM bible_verses
        WHERE version = 'CUV_TRAD' AND book = $1 AND chapter = $2
        ORDER BY verse
    `, [englishBook, passage.chapter]);

    const canonical = presentBibleChapterVerses(rows).filter(verse => (
        Number(verse.verseEnd ?? verse.verse) >= passage.verseStart
        && Number(verse.verseStart ?? verse.verse) <= passage.verseEnd
    ));
    const coveredVerses = new Set(canonical.flatMap(verse => verse.coveredVerses || [verse.verse]));
    const missingVerse = Array.from(
        { length: passage.verseEnd - passage.verseStart + 1 },
        (_, index) => passage.verseStart + index
    ).find(verse => !coveredVerses.has(verse));
    if (missingVerse) {
        throw new ScriptureRainError('PASSAGE_INCOMPLETE', '正式和合本缺少此題所需經節', 422);
    }

    const verses = canonical.map(row => {
        const verseNumber = Number(row.verse);
        return {
            verse: verseNumber,
            text: stripEditorialAnnotations(row.text)
        };
    });
    if (verses.some(verse => !verse.text)) {
        throw new ScriptureRainError('PASSAGE_TEXT_EMPTY', '正式經文含有空白內容', 422);
    }
    return verses;
}

function customPassage(input = {}) {
    const range = validateCustomRange(input, { min: 1, max: 20 });
    if (!range.valid) {
        throw new ScriptureRainError(range.code, '自選範圍必須是同章連續 1 至 20 節');
    }
    const book = bibleTranslator.toEnglish(input.book);
    if (!bibleTranslator.isKnownBook(book)) {
        throw new ScriptureRainError('INVALID_BIBLE_BOOK', '書卷名稱無效');
    }
    return {
        id: `rain-custom-${book}-${range.chapter}-${range.verseStart}-${range.verseEnd}`,
        title: '自選經文',
        book,
        chapter: range.chapter,
        verseStart: range.verseStart,
        verseEnd: range.verseEnd,
        level: '自選',
        custom: true
    };
}

function passageFromRequest(input) {
    const request = typeof input === 'string' ? { passageId: input } : (input || {});
    if (request.customRange) return customPassage(request.customRange);
    const passage = SCRIPTURE_RAIN_PASSAGES.find(item => item.id === String(request.passageId || ''));
    if (!passage) throw new ScriptureRainError('PASSAGE_NOT_FOUND', '找不到指定的經文雨題目', 404);
    return passage;
}

export async function scriptureRainChapter(input = {}) {
    const book = bibleTranslator.toEnglish(input.book);
    const chapter = Number(input.chapter);
    if (!bibleTranslator.isKnownBook(book)) throw new ScriptureRainError('INVALID_BIBLE_BOOK', '書卷名稱無效');
    if (!Number.isSafeInteger(chapter) || chapter < 1 || chapter > 150) {
        throw new ScriptureRainError('INVALID_BIBLE_CHAPTER', '章節無效');
    }
    const rows = presentBibleChapterVerses(await dbOps.contentDb.query(`
        SELECT id, book, chapter, verse, text, metadata
        FROM bible_verses
        WHERE version = 'CUV_TRAD' AND book = $1 AND chapter = $2
        ORDER BY verse
    `, [book, chapter]));
    if (!rows.length) throw new ScriptureRainError('PASSAGE_NOT_FOUND', '找不到所選章節的正式和合本經文', 404);
    return {
        version: { id: 'CUV_TRAD', name: '和合本' },
        book,
        bookName: bibleTranslator.toChinese(book),
        chapter,
        verses: rows.map(row => ({
            verse: row.verse,
            verseStart: row.verseStart,
            verseEnd: row.verseEnd,
            verseLabel: row.verseLabel,
            coveredVerses: row.coveredVerses,
            text: stripEditorialAnnotations(row.text)
        }))
    };
}

export function scriptureRainBootstrap() {
    return {
        version: SCRIPTURE_RAIN_VERSION,
        translation: { id: 'CUV_TRAD', name: '和合本（繁體）' },
        hintCost: scriptureRainHintCost(),
        lives: 3,
        passages: SCRIPTURE_RAIN_PASSAGES.map(passageSummary),
        difficulties: ['SIMPLE', 'MEDIUM', 'HARD'],
        labOnly: false,
        rewardsEnabled: true,
        leaderboardEnabled: false
    };
}

async function prepareRainPassage(input) {
    const passage = passageFromRequest(input);
    const verses = await loadPassage(passage);
    const sourceText = verses.map(verse => verse.text).join('');
    const segmentation = await resolvePassageSegmentation({
        version: 'CUV_TRAD',
        book: passage.book,
        chapter: passage.chapter,
        verses
    });
    let fragmentIndex = 0;
    const fragments = segmentation.perVerse.flatMap((segmentedVerse, verseIndex) =>
        segmentedVerse.fragments.map(text => ({
            id: `f${fragmentIndex += 1}`,
            text,
            verse: Number(verses[verseIndex].verse)
        }))
    );
    if (passage.custom && fragments.length < 6) {
        throw new ScriptureRainError(
            'PASSAGE_FRAGMENT_COUNT_TOO_LOW',
            `這段經文只能形成 ${fragments.length} 個健康片段，請多選幾節，至少需要 6 個片段。`,
            422
        );
    }
    if (!verifyFragments(sourceText, fragments)) {
        throw new ScriptureRainError('FRAGMENT_REASSEMBLY_FAILED', '經文切分未通過逐字重組驗證', 500);
    }
    const oversized = fragments.filter(fragment =>
        Array.from(fragment.text.replace(/[\p{P}\p{S}\s]/gu, '')).length > 10
    );
    if (oversized.length) {
        throw new ScriptureRainError('PASSAGE_SEGMENTATION_TOO_LONG', '這段經文仍有過長片段，請重新產生新版切片', 422);
    }
    return {
        passage: { ...passage, fragmentCount: fragments.length },
        verses,
        sourceText,
        fragments
    };
}

export async function scriptureRainPreview(input) {
    const prepared = await prepareRainPassage(input);
    return {
        passage: passageSummary(prepared.passage),
        verses: prepared.verses,
        fullText: prepared.sourceText,
        fragmentCount: prepared.fragments.length,
        withinMemoryLimit: true,
        exactReassembly: true
    };
}

export async function createScriptureRainSession(req, input) {
    const actor = actorFromRequest(req);
    const difficulty = normalizeMemoryDifficulty(input?.challengeDifficulty);
    if (!difficulty) throw new ScriptureRainError('INVALID_CHALLENGE_DIFFICULTY', '挑戰難度無效');
    const challengeSpeed = normalizeChallengeSpeed(input?.challengeSpeed || 'SLOW') || 'SLOW';
    const clientSessionKey = String(input?.clientSessionKey || '');
    if (!/^[A-Za-z0-9:_-]{8,128}$/u.test(clientSessionKey)) {
        throw new ScriptureRainError('CLIENT_SESSION_KEY_REQUIRED', '開局識別碼無效');
    }
    const duplicate = await dbOps.gamesDb.get(`SELECT * FROM scripture_rain_sessions
        WHERE owner_key = $1 AND client_session_key = $2`, [actor.ownerKey, clientSessionKey]);
    if (duplicate) return rainSnapshot(duplicate);
    const { passage: preparedPassage, verses, sourceText, fragments } = await prepareRainPassage(input);
    const externalCount = externalDistractorCount({ game: 'rain', difficulty });
    const externalFragments = await loadExternalFragments(preparedPassage, externalCount);
    const id = randomUUID();
    await dbOps.gamesDb.run(`
        INSERT INTO scripture_rain_sessions
            (id, user_id, owner_key, client_session_key, passage, verses, full_text, fragments, external_fragments, difficulty, challenge_speed)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8::jsonb,$9::jsonb,$10,$11)
    `, [id, actor.userId, actor.ownerKey, clientSessionKey, JSON.stringify(passageSummary(preparedPassage)),
        JSON.stringify(verses), sourceText, JSON.stringify(fragments), JSON.stringify(externalFragments), difficulty, challengeSpeed]);
    return rainSnapshot(await dbOps.gamesDb.get('SELECT * FROM scripture_rain_sessions WHERE id = $1', [id]));
}

export async function startScriptureRainSession(req, sessionId, input) {
    const actor = actorFromRequest(req);
    return idempotentRainAction({ actor, sessionId, key: input.idempotencyKey, type: 'start', handler: async (tx, row) => {
        if (row.status === 'active') return { session: rainSnapshot(row) };
        if (row.status !== 'preview') throw new ScriptureRainError('SESSION_NOT_STARTABLE', '這場經文雨目前無法開始', 409);
        await tx.run(`UPDATE scripture_rain_sessions SET status = 'active', started_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [row.id]);
        return { session: rainSnapshot(await tx.get('SELECT * FROM scripture_rain_sessions WHERE id = $1', [row.id])) };
    }});
}

export async function forfeitScriptureRainSession(req, sessionId, input) {
    const actor = actorFromRequest(req);
    return idempotentRainAction({ actor, sessionId, key: input.idempotencyKey, type: 'forfeit', handler: async (tx, row) => {
        if (row.status !== 'active') {
            return { session: rainSnapshot(row), forfeited: false };
        }
        await tx.run(`UPDATE scripture_rain_sessions
            SET status = 'failed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1`, [row.id]);
        return {
            session: rainSnapshot(await tx.get('SELECT * FROM scripture_rain_sessions WHERE id = $1', [row.id])),
            forfeited: true
        };
    }});
}

export async function recordScriptureRainEvent(req, sessionId, input) {
    const actor = actorFromRequest(req);
    const type = String(input.type || '');
    if (!['select', 'miss'].includes(type)) throw new ScriptureRainError('INVALID_EVENT', '經文雨事件無效');
    return idempotentRainAction({ actor, sessionId, key: input.idempotencyKey, type, handler: async (tx, row) => {
        if (row.status !== 'active') return { session: rainSnapshot(row), outcome: { accepted: false } };
        const fragments = jsonValue(row.fragments, []);
        const correct = type === 'select'
            && isCorrectRainSelection(fragments, row.currentIndex, input.fragmentId);
        const currentIndex = Number(row.currentIndex || 0) + (correct ? 1 : 0);
        const lives = correct ? Number(row.lives) : Math.max(0, Number(row.lives) - 1);
        const mistakes = Number(row.mistakes || 0) + (correct ? 0 : 1);
        let status = currentIndex >= fragments.length ? 'completed' : lives <= 0 ? 'failed' : 'active';
        const elapsedMs = Math.max(0, Date.now() - new Date(row.startedAt).getTime());
        let reward = jsonValue(row.reward, null);
        if (reward) reward = { ...reward, awardedNow: false, awardedCoins: 0 };
        if (correct) {
            reward = await awardScriptureMemoryProgress(tx, {
                userId: row.userId,
                sessionId: row.id,
                game: 'rain',
                passage: jsonValue(row.passage, {}),
                correctCount: currentIndex,
                fragmentCount: fragments.length
            });
        }
        if (status === 'completed') {
            reward = await settleScriptureMemoryCompletion(tx, {
                userId: row.userId,
                sessionId: row.id,
                game: 'rain',
                passage: jsonValue(row.passage, {}),
                correctCount: currentIndex,
                fragmentCount: fragments.length,
                elapsedMs,
                mistakes,
                challengeSpeed: row.challengeSpeed || row.challenge_speed || 'MEDIUM'
            });
        }
        await tx.run(`UPDATE scripture_rain_sessions SET current_index = $1, lives = $2, mistakes = $3,
            status = $4, reward = $5::jsonb, updated_at = CURRENT_TIMESTAMP,
            completed_at = CASE WHEN $4 IN ('completed','failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
            WHERE id = $6`, [currentIndex, lives, mistakes, status, reward ? JSON.stringify(reward) : null, row.id]);
        const updated = await tx.get('SELECT * FROM scripture_rain_sessions WHERE id = $1', [row.id]);
        return {
            session: rainSnapshot(updated),
            outcome: { accepted: true, correct, missed: type === 'miss', completed: status === 'completed', failed: status === 'failed' }
        };
    }});
}

export async function spendScriptureRainHint({ userId, sessionId, requestId }) {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(String(sessionId || ''))) {
        throw new ScriptureRainError('INVALID_SESSION_ID', '經文雨遊戲階段格式不正確');
    }
    if (!/^[A-Za-z0-9:_-]{8,120}$/u.test(String(requestId || ''))) {
        throw new ScriptureRainError('INVALID_REQUEST_ID', '提示請求識別碼格式不正確');
    }

    const cost = scriptureRainHintCost();
    const result = await dbOps.usersDb.transaction(tx => applyCoinDeltaTx(tx, {
        userId,
        delta: -cost,
        reasonCode: 'spend_scripture_rain_hint',
        sourceId: sessionId,
        idempotencyKey: `scripture-rain:hint:${userId}:${requestId}`,
        metadata: { game: 'scripture_rain', sessionId }
    }));

    return {
        spent: Math.abs(result.delta),
        balance: result.balance,
        duplicate: result.duplicate
    };
}
