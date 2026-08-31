import crypto from 'node:crypto';

import { initializeInfrastructure, dbOps } from '../database/index.js';
import QuestionCore, { getGenerationQualityModel } from '../domains/game/engine/QuestionCore.js';
import { runPipeline } from '../domains/game/engine/QuestionPipeline.js';
import { questionInventoryService } from '../domains/game/replenishment/QuestionInventoryService.js';
import { ContentManager } from '../domains/content/bible/ContentManager.js';
import { getBibleCorpusPolicy } from '../domains/content/bible/BibleCorpusPolicy.js';
import { resolveBibleVersion } from '../domains/content/bible/BibleVersionRegistry.js';
import { FHL_BOOK_CATALOG } from '../domains/content/bible/fhlCatalog.js';
import { bibleTranslator } from '../utils/bibleTranslator.js';
import { LogosEngine } from '../infrastructure/ai/LogosEngine.js';
import { partitionVerifiedInventoryAdds } from '../domains/game/replenishment/QuestionInventoryAcceptance.js';

const PUBLIC_VERSIONS = ['CUV_TRAD', 'CNV_TRAD', 'TCV2010_TRAD'];
const SCORE_RANGES = {
    EASY: '0-30',
    MEDIUM: '31-65',
    HARD: '66-85',
    VERY_HARD: '86-100'
};
const CATEGORY_PREFERENCES = {
    EASY: ['verse_fill', 'verse_fact', 'person'],
    MEDIUM: ['verse_fact', 'person', 'geography', 'theology'],
    HARD: ['theology', 'verse_fact', 'person', 'geography', 'lexicon'],
    VERY_HARD: ['theology', 'verse_fact', 'person', 'geography', 'lexicon']
};

function readArg(name, fallback = null) {
    const prefix = `--${name}=`;
    const found = process.argv.slice(2).find(arg => arg.startsWith(prefix));
    return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name) {
    return process.argv.slice(2).includes(`--${name}`);
}

function readField(row, camel, snake) {
    return row?.[camel] ?? row?.[snake];
}

function chooseCategory(snapshot, band) {
    return [...(CATEGORY_PREFERENCES[band] || ['verse_fact'])]
        .sort((a, b) =>
            Number(snapshot.byCategoryAndBand?.[a]?.[band] || 0)
            - Number(snapshot.byCategoryAndBand?.[b]?.[band] || 0)
        )[0];
}

function chooseChapter(snapshot, chapterCount, offset = 0) {
    const ranked = Array.from({ length: chapterCount }, (_, index) => index + 1)
        .sort((a, b) =>
            Number(snapshot.byChapter?.[a] || 0) - Number(snapshot.byChapter?.[b] || 0)
            || a - b
        );
    return ranked[offset % ranked.length];
}

function chooseVerseWindow(maxVerse, existingQuestions, windowSize = 12, offset = 0) {
    const windows = [];
    for (let start = 1; start <= maxVerse; start += windowSize) {
        const end = Math.min(maxVerse, start + windowSize - 1);
        const used = existingQuestions.filter(question => {
            const verseStart = Number(question.verseStart ?? question.verse_start ?? 0);
            return verseStart >= start && verseStart <= end;
        }).length;
        windows.push({ start, end, used });
    }
    const ranked = windows.sort((a, b) => a.used - b.used || a.start - b.start);
    return ranked[offset % ranked.length];
}

function summarizeRejected(question) {
    return {
        id: question.id,
        question: question.question,
        answer: question.answer,
        status: question.status,
        qualityState: question.quality_state,
        reason: question.audit_reason || question.quality_audit?.reason || null,
        audit: question.quality_audit || null
    };
}

function isVerifiedNewQuestion(question) {
    const audits = Array.isArray(question.quality_audits) ? question.quality_audits : [];
    return question.status === 'PASS'
        && question.quality_state === 'VERIFIED'
        && Boolean(question.semantic_group_key)
        && audits.length >= 2
        && audits.every(audit => String(audit?.result || '').toUpperCase() === 'PASS');
}

async function setManagedCorpusGate(versions, enabled) {
    const canonicalVersions = [...new Set(versions.map(version => {
        const resolved = resolveBibleVersion(version);
        return resolved?.canonicalVersion || version;
    }))];
    for (const version of canonicalVersions) {
        if (enabled) {
            await dbOps.contentDb.run(`
                UPDATE bible_translation_versions
                SET new_question_eligible = TRUE,
                    updated_at = CURRENT_TIMESTAMP
                WHERE version_id = $1
                  AND coverage_status IN ('COMPLETE', 'COMPLETE_WITH_MERGED_VERSES')
                  AND evidence_eligible = TRUE
            `, [version]);
        } else {
            await dbOps.contentDb.run(`
                UPDATE bible_translation_versions
                SET new_question_eligible = FALSE,
                    updated_at = CURRENT_TIMESTAMP
                WHERE version_id = $1
            `, [version]);
        }
    }
    console.log(`[InventoryGeneration] Managed corpus gate ${enabled ? 'OPEN' : 'CLOSED'}: ${canonicalVersions.join(', ')}`);
}

