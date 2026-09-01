import { randomUUID } from 'node:crypto';
import { dbOps } from '../../database/index.js';
import { bibleTranslator } from '../../utils/bibleTranslator.js';
import {
    SCRIPTURE_SEGMENTATION_LEXICON_VERSION,
    SCRIPTURE_SEGMENTATION_NORMALIZATION_VERSION,
    SCRIPTURE_SEGMENTATION_RULE_VERSION,
    protectedCoreTerms,
    mergePassageSegmentations,
    segmentScriptureVerse,
    validateHealthySegmentation
} from './healthy-segmentation-engine.js';
import { sha256 } from './order-engine.js';

const CRUISE_VERSION = 'CUV_TRAD';
const DEFAULT_BATCH_SIZE = 100;
const activeRunners = new Map();
const canonicalEnglishBooks = bibleTranslator.allBooks.map(book => bibleTranslator.toEnglish(book));

export class SegmentationCruiseError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'SegmentationCruiseError';
        this.code = code;
        this.status = status;
    }
}

export function segmentationCruiseEnabled(env = process.env) {
    return String(env.SCRIPTURE_SEGMENTATION_CRUISE_ENABLED || '').toLowerCase() === 'true';
}

function jsonValue(value, fallback) {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return fallback; }
}

function entryKeyFor({ version, book, chapter, verse, displayHash, ruleVersion, lexiconVersion }) {
    return sha256([version, book, chapter, verse, displayHash, ruleVersion, lexiconVersion].join(':'));
}

async function seedProtectedTerms() {
    for (const item of protectedCoreTerms()) {
        const term = String(item.term || '').trim();
        if (!term) continue;
        const id = sha256(`${SCRIPTURE_SEGMENTATION_LEXICON_VERSION}:${term}`);
        await dbOps.gamesDb.run(`
            INSERT INTO scripture_segmentation_protected_terms
                (id, term, normalized_term, category, source, lexicon_version, evidence)
            VALUES ($1,$2,$2,$3,'CORE',$4,$5::jsonb)
            ON CONFLICT (lexicon_version, normalized_term) DO UPDATE SET
                status = 'ACTIVE', category = EXCLUDED.category,
                source = EXCLUDED.source, evidence = EXCLUDED.evidence,
                updated_at = CURRENT_TIMESTAMP
        `, [id, term, item.category || 'OTHER', SCRIPTURE_SEGMENTATION_LEXICON_VERSION,
            JSON.stringify({
                seededBy: 'protected-terms.v3.json',
                isolate: item.isolate === true
            })]);
    }
}

export async function activeProtectedTerms() {
    await seedProtectedTerms();
    const rows = await dbOps.gamesDb.query(`
        SELECT term, category, source,
               COALESCE((evidence->>'isolate')::boolean, FALSE) AS isolate
        FROM scripture_segmentation_protected_terms
        WHERE lexicon_version = $1 AND status = 'ACTIVE'
        ORDER BY length(term) DESC, term
    `, [SCRIPTURE_SEGMENTATION_LEXICON_VERSION]);
    return rows.map(row => ({
        term: row.term,
        category: row.category,
        source: row.source,
        isolate: row.isolate === true
    }));
}

function databaseEntry(verseRow, segmentation, runId) {
    const version = String(verseRow.version || segmentation.translationVersion || CRUISE_VERSION);
    const entryKey = entryKeyFor({
        version,
        book: verseRow.book,
        chapter: Number(verseRow.chapter),
        verse: Number(verseRow.verse),
        displayHash: segmentation.displayHash,
        ruleVersion: segmentation.ruleVersion,
        lexiconVersion: segmentation.lexiconVersion
    });
    return {
        entryKey,
        runId,
        version,
        book: verseRow.book,
        chapter: Number(verseRow.chapter),
        verse: Number(verseRow.verse),
        ...segmentation
    };
}

