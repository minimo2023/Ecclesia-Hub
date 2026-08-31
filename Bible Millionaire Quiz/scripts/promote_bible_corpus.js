import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

import { requireBibleVersion } from '../server/domains/content/bible/BibleVersionRegistry.js';

dotenv.config();

const { Pool } = pg;
const PROMOTABLE = Object.freeze({
    CUV_TRAD: Object.freeze({ expectedBooks: 66, expectedChapters: 1189, expectedVerses: 31103 }),
    LCC_TRAD: Object.freeze({ expectedBooks: 66, expectedChapters: 1189, expectedVerses: 31103 })
});

function parseArgs(argv) {
    const options = {
        versions: ['CUV_TRAD', 'LCC_TRAD'],
        syncRunId: null,
        apply: false,
        rollbackPromotionId: null,
        help: false
    };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        const next = () => {
            const value = argv[++index];
            if (!value) throw new Error(`Missing value for ${arg}`);
            return value;
        };
        if (arg === '--version' || arg === '--versions') {
            options.versions = next().split(',').map(item => item.trim()).filter(Boolean);
        } else if (arg === '--sync-run-id') options.syncRunId = next();
        else if (arg === '--apply') options.apply = true;
        else if (arg === '--dry-run') options.apply = false;
        else if (arg === '--rollback') options.rollbackPromotionId = next();
        else if (arg === '--help' || arg === '-h') options.help = true;
        else throw new Error(`Unknown argument: ${arg}`);
    }
    if (options.syncRunId && options.versions.length !== 1) {
        throw new Error('--sync-run-id requires exactly one --version');
    }
    if (options.rollbackPromotionId && !options.apply) {
        throw new Error('--rollback requires --apply');
    }
    return options;
}

function printHelp() {
    console.log(`
Usage:
  node scripts/promote_bible_corpus.js [options]

Safety defaults:
  - Promotes only the approved A1/A2 staging corpora.
  - Defaults to --dry-run. Writes require --apply.
  - Question generation remains disabled after promotion.

Options:
  --versions CUV_TRAD,LCC_TRAD
  --version CUV_TRAD
  --sync-run-id UUID
  --dry-run
  --apply
  --rollback PROMOTION_ID --apply
`);
}

function createPool() {
    return new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'bible_quiz'
    });
}

async function resolveStagingRun(client, definition, requestedRunId = null) {
    const params = [definition.canonicalVersion, definition.sourceVersion];
    let extra = '';
    if (requestedRunId) {
        params.push(requestedRunId);
        extra = 'AND id = $3';
    }
    const result = await client.query(`
        SELECT id, report, completed_at
        FROM bible_source_sync_runs
        WHERE target_version = $1
          AND source_version = $2
          AND status = 'COMPLETED'
          ${extra}
        ORDER BY completed_at DESC
        LIMIT 1
    `, params);
    if (!result.rows[0]) {
        throw new Error(`COMPLETED_STAGING_RUN_NOT_FOUND:${definition.canonicalVersion}`);
    }
    return result.rows[0];
}