async function createGenerationJob(scope) {
    const id = crypto.randomUUID();
    await dbOps.gamesDb.run(`
        INSERT INTO question_quality_jobs
            (id, job_type, status, scope, priority, attempt_count, max_attempts,
             dedupe_key, started_at, created_at, updated_at)
        VALUES ($1, 'NEW_QUESTION_PRODUCTION', 'RUNNING', $2::jsonb, 20, 1, 1,
                $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [id, JSON.stringify(scope), `inventory-generation-v4-1:${id}`]);
    return id;
}

async function finishGenerationJob(id, status, result, error = null) {
    await dbOps.gamesDb.run(`
        UPDATE question_quality_jobs
        SET status = $2,
            result = $3::jsonb,
            last_error = $4,
            completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
    `, [id, status, JSON.stringify(result || {}), error]);
}

async function getMaxVerse(version, book, chapter) {
    const identity = resolveBibleVersion(version);
    const englishBook = bibleTranslator.toEnglish(book);
    const row = await dbOps.contentDb.get(`
        SELECT MAX(verse)::INTEGER AS max_verse
        FROM bible_verses
        WHERE version = $1 AND book = $2 AND chapter = $3 AND BTRIM(text) <> ''
    `, [identity.storageVersion, englishBook, chapter]);
    return Number(readField(row, 'maxVerse', 'max_verse') || 0);
}

async function generateOneGap(snapshot, band, batchSize, {
    paidCandidate = false,
    attemptOffset = 0
} = {}) {
    const bookEntry = FHL_BOOK_CATALOG.find(entry => entry.chinese === snapshot.book);
    if (!bookEntry) throw new Error(`UNKNOWN_BOOK:${snapshot.book}`);

    const chapter = chooseChapter(snapshot, bookEntry.chapters, attemptOffset);
    const maxVerse = await getMaxVerse(snapshot.version, snapshot.book, chapter);
    if (maxVerse < 1) throw new Error(`EMPTY_CHAPTER:${snapshot.version}:${snapshot.book}:${chapter}`);

    const existingInBook = await dbOps.getQuestionsInBatchRange(
        snapshot.book, 1, bookEntry.chapters, null, null, [], snapshot.version
    );
    const existingInChapter = existingInBook.filter(question => Number(question.chapter) === chapter);
    const window = chooseVerseWindow(maxVerse, existingInChapter, 12, attemptOffset);
    const category = snapshot.priorityGap?.band === band && snapshot.priorityGap?.category
        ? snapshot.priorityGap.category
        : chooseCategory(snapshot, band);
    const qualityModel = getGenerationQualityModel(band);
    const segments = await ContentManager.getMultiSegmentContext(
        snapshot.book,
        [{ chapter, verseRange: { start: window.start, end: window.end } }],
        snapshot.version,
        { chapter }
    );
    if (!Array.isArray(segments) || segments.length === 0) {
        throw new Error(`CONTEXT_UNAVAILABLE:${snapshot.version}:${snapshot.book}:${chapter}:${window.start}-${window.end}`);
    }

    const scope = {
        standardVersion: 'question_quality_v4_1',
        version: snapshot.version,
        book: snapshot.book,
        chapter,
        verseWindow: window,
        band,
        category,
        qualityModel,
        requested: batchSize
    };
    const jobId = await createGenerationJob(scope);

    try {
        const generated = await QuestionCore.generateBatch({
            book: snapshot.book,
            segments,
            count: batchSize,
            options: {
                chapter,
                version: snapshot.version,
                target_category: category,
                target_difficulty_band: band,
                target_score_range: SCORE_RANGES[band],
                paidPreferred: paidCandidate,
                model: qualityModel,
                preferred_verse_window: `${window.start}-${window.end}`,
                avoid_verse_windows: existingInChapter
                    .map(question => question.verseRef ?? question.verse_ref)
                    .filter(Boolean)
                    .slice(0, 40)
            },
            excludeList: existingInBook.map(question => question.question)
        });

        const scoped = (generated || []).map(question => ({
            ...question,
            book: snapshot.book,
            version: snapshot.version,
            source: 'AI_INVENTORY_GAP_V4'
        }));
        const unique = await LogosEngine.auditor.livePrune(
            scoped,
            existingInBook,
            existingInBook.map(question => question.question)
        );
        const processed = unique.length > 0 ? await runPipeline(unique) : [];
        const verifiedCandidates = processed.filter(isVerifiedNewQuestion);
        const inventoryDecision = partitionVerifiedInventoryAdds(
            verifiedCandidates,
            snapshot.shortages
        );
        const verified = inventoryDecision.accepted.map(item => item.question);
        const rejected = processed.filter(question => !isVerifiedNewQuestion(question));
        const inventoryRejected = inventoryDecision.rejected.map(item => ({
            ...summarizeRejected(item.question),
            status: 'NOT_STORED',
            reason: `${item.reason}:${item.actualBand}`
        }));

        if (verified.length > 0) await dbOps.batchSaveQuestions(verified);
        const storedByBand = inventoryDecision.accepted.reduce((counts, item) => {
            counts[item.actualBand] = Number(counts[item.actualBand] || 0) + 1;
            return counts;
        }, {});
        const result = {
            generated: scoped.length,
            unique: unique.length,
            stored: verified.map(question => question.id),
            storedByBand,
            rejected: [...rejected.map(summarizeRejected), ...inventoryRejected]
        };
        await finishGenerationJob(jobId, 'COMPLETED', result);
        return { ...scope, ...result };
    } catch (error) {
        await finishGenerationJob(jobId, 'FAILED', {}, String(error.message || error).slice(0, 500));
        throw error;
    }
}

async function main() {
    const write = hasFlag('write');
    const manageCorpusGate = hasFlag('manage-corpus-gate');
    const paidCandidate = hasFlag('paid-candidate');
    const maxBatches = Math.max(1, Number(readArg('max-batches', '1')) || 1);
    const batchSize = Math.min(10, Math.max(1, Number(readArg('batch-size', '6')) || 6));
    const targetCount = Math.max(1, Number(readArg('target-count', '15')) || 15);
    const requestedVersions = String(readArg('versions', 'CUV_TRAD'))
        .split(',').map(value => value.trim()).filter(Boolean);
    const requestedBook = readArg('book');
    const requestedBand = String(readArg('band', '')).toUpperCase() || null;

    if (requestedVersions.some(version => !PUBLIC_VERSIONS.includes(version))) {
        throw new Error(`UNSUPPORTED_PUBLIC_VERSION:${requestedVersions.join(',')}`);
    }
    if (requestedBand && !SCORE_RANGES[requestedBand]) throw new Error(`INVALID_BAND:${requestedBand}`);

    await initializeInfrastructure();
    await ContentManager.initialize(dbOps.contentDb);
    const allBooks = FHL_BOOK_CATALOG.map(entry => entry.chinese);
    const books = requestedBook ? [bibleTranslator.toChinese(requestedBook)] : allBooks;

    const initial = [];
    for (const version of requestedVersions) {
        const coverage = await questionInventoryService.getBookCoverage({ books, version, targetCount });
        initial.push(...coverage.filter(item => item.shortageTotal > 0));
    }
    console.log(JSON.stringify({
        mode: write ? 'WRITE' : 'DRY_RUN',
        gapBooks: initial.length,
        totalMissing: initial.reduce((sum, item) => sum + item.shortageTotal, 0),
        next: initial.slice(0, 20).map(item => ({
            version: item.version,
            book: item.book,
            total: item.total,
            shortages: item.shortages,
            priorityGap: item.priorityGap
        }))
    }, null, 2));

    if (!write) return;

    let managedGateOpened = false;
    try {
        if (manageCorpusGate) {
            await setManagedCorpusGate(requestedVersions, true);
            managedGateOpened = true;
        }

        for (const version of requestedVersions) {
            const policy = await getBibleCorpusPolicy(version);
            if (!policy.newQuestionEligible) {
                throw new Error(`NEW_QUESTION_CORPUS_BLOCKED:${version}:${policy.reason}`);
            }
        }

        let noProgress = 0;
        for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
            const coverage = [];
            for (const version of requestedVersions) {
                coverage.push(...await questionInventoryService.getBookCoverage({ books, version, targetCount }));
            }
            const candidates = coverage
                .filter(item => item.shortageTotal > 0)
                .filter(item => !requestedBand || Number(item.shortages[requestedBand] || 0) > 0)
                .sort((a, b) => b.shortageTotal - a.shortageTotal || a.total - b.total);
            const preferredVersion = requestedVersions[batchIndex % requestedVersions.length];
            const snapshot = candidates.find(item => item.version === preferredVersion)
                || candidates[0];
            if (!snapshot) break;

            const band = requestedBand || snapshot.priorityGap?.band;
            try {
                const result = await generateOneGap(snapshot, band, batchSize, {
                    paidCandidate,
                    attemptOffset: batchIndex
                });
                console.log(JSON.stringify({ batch: batchIndex + 1, ...result }, null, 2));
                noProgress = result.stored.length === 0 ? noProgress + 1 : 0;
            } catch (error) {
                noProgress += 1;
                console.error(JSON.stringify({
                    batch: batchIndex + 1,
                    version: snapshot.version,
                    book: snapshot.book,
                    band,
                    error: String(error.message || error)
                }));
            }
            if (noProgress >= 3) {
                console.warn('Stopped after three consecutive batches with no verified question.');
                break;
            }
        }
    } finally {
        if (managedGateOpened) await setManagedCorpusGate(requestedVersions, false);
    }
}

main()
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (dbOps.db) await dbOps.db.close();
    });