async function storeEntry(tx, entry, { activate }) {
    const canActivate = activate
        && entry.healthState === 'VALID'
        && entry.confidence === 'HIGH'
        && entry.memoryReady === true;
    if (canActivate) {
        await tx.run(`
            UPDATE scripture_segmentation_entries
            SET active = FALSE, health_state = 'INVALIDATED', updated_at = CURRENT_TIMESTAMP
            WHERE version = $1 AND book = $2 AND chapter = $3 AND verse = $4 AND active = TRUE
              AND entry_key <> $5
        `, [entry.version, entry.book, entry.chapter, entry.verse, entry.entryKey]);
    }
    await tx.run(`
        INSERT INTO scripture_segmentation_entries
            (entry_key, run_id, version, book, chapter, verse, raw_text, raw_hash,
             display_text, display_hash, normalization_version, rule_version, lexicon_version,
             boundary_offsets, candidate_boundaries, fragments, health_state, confidence,
             generation_source, issues, active, activated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,
                $16::jsonb,$17,$18,'RULES',$19::jsonb,$20,
                CASE WHEN $20 THEN CURRENT_TIMESTAMP ELSE NULL END)
        ON CONFLICT (entry_key) DO UPDATE SET
            run_id = CASE WHEN EXCLUDED.active THEN EXCLUDED.run_id
                ELSE scripture_segmentation_entries.run_id END,
            raw_text = EXCLUDED.raw_text,
            raw_hash = EXCLUDED.raw_hash,
            boundary_offsets = EXCLUDED.boundary_offsets,
            candidate_boundaries = EXCLUDED.candidate_boundaries,
            fragments = EXCLUDED.fragments,
            health_state = EXCLUDED.health_state,
            confidence = EXCLUDED.confidence,
            generation_source = EXCLUDED.generation_source,
            issues = EXCLUDED.issues,
            active = CASE WHEN EXCLUDED.active THEN TRUE ELSE scripture_segmentation_entries.active END,
            activated_at = CASE WHEN EXCLUDED.active THEN CURRENT_TIMESTAMP
                ELSE scripture_segmentation_entries.activated_at END,
            updated_at = CURRENT_TIMESTAMP
    `, [entry.entryKey, entry.runId, entry.version, entry.book, entry.chapter, entry.verse,
        entry.rawText, entry.rawHash, entry.displayText, entry.displayHash,
        entry.normalizationVersion, entry.ruleVersion, entry.lexiconVersion,
        JSON.stringify(entry.boundaryOffsets), JSON.stringify(entry.candidateBoundaries),
        JSON.stringify(entry.fragments), entry.healthState, entry.confidence,
        JSON.stringify(entry.issues), canActivate]);

    if (activate
        && entry.sourceState === 'CLEAN'
        && entry.boundaryState === 'REVIEW_REQUIRED') {
        await tx.run(`
            INSERT INTO scripture_segmentation_ai_queue (entry_key)
            VALUES ($1) ON CONFLICT (entry_key) DO NOTHING
        `, [entry.entryKey]);
    }
}

async function storeLegacyCompatibleCache(tx, entry) {
    await tx.run(`
        INSERT INTO scripture_order_segmentation_cache
            (cache_key, version, book, chapter, verse, source_hash, rule_version,
             machine_fragments, final_fragments, confidence, review_state, review_details)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$8::jsonb,$9,'RULES_ONLY',$10::jsonb)
        ON CONFLICT (cache_key) DO UPDATE SET
            machine_fragments = EXCLUDED.machine_fragments,
            final_fragments = EXCLUDED.final_fragments,
            confidence = EXCLUDED.confidence,
            review_state = 'RULES_ONLY',
            review_details = scripture_order_segmentation_cache.review_details || EXCLUDED.review_details,
            updated_at = CURRENT_TIMESTAMP
    `, [entry.entryKey, entry.version, entry.book, entry.chapter, entry.verse,
        entry.displayHash, entry.ruleVersion, JSON.stringify(entry.fragments),
        entry.memoryReady === true ? 'HIGH' : 'LOW',
        JSON.stringify({
            healthState: entry.healthState,
            normalizationVersion: entry.normalizationVersion,
            lexiconVersion: entry.lexiconVersion,
            boundaryOffsets: entry.boundaryOffsets,
            machineIssues: entry.issues
        })]);
}