async function inspectPromotion(client, definition, expected, syncRunId) {
    const stagedResult = await client.query(`
        SELECT COUNT(DISTINCT book)::INTEGER AS books,
               COUNT(DISTINCT (book, chapter))::INTEGER AS chapters,
               COUNT(*)::INTEGER AS verses,
               COUNT(*) FILTER (WHERE BTRIM(text) = '')::INTEGER AS blanks,
               COUNT(*) FILTER (WHERE source_sha256 IS NULL OR source_sha256 = '')::INTEGER AS missing_hashes
        FROM bible_verse_staging
        WHERE sync_run_id = $1 AND version_id = $2
    `, [syncRunId, definition.canonicalVersion]);
    const staged = stagedResult.rows[0];
    for (const [field, expectedValue] of Object.entries({
        books: expected.expectedBooks,
        chapters: expected.expectedChapters,
        verses: expected.expectedVerses,
        blanks: 0,
        missing_hashes: 0
    })) {
        if (Number(staged[field]) !== expectedValue) {
            throw new Error(`STAGING_${field.toUpperCase()}_MISMATCH:${definition.canonicalVersion}:${staged[field]}/${expectedValue}`);
        }
    }

    const comparisonResult = await client.query(`
        SELECT
            COUNT(*) FILTER (WHERE live.id IS NOT NULL)::INTEGER AS existing,
            COUNT(*) FILTER (WHERE live.id IS NOT NULL AND live.text = staged.text)::INTEGER AS exact,
            COUNT(*) FILTER (
                WHERE live.id IS NOT NULL
                  AND live.text IS DISTINCT FROM staged.text
                  AND regexp_replace(regexp_replace(live.text, '\\{[^}]*\\}', '', 'g'), '[[:space:]]', '', 'g')
                      = regexp_replace(staged.text, '[[:space:]]', '', 'g')
            )::INTEGER AS normalized_equivalent,
            COUNT(*) FILTER (
                WHERE live.id IS NOT NULL
                  AND regexp_replace(regexp_replace(live.text, '\\{[^}]*\\}', '', 'g'), '[[:space:]]', '', 'g')
                      <> regexp_replace(staged.text, '[[:space:]]', '', 'g')
            )::INTEGER AS content_different,
            COUNT(*) FILTER (WHERE live.id IS NULL)::INTEGER AS missing
        FROM bible_verse_staging staged
        LEFT JOIN bible_verses live
          ON live.version = $3
         AND live.book = staged.book
         AND live.chapter = staged.chapter
         AND live.verse = staged.verse
        WHERE staged.sync_run_id = $1 AND staged.version_id = $2
    `, [syncRunId, definition.canonicalVersion, definition.storageVersion]);
    const extrasResult = await client.query(`
        SELECT COUNT(*)::INTEGER AS extras
        FROM bible_verses live
        LEFT JOIN bible_verse_staging staged
          ON staged.sync_run_id = $1
         AND staged.version_id = $2
         AND staged.book = live.book
         AND staged.chapter = live.chapter
         AND staged.verse = live.verse
        WHERE live.version = $3 AND staged.book IS NULL
    `, [syncRunId, definition.canonicalVersion, definition.storageVersion]);
    const comparison = comparisonResult.rows[0];
    const report = {
        versionId: definition.canonicalVersion,
        storageVersion: definition.storageVersion,
        sourceVersion: definition.sourceVersion,
        syncRunId,
        staged: Object.fromEntries(Object.entries(staged).map(([key, value]) => [key, Number(value)])),
        existing: Number(comparison.existing),
        exact: Number(comparison.exact),
        normalizedEquivalent: Number(comparison.normalized_equivalent),
        contentDifferent: Number(comparison.content_different),
        missing: Number(comparison.missing),
        extras: Number(extrasResult.rows[0].extras)
    };
    if (report.contentDifferent !== 0 || report.extras !== 0) {
        throw new Error(`PROMOTION_CONTENT_GUARD_FAILED:${definition.canonicalVersion}:${JSON.stringify(report)}`);
    }
    if (report.existing + report.missing !== expected.expectedVerses) {
        throw new Error(`PROMOTION_COVERAGE_GUARD_FAILED:${definition.canonicalVersion}`);
    }
    return report;
}

