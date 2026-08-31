import { initializeInfrastructure, dbOps } from '../database/index.js';
import { ensureOrderLabSeeds } from '../domains/scripture-tools/order-service.js';
import { auditOrderPassage } from '../domains/scripture-tools/order-engine.js';

const apply = process.argv.includes('--apply');

await initializeInfrastructure();
await ensureOrderLabSeeds();

const passages = await dbOps.gamesDb.query(`
    SELECT * FROM scripture_order_lab_passages
    WHERE is_official = TRUE AND is_published = TRUE
    ORDER BY book, chapter, verse_start
`);

const report = [];
for (const passage of passages) {
    const fragments = Array.isArray(passage.fragments) ? passage.fragments : [];
    const audit = auditOrderPassage({
        sourceText: passage.sourceText,
        fragments,
        difficulty: passage.difficulty
    });
    const reference = `${passage.book} ${passage.chapter}:${passage.verseStart}-${passage.verseEnd}`;
    report.push({
        passageId: passage.id,
        title: passage.title,
        reference,
        ...audit,
        boundaries: undefined
    });

    if (!apply) continue;
    const savedDetails = passage.auditDetails && typeof passage.auditDetails === 'object'
        ? passage.auditDetails
        : {};
    const auditState = audit.readiness === 'READY'
        ? (passage.auditState === 'PASS' ? 'PASS' : 'DETERMINISTIC_PASS')
        : audit.readiness;
    await dbOps.gamesDb.run(`
        UPDATE scripture_order_lab_passages
        SET audit_state = $1,
            audit_details = $2::jsonb,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
    `, [auditState, JSON.stringify({
        ...savedDetails,
        deterministicAudit: { ...audit, boundaries: undefined },
        deterministicAuditVersion: 'seed-audit-v1'
    }), passage.id]);
}

const counts = report.reduce((result, item) => {
    result[item.readiness] = (result[item.readiness] || 0) + 1;
    return result;
}, {});

console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    runtimeAi: false,
    inspected: passages.length,
    counts,
    report
}, null, 2));

for (const adapter of new Set([dbOps.usersDb, dbOps.contentDb, dbOps.notesDb, dbOps.gamesDb])) {
    await adapter.close();
}