async function loadBatch(offset, limit) {
    return dbOps.contentDb.query(`
        SELECT book, chapter, verse, text
        FROM bible_verses
        WHERE version = $1
        ORDER BY array_position($2::text[], book), chapter, verse
        OFFSET $3 LIMIT $4
    `, [CRUISE_VERSION, canonicalEnglishBooks, offset, limit]);
}

async function processBatch(run, terms) {
    const rows = await loadBatch(Number(run.processedVerses), Number(run.batchSize));
    if (rows.length === 0) return { done: true };
    const entries = rows.map(row => databaseEntry(
        { ...row, version: CRUISE_VERSION },
        segmentScriptureVerse(row.text, { protectedTerms: terms, version: CRUISE_VERSION }),
        run.id
    ));
    const stats = entries.reduce((result, entry) => {
        if (entry.healthState === 'VALID') result.valid += 1;
        else if (entry.healthState === 'VALID_LONG') result.validLong += 1;
        else result.needsRepair += 1;
        return result;
    }, { valid: 0, validLong: 0, needsRepair: 0 });
    const checkpoint = entries.at(-1);
    await dbOps.gamesDb.transaction(async tx => {
        for (const entry of entries) {
            await storeEntry(tx, entry, { activate: !run.dryRun });
            await storeLegacyCompatibleCache(tx, entry);
            await tx.run(`
                INSERT INTO scripture_segmentation_run_entries (run_id, entry_key, health_state)
                VALUES ($1,$2,$3)
                ON CONFLICT (run_id, entry_key) DO UPDATE SET health_state = EXCLUDED.health_state
            `, [run.id, entry.entryKey, entry.healthState]);
        }
        await tx.run(`
            UPDATE scripture_segmentation_runs
            SET processed_verses = processed_verses + $1,
                valid_count = valid_count + $2,
                valid_long_count = valid_long_count + $3,
                needs_repair_count = needs_repair_count + $4,
                checkpoint_book = $5, checkpoint_chapter = $6, checkpoint_verse = $7,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $8
        `, [entries.length, stats.valid, stats.validLong, stats.needsRepair,
            checkpoint.book, checkpoint.chapter, checkpoint.verse, run.id]);
    });
    return { done: entries.length < Number(run.batchSize) };
}

async function finishRun(runId, status, error = null) {
    await dbOps.gamesDb.run(`
        UPDATE scripture_segmentation_runs
        SET status = $1, error_code = $2, error_message = $3,
            completed_at = CASE WHEN $1 IN ('COMPLETED','FAILED','CANCELLED') THEN CURRENT_TIMESTAMP ELSE completed_at END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
    `, [status, error?.code || null, error?.message || null, runId]);
}

async function runLoop(runId) {
    if (activeRunners.has(runId)) return activeRunners.get(runId);
    const promise = (async () => {
        const terms = await activeProtectedTerms();
        while (true) {
            const run = await dbOps.gamesDb.get('SELECT * FROM scripture_segmentation_runs WHERE id = $1', [runId]);
            if (!run) return;
            if (run.status === 'PAUSE_REQUESTED') {
                await finishRun(runId, 'PAUSED');
                return;
            }
            if (run.status === 'CANCELLED' || run.status === 'PAUSED') return;
            if (!['PENDING', 'RUNNING'].includes(run.status)) return;
            if (run.status === 'PENDING') {
                await dbOps.gamesDb.run(`
                    UPDATE scripture_segmentation_runs
                    SET status = 'RUNNING', started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1 AND status = 'PENDING'
                `, [runId]);
                run.status = 'RUNNING';
            }
            let batchResult;
            let lastError;
            for (let attempt = 1; attempt <= 3; attempt += 1) {
                try {
                    batchResult = await processBatch(run, terms);
                    lastError = null;
                    break;
                } catch (error) {
                    lastError = error;
                    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 250));
                }
            }
            if (lastError) {
                await dbOps.gamesDb.run(`
                    UPDATE scripture_segmentation_runs
                    SET failed_count = failed_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1
                `, [runId]);
                throw lastError;
            }
            if (batchResult.done) {
                await finishRun(runId, 'COMPLETED');
                if (!run.dryRun && String(process.env.SCRIPTURE_SEGMENTATION_AI_BACKGROUND_ENABLED || '').toLowerCase() === 'true') {
                    void import('./segmentation-boundary-review-service.js')
                        .then(module => module.processSegmentationBoundaryReviewQueue())
                        .catch(() => {});
                }
                return;
            }
            await new Promise(resolve => setImmediate(resolve));
        }
    })().catch(async error => {
        await finishRun(runId, 'FAILED', error).catch(() => {});
    }).finally(() => activeRunners.delete(runId));
    activeRunners.set(runId, promise);
    return promise;
}