async function promoteOne(pool, requestedVersion, requestedRunId, apply) {
    const definition = requireBibleVersion(requestedVersion);
    const expected = PROMOTABLE[definition.canonicalVersion];
    if (!expected) throw new Error(`PROMOTION_NOT_ALLOWED:${definition.canonicalVersion}`);
    const client = await pool.connect();
    try {
        const run = await resolveStagingRun(client, definition, requestedRunId);
        const inspection = await inspectPromotion(client, definition, expected, run.id);
        if (!apply) return { dryRun: true, ...inspection };

        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`bible-corpus:${definition.canonicalVersion}`]);
        const prior = await client.query(`
            SELECT * FROM bible_corpus_promotions
            WHERE version_id = $1 AND sync_run_id = $2 AND status = 'COMPLETED'
        `, [definition.canonicalVersion, run.id]);
        if (prior.rows[0]) {
            await client.query('COMMIT');
            return { dryRun: false, alreadyPromoted: true, promotionId: prior.rows[0].id, ...inspection };
        }

        const registryResult = await client.query(`
            SELECT * FROM bible_translation_versions WHERE version_id = $1 FOR UPDATE
        `, [definition.canonicalVersion]);
        const registryBefore = registryResult.rows[0];
        if (!registryBefore) throw new Error(`CORPUS_REGISTRY_MISSING:${definition.canonicalVersion}`);

        const promotionId = crypto.randomUUID();
        const startedReport = { ...inspection, registryBefore };
        await client.query(`
            INSERT INTO bible_corpus_promotions (
                id, version_id, storage_version, source_version, sync_run_id, status,
                existing_verses, exact_verses, normalized_equivalent_verses,
                content_different_verses, report
            ) VALUES ($1,$2,$3,$4,$5,'STARTED',$6,$7,$8,$9,$10::jsonb)
        `, [
            promotionId, definition.canonicalVersion, definition.storageVersion,
            definition.sourceVersion, run.id, inspection.existing, inspection.exact,
            inspection.normalizedEquivalent, inspection.contentDifferent,
            JSON.stringify(startedReport)
        ]);

        await client.query(`
            INSERT INTO bible_verse_revisions (
                promotion_id, verse_id, action, version, book, chapter, verse,
                previous_text, previous_source, previous_book_name, previous_metadata,
                previous_cached_at, new_text_sha256
            )
            SELECT $4, live.id, 'UPDATE', live.version, live.book, live.chapter, live.verse,
                   live.text, live.source, live.book_name, live.metadata, live.cached_at,
                   staged.source_sha256
            FROM bible_verse_staging staged
            JOIN bible_verses live
              ON live.version = $3
             AND live.book = staged.book
             AND live.chapter = staged.chapter
             AND live.verse = staged.verse
            WHERE staged.sync_run_id = $1 AND staged.version_id = $2
        `, [run.id, definition.canonicalVersion, definition.storageVersion, promotionId]);
        await client.query(`
            INSERT INTO bible_verse_revisions (
                promotion_id, verse_id, action, version, book, chapter, verse, new_text_sha256
            )
            SELECT $4,
                   $3 || '_' || replace(staged.book, ' ', '_') || '_' || staged.chapter || '_' || staged.verse,
                   'INSERT', $3, staged.book, staged.chapter, staged.verse, staged.source_sha256
            FROM bible_verse_staging staged
            LEFT JOIN bible_verses live
              ON live.version = $3
             AND live.book = staged.book
             AND live.chapter = staged.chapter
             AND live.verse = staged.verse
            WHERE staged.sync_run_id = $1 AND staged.version_id = $2 AND live.id IS NULL
        `, [run.id, definition.canonicalVersion, definition.storageVersion, promotionId]);

        const updated = await client.query(`
            UPDATE bible_verses live
            SET text = staged.text,
                book_name = staged.book_name,
                source = 'FHL_CORPUS_V4',
                metadata = COALESCE(live.metadata, '{}'::jsonb) || jsonb_build_object(
                    'source_version', staged.source_version,
                    'source_sha256', staged.source_sha256,
                    'verse_status', staged.verse_status,
                    'source_kind', COALESCE(staged.metadata->>'source_kind', 'FHL_OFFLINE_SQLITE'),
                    'corpus_sync_run_id', staged.sync_run_id,
                    'corpus_promotion_id', $4::TEXT,
                    'corpus_promoted_at', CURRENT_TIMESTAMP
                ),
                cached_at = CURRENT_TIMESTAMP
            FROM bible_verse_staging staged
            WHERE staged.sync_run_id = $1
              AND staged.version_id = $2
              AND live.version = $3
              AND live.book = staged.book
              AND live.chapter = staged.chapter
              AND live.verse = staged.verse
        `, [run.id, definition.canonicalVersion, definition.storageVersion, promotionId]);
        const inserted = await client.query(`
            INSERT INTO bible_verses (id, version, book, book_name, chapter, verse, text, source, metadata, cached_at)
            SELECT $3 || '_' || replace(staged.book, ' ', '_') || '_' || staged.chapter || '_' || staged.verse,
                   $3, staged.book, staged.book_name, staged.chapter, staged.verse, staged.text,
                   'FHL_CORPUS_V4',
                   jsonb_build_object(
                       'source_version', staged.source_version,
                       'source_sha256', staged.source_sha256,
                       'verse_status', staged.verse_status,
                       'source_kind', COALESCE(staged.metadata->>'source_kind', 'FHL_OFFLINE_SQLITE'),
                       'corpus_sync_run_id', staged.sync_run_id,
                       'corpus_promotion_id', $4::TEXT,
                       'corpus_promoted_at', CURRENT_TIMESTAMP
                   ),
                   CURRENT_TIMESTAMP
            FROM bible_verse_staging staged
            WHERE staged.sync_run_id = $1 AND staged.version_id = $2
            ON CONFLICT (version, book, chapter, verse) DO NOTHING
        `, [run.id, definition.canonicalVersion, definition.storageVersion, promotionId]);

        const verification = await client.query(`
            SELECT COUNT(*)::INTEGER AS verses,
                   COUNT(DISTINCT live.book)::INTEGER AS books,
                   COUNT(DISTINCT (live.book, live.chapter))::INTEGER AS chapters,
                   COUNT(*) FILTER (WHERE BTRIM(live.text) = '')::INTEGER AS blanks,
                   COUNT(*) FILTER (WHERE live.text IS DISTINCT FROM staged.text)::INTEGER AS differences
            FROM bible_verses live
            JOIN bible_verse_staging staged
              ON staged.sync_run_id = $1
             AND staged.version_id = $2
             AND staged.book = live.book
             AND staged.chapter = live.chapter
             AND staged.verse = live.verse
            WHERE live.version = $3
        `, [run.id, definition.canonicalVersion, definition.storageVersion]);
        const verified = verification.rows[0];
        if (Number(verified.verses) !== expected.expectedVerses
            || Number(verified.books) !== expected.expectedBooks
            || Number(verified.chapters) !== expected.expectedChapters
            || Number(verified.blanks) !== 0
            || Number(verified.differences) !== 0) {
            throw new Error(`POST_PROMOTION_VERIFICATION_FAILED:${definition.canonicalVersion}:${JSON.stringify(verified)}`);
        }

        const finalReport = {
            ...startedReport,
            promotionId,
            updatedVerses: updated.rowCount,
            insertedVerses: inserted.rowCount,
            verification: Object.fromEntries(Object.entries(verified).map(([key, value]) => [key, Number(value)])),
            newQuestionEligible: false
        };
        await client.query(`
            UPDATE bible_translation_versions
            SET actual_books = $2,
                actual_chapters = $3,
                actual_verses = $4,
                blank_verses = 0,
                coverage_status = 'COMPLETE',
                storage_policy = 'ACTIVE_CANONICAL',
                evidence_eligible = TRUE,
                new_question_eligible = FALSE,
                active_sync_run_id = $5,
                active_promotion_id = $6,
                metadata = metadata || jsonb_build_object(
                    'active_storage_version', $7::TEXT,
                    'active_source_version', $8::TEXT,
                    'active_sync_run_id', $5::TEXT,
                    'active_promotion_id', $6::TEXT,
                    'promoted_at', CURRENT_TIMESTAMP
                ),
                last_verified_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE version_id = $1
        `, [
            definition.canonicalVersion, expected.expectedBooks, expected.expectedChapters,
            expected.expectedVerses, run.id, promotionId, definition.storageVersion,
            definition.sourceVersion
        ]);
        await client.query(`
            UPDATE bible_corpus_promotions
            SET status = 'COMPLETED', inserted_verses = $2, updated_verses = $3,
                report = $4::jsonb, completed_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [promotionId, inserted.rowCount, updated.rowCount, JSON.stringify(finalReport)]);
        await client.query('COMMIT');
        return { dryRun: false, ...finalReport };
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch (_) { /* transaction may not have started */ }
        throw error;
    } finally {
        client.release();
    }
}

async function rollbackPromotion(pool, promotionId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const promotionResult = await client.query(`
            SELECT * FROM bible_corpus_promotions WHERE id = $1 FOR UPDATE
        `, [promotionId]);
        const promotion = promotionResult.rows[0];
        if (!promotion) throw new Error(`PROMOTION_NOT_FOUND:${promotionId}`);
        if (promotion.status === 'ROLLED_BACK') {
            await client.query('COMMIT');
            return { alreadyRolledBack: true, promotionId };
        }
        if (promotion.status !== 'COMPLETED') throw new Error(`PROMOTION_NOT_ROLLBACKABLE:${promotion.status}`);
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`bible-corpus:${promotion.version_id}`]);

        const drift = await client.query(`
            SELECT COUNT(*)::INTEGER AS count
            FROM bible_verse_revisions revision
            LEFT JOIN bible_verses live ON live.id = revision.verse_id
            LEFT JOIN bible_verse_staging staged
              ON staged.sync_run_id = $2
             AND staged.version_id = $3
             AND staged.book = revision.book
             AND staged.chapter = revision.chapter
             AND staged.verse = revision.verse
            WHERE revision.promotion_id = $1
              AND (live.id IS NULL OR staged.book IS NULL OR live.text IS DISTINCT FROM staged.text)
        `, [promotionId, promotion.sync_run_id, promotion.version_id]);
        if (Number(drift.rows[0].count) !== 0) {
            throw new Error(`ROLLBACK_CURRENT_CORPUS_DRIFT:${drift.rows[0].count}`);
        }

        const deleted = await client.query(`
            DELETE FROM bible_verses live
            USING bible_verse_revisions revision
            WHERE revision.promotion_id = $1 AND revision.action = 'INSERT'
              AND live.id = revision.verse_id
        `, [promotionId]);
        const restored = await client.query(`
            UPDATE bible_verses live
            SET text = revision.previous_text,
                source = revision.previous_source,
                book_name = revision.previous_book_name,
                metadata = revision.previous_metadata,
                cached_at = revision.previous_cached_at
            FROM bible_verse_revisions revision
            WHERE revision.promotion_id = $1 AND revision.action = 'UPDATE'
              AND live.id = revision.verse_id
        `, [promotionId]);

        const before = promotion.report?.registryBefore || {};
        await client.query(`
            UPDATE bible_translation_versions
            SET actual_books = $2, actual_chapters = $3, actual_verses = $4,
                blank_verses = $5, coverage_status = $6, storage_policy = $7,
                evidence_eligible = $8, new_question_eligible = FALSE,
                active_sync_run_id = $9, active_promotion_id = $10,
                metadata = $11::jsonb, last_verified_at = $12, updated_at = CURRENT_TIMESTAMP
            WHERE version_id = $1
        `, [
            promotion.version_id, before.actual_books || 0, before.actual_chapters || 0,
            before.actual_verses || 0, before.blank_verses || 0,
            before.coverage_status || 'UNVERIFIED', before.storage_policy || 'OFFLINE_ALLOWED',
            before.evidence_eligible === true, before.active_sync_run_id || null,
            before.active_promotion_id || null, JSON.stringify(before.metadata || {}),
            before.last_verified_at || null
        ]);
        await client.query(`
            UPDATE bible_corpus_promotions
            SET status = 'ROLLED_BACK', rolled_back_at = CURRENT_TIMESTAMP,
                report = report || jsonb_build_object(
                    'rollback', jsonb_build_object(
                        'deleted', $2::INTEGER, 'restored', $3::INTEGER, 'at', CURRENT_TIMESTAMP
                    )
                )
            WHERE id = $1
        `, [promotionId, deleted.rowCount, restored.rowCount]);
        await client.query('COMMIT');
        return { promotionId, deleted: deleted.rowCount, restored: restored.rowCount };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return;
    }
    const pool = createPool();
    try {
        if (options.rollbackPromotionId) {
            console.log(JSON.stringify(await rollbackPromotion(pool, options.rollbackPromotionId), null, 2));
            return;
        }
        const results = [];
        for (const version of options.versions) {
            results.push(await promoteOne(pool, version, options.syncRunId, options.apply));
        }
        console.log(JSON.stringify({ apply: options.apply, results }, null, 2));
    } finally {
        await pool.end();
    }
}

const isMainModule = process.argv[1]
    && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
    main().catch(error => {
        console.error(`[Bible Corpus Promotion] ${error.message}`);
        process.exitCode = 1;
    });
}

export { inspectPromotion, parseArgs, PROMOTABLE };
