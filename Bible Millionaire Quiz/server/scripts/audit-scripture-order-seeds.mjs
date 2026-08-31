import { initializeInfrastructure, dbOps } from '../database/index.js';
import { LogosEngine } from '../infrastructure/ai/LogosEngine.js';
import { ensureOrderLabSeeds } from '../domains/scripture-tools/order-service.js';
import { verifyFragments } from '../domains/scripture-tools/order-engine.js';

const apply = process.argv.includes('--apply');
const candidateOnly = process.argv.includes('--candidate-only');

function parseFragments(value) {
    if (!Array.isArray(value)) return [];
    return value.map((text, index) => ({ id: `f${index + 1}`, text: String(text || '') })).filter(fragment => fragment.text);
}

await initializeInfrastructure();
await ensureOrderLabSeeds();

const passages = await dbOps.gamesDb.query(`
    SELECT * FROM scripture_order_lab_passages
    WHERE is_official = TRUE AND is_published = TRUE
    ORDER BY id
`);
const candidates = [];

for (const passage of passages) {
    const savedDetails = passage.auditDetails && typeof passage.auditDetails === 'object' ? passage.auditDetails : {};
    let generated = null;
    let fragments = parseFragments(savedDetails.candidateFragments);
    let exact = verifyFragments(passage.sourceText, fragments);
    for (let attempt = 1; !exact && attempt <= 2; attempt += 1) {
        generated = await LogosEngine.askBrain('scripture_order_fragment_generation', {
            reference: `${passage.book} ${passage.chapter}:${passage.verseStart}-${passage.verseEnd}`,
            source_text: passage.sourceText,
            target_count: passage.fragmentCount,
            maxTokens: 2048
        }, {
            freeOnly: true,
            compactSystemInstruction: true,
            retry: false,
            maxAttempts: 2,
            correlationId: `scripture-order-candidate:${passage.id}:${attempt}`
        });
        fragments = parseFragments(generated?.fragments);
        exact = verifyFragments(passage.sourceText, fragments);
    }
    candidates.push({
        passage_id: passage.id,
        source_text: passage.sourceText,
        target_count: passage.fragmentCount,
        fragments: exact ? fragments.map(fragment => fragment.text) : [],
        candidate_exact: exact,
        generation_error: generated?.error || (exact ? null : 'EXACT_REASSEMBLY_FAILED')
    });
    if (apply && exact && passage.auditState !== 'PASS') {
        await dbOps.gamesDb.run(`
            UPDATE scripture_order_lab_passages SET
                generation_model = 'free-key-router',
                audit_details = $1::jsonb, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `, [JSON.stringify({ ...savedDetails, candidateFragments: fragments.map(fragment => fragment.text), candidateExact: true, paidAuditPending: true }), passage.id]);
    }
}

const auditable = candidates.filter(candidate => candidate.candidate_exact);
const audit = !candidateOnly && auditable.length ? await LogosEngine.askBrain('scripture_order_fragment_audit', {
    passages: auditable,
    maxTokens: 4096
}, {
    paidOnly: true,
    compactSystemInstruction: true,
    retry: false,
    maxAttempts: 1,
    correlationId: 'scripture-order-seed-batch-audit'
}) : { results: [] };

const audits = new Map((audit?.results || []).map(result => [result.passage_id, result]));
const report = [];
for (const candidate of candidates) {
    const verdict = audits.get(candidate.passage_id);
    const passed = candidate.candidate_exact && verdict?.verdict === 'PASS';
    report.push({ passageId: candidate.passage_id, candidateExact: candidate.candidate_exact, verdict: verdict?.verdict || 'NOT_AUDITED', reason: verdict?.reason || candidate.generation_error });
    if (!apply || !passed) continue;
    const fragments = parseFragments(candidate.fragments);
    await dbOps.gamesDb.run(`
        UPDATE scripture_order_lab_passages SET
            fragments = $1::jsonb, fragment_count = $2,
            segmentation_method = 'gemini_candidate_paid_audit',
            segmentation_version = 'ai-audit-v1',
            generation_model = 'free-key-router', audit_model = 'paid-key-router',
            audit_state = 'PASS', audit_details = $3::jsonb,
            revision = revision + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
    `, [JSON.stringify(fragments), fragments.length, JSON.stringify(verdict), candidate.passage_id]);
}

console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', candidateOnly, inspected: passages.length, exactCandidates: candidates.filter(item => item.candidate_exact).length, passed: report.filter(item => item.verdict === 'PASS').length, report }, null, 2));
for (const adapter of new Set([dbOps.usersDb, dbOps.contentDb, dbOps.notesDb, dbOps.gamesDb])) {
    await adapter.close();
}