export async function startSegmentationCruise({ dryRun = true, batchSize = DEFAULT_BATCH_SIZE, createdBy = null } = {}) {
    if (!dryRun && !segmentationCruiseEnabled()) {
        throw new SegmentationCruiseError('SEGMENTATION_CRUISE_DISABLED', '正式切片巡航功能尚未開啟', 409);
    }
    const size = Number(batchSize);
    if (!Number.isSafeInteger(size) || size < 1 || size > 1000) {
        throw new SegmentationCruiseError('INVALID_BATCH_SIZE', '批次大小必須介於 1 至 1000');
    }
    await seedProtectedTerms();
    const countRow = await dbOps.contentDb.get(`
        SELECT COUNT(*)::integer AS count FROM bible_verses WHERE version = $1
    `, [CRUISE_VERSION]);
    const total = Number(countRow?.count || 0);
    if (total === 0) throw new SegmentationCruiseError('SCRIPTURE_SOURCE_EMPTY', '找不到和合本正式經文', 409);
    const id = randomUUID();
    try {
        await dbOps.gamesDb.transaction(async tx => {
            const lock = await tx.get("SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired", [`scripture-segmentation:${CRUISE_VERSION}`]);
            if (!lock?.acquired) throw new SegmentationCruiseError('CRUISE_LOCKED', '已有巡航正在建立', 409);
            const active = await tx.get(`
                SELECT id FROM scripture_segmentation_runs
                WHERE version = $1 AND status IN ('PENDING','RUNNING','PAUSE_REQUESTED','PAUSED')
                LIMIT 1 FOR UPDATE
            `, [CRUISE_VERSION]);
            if (active) throw new SegmentationCruiseError('CRUISE_ALREADY_ACTIVE', '同一譯本已有未完成巡航', 409);
            await tx.run(`
                INSERT INTO scripture_segmentation_runs
                    (id, version, rule_version, normalization_version, lexicon_version,
                     dry_run, batch_size, total_verses, created_by)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            `, [id, CRUISE_VERSION, SCRIPTURE_SEGMENTATION_RULE_VERSION,
                SCRIPTURE_SEGMENTATION_NORMALIZATION_VERSION, SCRIPTURE_SEGMENTATION_LEXICON_VERSION,
                Boolean(dryRun), size, total, createdBy]);
        });
    } catch (error) {
        if (error?.code === '23505') throw new SegmentationCruiseError('CRUISE_ALREADY_ACTIVE', '同一譯本已有未完成巡航', 409);
        throw error;
    }
    void runLoop(id);
    return dbOps.gamesDb.get('SELECT * FROM scripture_segmentation_runs WHERE id = $1', [id]);
}

export async function pauseSegmentationCruise(runId) {
    const result = await dbOps.gamesDb.run(`
        UPDATE scripture_segmentation_runs SET status = 'PAUSE_REQUESTED', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status IN ('PENDING','RUNNING')
    `, [runId]);
    if (!result.changes) throw new SegmentationCruiseError('CRUISE_NOT_PAUSABLE', '巡航目前無法暫停', 409);
    return dbOps.gamesDb.get('SELECT * FROM scripture_segmentation_runs WHERE id = $1', [runId]);
}

export async function resumeSegmentationCruise(runId) {
    const run = await dbOps.gamesDb.get('SELECT * FROM scripture_segmentation_runs WHERE id = $1', [runId]);
    if (!run || run.status !== 'PAUSED') throw new SegmentationCruiseError('CRUISE_NOT_RESUMABLE', '巡航目前無法續跑', 409);
    if (!run.dryRun && !segmentationCruiseEnabled()) {
        throw new SegmentationCruiseError('SEGMENTATION_CRUISE_DISABLED', '正式切片巡航功能尚未開啟', 409);
    }
    await dbOps.gamesDb.run(`
        UPDATE scripture_segmentation_runs SET status = 'RUNNING', updated_at = CURRENT_TIMESTAMP WHERE id = $1
    `, [runId]);
    void runLoop(runId);
    return dbOps.gamesDb.get('SELECT * FROM scripture_segmentation_runs WHERE id = $1', [runId]);
}

