import { initializeInfrastructure, dbOps } from '../database/index.js';
import { ensureOrderLabSeeds } from '../domains/scripture-tools/order-service.js';
import {
    startSegmentationCruise,
    waitForSegmentationCruise
} from '../domains/scripture-tools/segmentation-cruise-service.js';
import { SCRIPTURE_SEGMENTATION_RULE_VERSION } from '../domains/scripture-tools/healthy-segmentation-engine.js';

function visibleLength(value) {
    return Array.from(String(value || '')).filter(character => /[\p{L}\p{N}\p{Script=Han}]/u.test(character)).length;
}

async function count(table, where = '') {
    const row = await dbOps.gamesDb.get(`SELECT COUNT(*)::integer AS count FROM ${table} ${where}`);
    return Number(row?.count || 0);
}

try {
    await initializeInfrastructure();
    const activeRuns = await count(
        'scripture_segmentation_runs',
        "WHERE status IN ('PENDING','RUNNING','PAUSE_REQUESTED','PAUSED')"
    );
    if (activeRuns > 0) throw new Error('SEGMENTATION_REBUILD_ALREADY_ACTIVE');

    const before = {
        entries: await count('scripture_segmentation_entries'),
        cache: await count('scripture_order_segmentation_cache'),
        runs: await count('scripture_segmentation_runs'),
        activeOrderSessions: await count('scripture_order_lab_sessions', "WHERE status IN ('active','stage_complete')"),
        activeRainSessions: await count('scripture_rain_sessions', "WHERE status IN ('preview','active')")
    };
    console.log(JSON.stringify({ event: 'before-purge', before }, null, 2));

    await dbOps.gamesDb.transaction(async tx => {
        await tx.run(`
            UPDATE scripture_order_lab_sessions
            SET status = 'failed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE status IN ('active','stage_complete')
        `);
        await tx.run(`
            UPDATE scripture_rain_sessions
            SET status = 'failed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE status IN ('preview','active')
        `);
        await tx.run('DELETE FROM scripture_segmentation_entries');
        await tx.run('DELETE FROM scripture_segmentation_runs');
        await tx.run('DELETE FROM scripture_order_segmentation_cache');
        await tx.run(`
            UPDATE scripture_order_lab_passages
            SET fragments = '[]'::jsonb,
                fragment_count = 0,
                segmentation_method = 'rebuild_pending',
                segmentation_version = 'rebuild-pending',
                generation_model = NULL,
                audit_model = NULL,
                audit_state = 'DETERMINISTIC_PASS',
                audit_details = jsonb_build_object('rebuildPending', TRUE),
                revision = revision + 1,
                updated_at = CURRENT_TIMESTAMP
        `);
    });
    console.log(JSON.stringify({ event: 'purged-and-sessions-settled' }));

    const started = await startSegmentationCruise({ dryRun: false, batchSize: 500, createdBy: 'rebuild-cli' });
    console.log(JSON.stringify({ event: 'rebuild-started', runId: started.id, totalVerses: started.totalVerses }));
    const completed = await waitForSegmentationCruise(started.id);
    if (completed?.status !== 'COMPLETED') {
        throw new Error(`SEGMENTATION_REBUILD_${completed?.status || 'UNKNOWN'}`);
    }

    await ensureOrderLabSeeds();

    const rows = await dbOps.gamesDb.query(`
        SELECT fragments FROM scripture_segmentation_entries
        WHERE active = TRUE AND rule_version = $1
    `, [SCRIPTURE_SEGMENTATION_RULE_VERSION]);
    let maximumVisibleLength = 0;
    let oversizedFragments = 0;
    for (const row of rows) {
        const fragments = Array.isArray(row.fragments) ? row.fragments : JSON.parse(row.fragments || '[]');
        for (const fragment of fragments) {
            const length = visibleLength(fragment);
            maximumVisibleLength = Math.max(maximumVisibleLength, length);
            if (length > 10) oversizedFragments += 1;
        }
    }
    const after = {
        activeEntries: await count('scripture_segmentation_entries', 'WHERE active = TRUE'),
        staleActiveEntries: await count('scripture_segmentation_entries', `WHERE active = TRUE AND rule_version <> '${SCRIPTURE_SEGMENTATION_RULE_VERSION}'`),
        cache: await count('scripture_order_segmentation_cache'),
        officialPassages: await count('scripture_order_lab_passages', `WHERE is_official = TRUE AND is_published = TRUE AND segmentation_version = '${SCRIPTURE_SEGMENTATION_RULE_VERSION}'`),
        activeOrderSessions: await count('scripture_order_lab_sessions', "WHERE status IN ('active','stage_complete')"),
        activeRainSessions: await count('scripture_rain_sessions', "WHERE status IN ('preview','active')"),
        maximumVisibleLength,
        oversizedFragments
    };
    console.log(JSON.stringify({ event: 'rebuild-completed', ruleVersion: SCRIPTURE_SEGMENTATION_RULE_VERSION, after }, null, 2));
    process.exit(oversizedFragments === 0 && after.staleActiveEntries === 0 && after.officialPassages === 20 ? 0 : 2);
} catch (error) {
    console.error(JSON.stringify({
        event: 'rebuild-failed',
        code: error?.code || 'SCRIPTURE_SEGMENTATION_REBUILD_FAILED',
        message: error?.message || String(error)
    }, null, 2));
    process.exit(1);
}
