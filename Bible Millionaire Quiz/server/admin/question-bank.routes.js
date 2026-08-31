import express from 'express';
import crypto from 'node:crypto';
import { dbOps } from '../database/index.js';
import { bibleTranslator } from '../utils/bibleTranslator.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import questionBankGovernanceService, {
    ACTIVE_QUESTION_BANKS,
    DEFAULT_QUESTION_BANK_POLICY
} from '../domains/game/governance/QuestionBankGovernanceService.js';

const router = express.Router();
const canRead = [authenticateToken, requireRole(['admin_content', 'admin_ops'])];
const canEditContent = [authenticateToken, requireRole(['admin_content'])];
const canEditPolicy = [authenticateToken, requireRole(['admin_ops'])];

function errorResponse(res, error) {
    const known = new Set([
        'UNSUPPORTED_BIBLE_VERSION', 'INVALID_POLICY_CONFIG', 'INVALID_POLICY_SCOPE',
        'INVALID_GLOBAL_SCOPE', 'INVALID_VERSION_SCOPE', 'INVALID_BOOK_SCOPE',
        'INVALID_MILESTONES', 'INVALID_DIFFICULTY_RATIOS', 'INVALID_CATEGORY_MODE',
        'INVALID_POLICY_PREVIEW', 'STALE_POLICY_PREVIEW', 'INVALID_PUBLICATION_STATE',
        'QUESTION_NOT_PUBLISHABLE', 'QUESTION_NOT_FOUND', 'POLICY_NOT_FOUND'
    ]);
    const code = String(error?.message || 'QUESTION_BANK_ERROR');
    const status = ['QUESTION_NOT_FOUND', 'POLICY_NOT_FOUND'].includes(code) ? 404
        : code === 'STALE_POLICY_PREVIEW' ? 409
            : (known.has(code) || code.startsWith('UNKNOWN_POLICY_FIELD:') || code.startsWith('INVALID_POLICY_NUMBER:') || code.startsWith('INVALID_POLICY_BOOLEAN:')) ? 400 : 500;
    return res.status(status).json({ success: false, error: code });
}

router.get('/metadata', ...canRead, (_req, res) => {
    res.json({
        success: true,
        versions: ACTIVE_QUESTION_BANKS,
        publicationStates: ['PUBLISHED', 'IN_REVIEW', 'SUSPENDED', 'DRAFT', 'ARCHIVED'],
        defaultPolicy: DEFAULT_QUESTION_BANK_POLICY
    });
});

router.get('/corpus-status', ...canRead, async (_req, res) => {
    try {
        res.json({ success: true, versions: await questionBankGovernanceService.getCorpusStatus() });
    } catch (error) { errorResponse(res, error); }
});

router.get('/overview', ...canRead, async (req, res) => {
    try {
        const data = await questionBankGovernanceService.getOverview({ versionId: req.query.version || null });
        res.json({ success: true, ...data });
    } catch (error) { errorResponse(res, error); }
});

router.get('/questions', ...canRead, async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
        const params = [];
        const where = [];
        const add = value => { params.push(value); return `$${params.length}`; };
        if (req.query.version) where.push(`q.canonical_version = ${add(String(req.query.version))}`);
        if (req.query.book) where.push(`q.book = ${add(String(req.query.book))}`);
        if (req.query.state) where.push(`q.publication_state = ${add(String(req.query.state).toUpperCase())}`);
        if (req.query.category) where.push(`q.category = ${add(String(req.query.category))}`);
        if (req.query.difficulty) where.push(`q.difficulty_band = ${add(String(req.query.difficulty).toUpperCase())}`);
        if (req.query.search) {
            const pattern = `%${String(req.query.search).trim()}%`;
            const slot = add(pattern);
            where.push(`(q.question ILIKE ${slot} OR q.answer ILIKE ${slot} OR q.verse_ref ILIKE ${slot})`);
        }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const count = await dbOps.gamesDb.get(`SELECT COUNT(*)::INTEGER AS total FROM questions q ${whereSql}`, params);
        params.push(bibleTranslator.allBooks, limit, (page - 1) * limit);
        const bookOrderSlot = `$${params.length - 2}`;
        const rows = await dbOps.gamesDb.query(`
            SELECT q.id, q.canonical_version, q.legacy_version_code, q.book, q.chapter,
                   q.verse_ref, q.question, q.answer, q.category, q.difficulty_band,
                   q.final_difficulty_score, q.publication_state, q.publication_state_reason,
                   q.quality_state, q.source, q.updated_at,
                   audit.result AS latest_audit_result,
                   audit.reason AS latest_audit_reason,
                   revision.state AS candidate_revision_state
            FROM questions q
            LEFT JOIN LATERAL (
                SELECT result, reason FROM question_quality_audits
                WHERE question_id = q.id ORDER BY created_at DESC LIMIT 1
            ) audit ON TRUE
            LEFT JOIN LATERAL (
                SELECT state FROM question_revisions
                WHERE question_id = q.id AND state = 'CANDIDATE'
                ORDER BY revision_number DESC LIMIT 1
            ) revision ON TRUE
            ${whereSql}
            ORDER BY
                COALESCE(array_position(${bookOrderSlot}::TEXT[], q.book), 999),
                q.chapter ASC NULLS LAST,
                q.verse_start ASC NULLS LAST,
                CASE q.publication_state WHEN 'SUSPENDED' THEN 1 WHEN 'IN_REVIEW' THEN 2 WHEN 'DRAFT' THEN 3 WHEN 'PUBLISHED' THEN 4 ELSE 5 END,
                q.updated_at DESC NULLS LAST
            LIMIT $${params.length - 1} OFFSET $${params.length}
        `, params);
        res.json({
            success: true,
            questions: rows,
            pagination: { page, limit, total: Number(count?.total || 0), totalPages: Math.max(1, Math.ceil(Number(count?.total || 0) / limit)) }
        });
    } catch (error) { errorResponse(res, error); }
});