export async function cancelSegmentationCruise(runId) {
    const result = await dbOps.gamesDb.run(`
        UPDATE scripture_segmentation_runs
        SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status IN ('PENDING','RUNNING','PAUSE_REQUESTED','PAUSED')
    `, [runId]);
    if (!result.changes) throw new SegmentationCruiseError('CRUISE_NOT_CANCELLABLE', '巡航目前無法取消', 409);
    return dbOps.gamesDb.get('SELECT * FROM scripture_segmentation_runs WHERE id = $1', [runId]);
}

export async function segmentationCruiseOverview() {
    const [runs, states, terms] = await Promise.all([
        dbOps.gamesDb.query('SELECT * FROM scripture_segmentation_runs ORDER BY created_at DESC LIMIT 20'),
        dbOps.gamesDb.query(`
            SELECT health_state, active, COUNT(*)::integer AS count
            FROM scripture_segmentation_entries GROUP BY health_state, active ORDER BY health_state, active
        `),
        dbOps.gamesDb.get(`
            SELECT COUNT(*)::integer AS count FROM scripture_segmentation_protected_terms
            WHERE lexicon_version = $1 AND status = 'ACTIVE'
        `, [SCRIPTURE_SEGMENTATION_LEXICON_VERSION])
    ]);
    return {
        enabled: segmentationCruiseEnabled(),
        version: CRUISE_VERSION,
        ruleVersion: SCRIPTURE_SEGMENTATION_RULE_VERSION,
        normalizationVersion: SCRIPTURE_SEGMENTATION_NORMALIZATION_VERSION,
        lexiconVersion: SCRIPTURE_SEGMENTATION_LEXICON_VERSION,
        protectedTermCount: Number(terms?.count || 0),
        states,
        runs
    };
}

export async function segmentationCruiseExceptions({ runId = null, limit = 100, offset = 0 } = {}) {
    const size = Math.min(500, Math.max(1, Number(limit) || 100));
    const skip = Math.max(0, Number(offset) || 0);
    const clauses = ["(health_state IN ('VALID_LONG','NEEDS_REPAIR','INVALIDATED') OR confidence <> 'HIGH')"];
    const params = [];
    if (runId) {
        params.push(runId);
        clauses.push(`EXISTS (
            SELECT 1 FROM scripture_segmentation_run_entries re
            WHERE re.entry_key = scripture_segmentation_entries.entry_key
              AND re.run_id = $${params.length}
        )`);
    }
    params.push(size, skip);
    return dbOps.gamesDb.query(`
        SELECT entry_key, run_id, version, book, chapter, verse, display_text,
               fragments, health_state, confidence, issues, active, rule_version,
               lexicon_version, updated_at
        FROM scripture_segmentation_entries
        WHERE ${clauses.join(' AND ')}
        ORDER BY book, chapter, verse
        LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
}

export async function resolveVerseSegmentation({ version = CRUISE_VERSION, book, chapter, verse, text }) {
    if (version !== CRUISE_VERSION) {
        throw new SegmentationCruiseError('SEGMENTATION_VERSION_UNSUPPORTED', '健康切片第一版只支援和合本', 422);
    }
    const terms = await activeProtectedTerms();
    const machine = segmentScriptureVerse(text, { protectedTerms: terms, version });
    const row = await dbOps.gamesDb.get(`
        SELECT * FROM scripture_segmentation_entries
        WHERE version = $1 AND book = $2 AND chapter = $3 AND verse = $4
          AND display_hash = $5 AND rule_version = $6 AND lexicon_version = $7
          AND active = TRUE AND health_state = 'VALID' AND confidence = 'HIGH'
        LIMIT 1
    `, [version, book, chapter, verse, machine.displayHash,
        machine.ruleVersion, SCRIPTURE_SEGMENTATION_LEXICON_VERSION]);
    if (row) {
        const fragments = jsonValue(row.fragments, []);
        const boundaryOffsets = jsonValue(row.boundaryOffsets, []);
        const validation = validateHealthySegmentation({
            text: machine.displayText, fragments, boundaryOffsets, protectedTerms: terms
        });
        if (validation.valid) {
            return {
                ...machine,
                fragments,
                boundaryOffsets,
                healthState: row.healthState,
                confidence: row.confidence,
                issues: jsonValue(row.issues, []),
                entryKey: row.entryKey,
                revision: Number(row.revision),
                source: 'LIBRARY'
            };
        }
    }
    const entry = databaseEntry({ version, book, chapter, verse }, machine, null);
    if (entry.memoryReady === true) {
        await dbOps.gamesDb.transaction(async tx => {
            await storeEntry(tx, entry, { activate: true });
            await storeLegacyCompatibleCache(tx, entry);
        });
    }
    return { ...machine, entryKey: entry.entryKey, revision: 1, source: 'MACHINE_ON_DEMAND' };
}

export async function resolvePassageSegmentation({ version = CRUISE_VERSION, book, chapter, verses = [] }) {
    const perVerse = [];
    for (const item of verses) {
        perVerse.push(await resolveVerseSegmentation({
            version,
            book,
            chapter,
            verse: Number(item.verse),
            text: item.text
        }));
    }
    const fragments = mergePassageSegmentations(perVerse).map((text, index) => ({
        id: `f${index + 1}`,
        text
    }));
    return {
        fragments,
        perVerse,
        lowConfidenceVerses: perVerse
            .map((item, index) => ({ item, verse: Number(verses[index]?.verse) }))
            .filter(({ item }) => item.memoryReady !== true)
            .map(({ verse }) => verse),
        segmentationEntries: perVerse.map((item, index) => ({
            verse: Number(verses[index]?.verse),
            entryKey: item.entryKey,
            revision: item.revision,
            source: item.source
        }))
    };
}

export async function waitForSegmentationCruise(runId) {
    const running = activeRunners.get(runId);
    if (running) await running;
    return dbOps.gamesDb.get('SELECT * FROM scripture_segmentation_runs WHERE id = $1', [runId]);
}

export async function persistReviewedSegmentation({ sourceEntry, segmentation, provider, modelId }) {
    const reviewed = {
        ...segmentation,
        ruleVersion: segmentation.ruleVersion || SCRIPTURE_SEGMENTATION_RULE_VERSION,
        lexiconVersion: SCRIPTURE_SEGMENTATION_LEXICON_VERSION,
        issues: [...new Set([...(segmentation.issues || []), 'AI_BOUNDARY_REVIEWED'])]
    };
    const entry = databaseEntry({
        version: sourceEntry.version,
        book: sourceEntry.book,
        chapter: Number(sourceEntry.chapter),
        verse: Number(sourceEntry.verse)
    }, reviewed, sourceEntry.runId || null);
    entry.generationSource = 'AI_BOUNDARY_REVIEW';
    await dbOps.gamesDb.transaction(async tx => {
        await storeEntry(tx, entry, { activate: true });
        await tx.run(`
            UPDATE scripture_segmentation_entries
            SET generation_source = 'AI_BOUNDARY_REVIEW',
                issues = issues || $1::jsonb,
                updated_at = CURRENT_TIMESTAMP
            WHERE entry_key = $2
        `, [JSON.stringify([{ provider, modelId }]), entry.entryKey]);
        await storeLegacyCompatibleCache(tx, entry);
    });
    return entry;
}

export async function recoverInterruptedSegmentationCruises() {
    const result = await dbOps.gamesDb.run(`
        UPDATE scripture_segmentation_runs
        SET status = 'PAUSED', error_code = 'PROCESS_RESTARTED',
            error_message = '伺服器重新啟動，請從最後完成批次續跑',
            updated_at = CURRENT_TIMESTAMP
        WHERE status IN ('RUNNING','PAUSE_REQUESTED')
    `);
    return Number(result.changes || 0);
}

export { entryKeyFor };