router.get('/questions/:id', ...canRead, async (req, res) => {
    try {
        const question = await dbOps.gamesDb.get(`SELECT * FROM questions WHERE id = $1`, [req.params.id]);
        if (!question) return res.status(404).json({ success: false, error: 'QUESTION_NOT_FOUND' });
        const [revisions, audits, checks] = await Promise.all([
            dbOps.gamesDb.query(`SELECT * FROM question_revisions WHERE question_id = $1 ORDER BY revision_number DESC`, [req.params.id]),
            dbOps.gamesDb.query(`SELECT * FROM question_quality_audits WHERE question_id = $1 ORDER BY created_at DESC`, [req.params.id]),
            dbOps.gamesDb.query(`SELECT * FROM question_checks WHERE question_id = $1 ORDER BY created_at DESC`, [req.params.id])
        ]);
        res.json({ success: true, question, revisions, audits, checks });
    } catch (error) { errorResponse(res, error); }
});

router.get('/work-queue', ...canRead, async (req, res) => {
    try {
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
        const rows = await dbOps.gamesDb.query(`
            SELECT id, canonical_version, book, chapter, verse_ref, question, answer, category,
                   difficulty_band, publication_state, publication_state_reason, quality_state,
                   audit_reason, updated_at
            FROM questions
            WHERE publication_state IN ('SUSPENDED', 'IN_REVIEW', 'DRAFT')
            ORDER BY CASE publication_state WHEN 'SUSPENDED' THEN 1 WHEN 'IN_REVIEW' THEN 2 ELSE 3 END,
                     COALESCE(array_position($1::TEXT[], book), 999),
                     chapter ASC NULLS LAST, verse_start ASC NULLS LAST,
                     updated_at DESC NULLS LAST
            LIMIT $2
        `, [bibleTranslator.allBooks, limit]);
        res.json({ success: true, items: rows });
    } catch (error) { errorResponse(res, error); }
});

router.get('/policies/effective', ...canRead, async (req, res) => {
    try {
        const result = await questionBankGovernanceService.getEffectivePolicy({
            versionId: req.query.version || null,
            book: req.query.book || null
        });
        res.json({ success: true, ...result });
    } catch (error) { errorResponse(res, error); }
});

router.get('/policies/history', ...canRead, async (req, res) => {
    try {
        const policies = await questionBankGovernanceService.getPolicyHistory({
            versionId: req.query.version || null,
            book: req.query.book || null,
            limit: req.query.limit || 20
        });
        res.json({ success: true, policies });
    } catch (error) { errorResponse(res, error); }
});

router.post('/policies/preview', ...canEditPolicy, async (req, res) => {
    try {
        res.json({ success: true, ...(await questionBankGovernanceService.previewPolicy(req.body || {})) });
    } catch (error) { errorResponse(res, error); }
});

router.post('/policies/apply', ...canEditPolicy, async (req, res) => {
    try {
        const result = await questionBankGovernanceService.applyPolicy({
            preview: req.body?.preview,
            previewToken: req.body?.previewToken,
            actor: req.user?.userId || 'admin'
        });
        res.json({ success: true, policy: result });
    } catch (error) { errorResponse(res, error); }
});

router.post('/policies/:id/rollback', ...canEditPolicy, async (req, res) => {
    try {
        const result = await questionBankGovernanceService.rollbackPolicy({
            policyId: req.params.id,
            actor: req.user?.userId || 'admin'
        });
        res.json({ success: true, policy: result });
    } catch (error) { errorResponse(res, error); }
});

router.post('/questions/:id/recheck', ...canEditContent, async (req, res) => {
    try {
        const question = await dbOps.gamesDb.get('SELECT id FROM questions WHERE id = $1', [req.params.id]);
        if (!question) return res.status(404).json({ success: false, error: 'QUESTION_NOT_FOUND' });
        const result = await dbOps.gamesDb.run(`
            INSERT INTO question_quality_jobs
                (id, job_type, question_id, priority, dedupe_key)
            VALUES ($1, 'QUESTION_AUDIT_V4_1', $2, 10, $3)
            ON CONFLICT DO NOTHING
        `, [crypto.randomUUID(), req.params.id, `QUESTION_AUDIT_V4_1:${req.params.id}`]);
        res.status(202).json({ success: true, enqueued: result.changes || 0 });
    } catch (error) { errorResponse(res, error); }
});

for (const [path, state] of Object.entries({ publish: 'PUBLISHED', suspend: 'SUSPENDED', archive: 'ARCHIVED' })) {
    router.post(`/questions/:id/${path}`, ...canEditContent, async (req, res) => {
        try {
            const result = await questionBankGovernanceService.setPublicationState({
                questionId: req.params.id,
                state,
                reason: req.body?.reason || null,
                actor: req.user?.userId || 'admin'
            });
            res.json({ success: true, result });
        } catch (error) { errorResponse(res, error); }
    });
}

router.get('/replenishment/status', ...canRead, async (_req, res) => {
    try {
        const { default: replenishmentService } = await import('../domains/game/replenishment/QuestionReplenishmentService.js');
        res.json({ success: true, service: replenishmentService.getStatus(), targeted: replenishmentService.getTargetedStatus() });
    } catch (error) { errorResponse(res, error); }
});

export default router;
