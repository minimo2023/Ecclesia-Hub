import express from 'express';
import scriptureSegmentationRoutes from './scripture-segmentation.routes.js';
import bcrypt from 'bcryptjs';
import { dbOps } from '../database/index.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import AuditLogService from '../infrastructure/AuditLogService.js';
import SecurityService from '../domains/members/SecurityService.js';
import { getIO } from '../socket/index.js';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { LogosBank } from '../database/services/LogosBankService.js';
import { reconcileAICreditWallets, getWalletSnapshot } from '../database/migrations/reconcile_ai_credits.js';
import { autoFixQuestion } from '../domains/game/engine/questionAuditor.js';
import { questionQualityService } from '../domains/game/quality/QuestionQualityService.js';
import { buildQuestionRevisionCandidate } from '../domains/game/quality/QuestionRevisionPayload.js';
import {
    assembleVerifiedQuestion,
    getQuestionPlayability,
    normalizeDistractorSets
} from '../domains/game/quality/QuestionOptionAssembler.js';

const router = express.Router();
router.use('/scripture-segmentation', scriptureSegmentationRoutes);

function governanceQuestion(row) {
    const distractorSets = normalizeDistractorSets(row);
    const playability = getQuestionPlayability(row);
    const preview = playability.playable
        ? assembleVerifiedQuestion(row, { random: () => 0.25 })
        : null;
    return {
        ...row,
        distractorSets,
        previewOptions: preview?.ok ? preview.question.options : [],
        playable: playability.playable,
        playabilityReason: playability.reason,
        latestAudit: row.latestAuditId ? {
            id: row.latestAuditId,
            revisionId: row.latestAuditRevisionId || null,
            result: row.latestAuditResult || null,
            reason: row.latestAuditReason || null,
            riskFlags: row.latestRiskFlags || [],
            distractorResults: row.latestDistractorResults || [],
            evidenceSnapshot: row.latestEvidenceSnapshot || null,
            difficultySnapshot: row.latestDifficultySnapshot || null,
            createdAt: row.latestAuditAt || null
        } : null,
        candidateRevision: row.candidateRevisionId ? {
            id: row.candidateRevisionId,
            number: row.candidateRevisionNumber,
            state: row.candidateRevisionState,
            payload: row.candidateRevisionPayload,
            createdAt: row.candidateRevisionCreatedAt
        } : null
    };
}

/**
 * [DEBUG] UNIQUE_v403 - 2026-03-28
 * This file has been fully reconstructed to ensure Postgres alignment.
 */
router.use((req, res, next) => {
    console.log(`🛡️ Admin Router hit (UNIQUE_v403): ${req.method} ${req.url}`);
    next();
});

// ==========================================
// 0. AI 語意去重與審計狀態 (Audit & Alerts) - 最優先路由
// ==========================================

/**
 * GET /admin/questions/audit-status
 * 返回目前系統通知狀態 （小紅點來源）
 */
router.get('/questions/audit-status', authenticateToken, requireRole(['admin_content', 'admin_ops']), async (req, res) => {
    try {
        const row = await dbOps.gamesDb.get(`
            SELECT COUNT(*)::INTEGER AS count
            FROM questions
            WHERE COALESCE(quality_state, 'LEGACY') IN
                ('LEGACY', 'NEEDS_REPAIR', 'QUARANTINED', 'EVIDENCE_UNAVAILABLE')
        `);
        const flaggedCount = Number(row?.count || 0);
        res.json({ success: true, hasAlert: flaggedCount > 0, flaggedCount, count: flaggedCount });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /admin/questions/audit
 * 手動排入 V4.1 題庫治理稽核；不再呼叫會直接刪題的舊版 prune 流程。
 */
router.post('/questions/audit', authenticateToken, requireRole(['admin_content']), async (req, res) => {
    const { book = null, chapter = null, limit = 500 } = req.body || {};

    try {
        const queued = await questionQualityService.enqueueAuditJobs({ limit, book, chapter });
        const label = book ? `${book}${chapter ? ` 第${chapter}章` : ''}` : '目前範圍';
        res.json({
            success: true,
            queued,
            message: `已將 ${queued.enqueued} 題排入 V4.1 雙重稽核（${label}）；稽核本身不會直接刪題。`
        });

        setImmediate(async () => {
            try {
                await questionQualityService.runPatrolBatch(Math.min(queued.enqueued, Number(limit) || 500));
            } catch (err) {
                console.error('❌ [V4.1 Governance] Background audit failed:', err.message);
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/questions/audit/acknowledge', authenticateToken, requireRole(['admin_content', 'admin_ops']), async (req, res) => {
    res.json({ success: true, message: '通知已清除（主權歸一化不留通知）' });
});

/**
 * POST /admin/questions/:id/autofix
 * 一鍵修正待審題目
 */
router.post('/questions/:id/autofix', authenticateToken, requireRole(['admin_content', 'admin_ops']), async (req, res) => {
    try {
        const { id } = req.params;
        const { instruction } = req.body;
        const fixedQuestion = await autoFixQuestion(id, instruction);
        res.json({ success: true, data: fixedQuestion });
    } catch (error) {
        console.error(`[Admin] Auto-fix error for question ${req.params.id}:`, error);
        res.status(500).json({ success: false, error: error.message || 'Auto-fix failed' });
    }
});

// ==========================================
// 1. Dashboard & System Stats
// ==========================================

router.get('/stats', authenticateToken, requireRole(['admin_ops', 'admin_content']), async (req, res) => {
    try {
        const stats = await dbOps.getStats();
        res.json(stats);
    } catch (error) {
        console.error('Admin Stats Error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/knowledge/stats', authenticateToken, requireRole(['admin_ops', 'admin_content']), async (req, res) => {
    try {
        const stats = await dbOps.getStats();
        res.json({
            success: true,
            verses: stats.verses || 0,
            people: stats.people || 0,
            locations: stats.locations || 0,
            events: stats.events || 0,
            themes: stats.objects || 0,
            relationships: 0,
            commentaries: stats.commentaries || 0,
            coverage: {
                verses: 100,
                aiTagged: 85,
                graphDensity: 42
            },
            quality: {
                aiConfidence: 0.92,
                lowConfidenceCount: 15,
                pendingReview: 5
            }
        });
    } catch (error) {
        console.error('Knowledge Stats Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/system-stats', authenticateToken, requireRole(['admin_ops']), async (req, res) => {
    try {
        const knowledgeStats = await dbOps.getStats();
        const sysInfo = await dbOps.getSystemInfo();
        res.json({
            success: true,
            stats: {
                users: knowledgeStats.users || 0,
                verses: knowledgeStats.verses || 0,
                people: knowledgeStats.people || 0,
                locations: knowledgeStats.locations || 0,
                events: knowledgeStats.events || 0,
                knowledge: knowledgeStats.objects || 0,
                commentaries: knowledgeStats.commentaries || 0
            },
            system: sysInfo
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/economy/stats', authenticateToken, requireRole(['admin_ops', 'admin_economy']), async (req, res) => {
    try {
        const stats = await dbOps.getEconomyTotalStats();
        res.json({ success: true, ...stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /admin/economy/wallet-snapshot
 * 取得全站用戶的 AI 點數快照報表（稽核用）
 */
router.get('/economy/wallet-snapshot', authenticateToken, requireRole(['super_admin', 'admin_economy']), async (req, res) => {
    try {
        const snapshot = await getWalletSnapshot();
        res.json({ success: true, data: snapshot, total: snapshot.length });
    } catch (error) {
        console.error('❌ [Admin] Wallet snapshot error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /admin/economy/reconcile
 * 執行 AI 點數錢包稽核 + 補洞修復
 * 修補歷史資料問題：確保每個用戶都有正確的 ai_gov.user_ai_credit_wallet 記錄
 */
router.post('/economy/reconcile', authenticateToken, requireRole(['super_admin']), async (req, res) => {
    try {
        console.log(`🔧 [Admin] Wallet reconcile triggered by user: ${req.user.userId}`);
        const result = await reconcileAICreditWallets();
        await AuditLogService.logAdmin(req.user.userId, 'ECONOMY_RECONCILE', 'system', 'ai_credit_wallet', result.summary, req);
        res.json(result);
    } catch (error) {
        console.error('❌ [Admin] Reconcile error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/devotionals', authenticateToken, requireRole(['admin_ops', 'admin_content']), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';

        const result = await dbOps.getDevotionalHistory({ page, limit, search });
        res.json({
            success: true,
            data: result.history,
            pagination: result.pagination
        });
    } catch (error) {
        console.error('Admin Devotionals GET Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 2. Knowledge Management (Objects & Locations)
// ==========================================

router.get('/knowledge/objects', authenticateToken, requireRole(['admin_ops', 'admin_content']), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        let query = `SELECT id, name_zh AS name, category, description, image_path, created_at FROM bible_objects WHERE 1=1`;
        let countQuery = `SELECT COUNT(*) as total FROM bible_objects WHERE 1=1`;
        const params = [];

        if (search) {
            query += ` AND (name_zh LIKE $1 OR description LIKE $2)`;
            countQuery += ` AND (name_zh LIKE $1 OR description LIKE $2)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        const countResult = await dbOps.contentDb.get(countQuery, params);
        const total = countResult ? parseInt(countResult.total) : 0;

        query += ` ORDER BY name_zh ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        const results = await dbOps.contentDb.query(query, [...params, limit, offset]);

        res.json({
            success: true,
            data: results,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Knowledge Objects GET Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/knowledge/locations', authenticateToken, requireRole(['admin_ops', 'admin_content']), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        console.log(`🔍 [AdminKnowledge] Fetching locations - Page: ${page}, Limit: ${limit}, Search: "${search}"`);

        // NOTE: Postgres uses 'lon', Frontend expects 'lng'
        // [UNIFIED ARCHITECTURE] Ensure critical columns exist.
        let query = `SELECT id, name_zh AS name, modern_name, lat, lon AS lng, description, image_path FROM locations WHERE 1=1`;
        let countQuery = `SELECT COUNT(*) as total FROM locations WHERE 1=1`;
        const params = [];

        if (search) {
            query += ` AND (name_zh LIKE $1 OR modern_name LIKE $2 OR description LIKE $3)`;
            countQuery += ` AND (name_zh LIKE $1 OR modern_name LIKE $2 OR description LIKE $3)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        const countResult = await dbOps.contentDb.get(countQuery, params);
        const total = countResult ? parseInt(countResult.total) : 0;

        query += ` ORDER BY name_zh ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        const results = await dbOps.contentDb.query(query, [...params, limit, offset]);

        res.json({
            success: true,
            data: results,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('❌ Knowledge Locations GET Error:', error);
        res.status(500).json({ success: false, error: `地理清單加載失敗: ${error.message}` });
    }
});

// ==========================================
// 3. Question Management
// ==========================================

router.get('/questions', authenticateToken, requireRole(['admin_content']), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const search = req.query.search || '';
        const book = req.query.book || '';
        const difficulty = req.query.difficulty || '';
        const category = req.query.category || '';
        const source = req.query.source || ''; // 新增來源過濾
        const status = req.query.status || ''; // 新增狀態過濾
        const qualityState = String(req.query.state || '').toUpperCase();
        const offset = (page - 1) * limit;

        let query = `
            SELECT
                q.id, q.book, q.chapter, q.verse_start, q.verse_end, q.verse_ref, q.version, q.difficulty,
                q.question, q.answer, q.options, q.correct_index, q.distractors_pool,
                q.evidence, q.evidence_ref, q.evidence_quote, q.explanation, q.category,
                q.final_difficulty_score, q.difficulty_band, q.tags, q.verified,
                q.status, q.quality_state, q.quality_standard_version, q.quality_checked_at,
                q.active_revision_id, q.audit_reason, q.source, q.metadata, q.created_at, q.updated_at,
                audit.id AS latest_audit_id, audit.revision_id AS latest_audit_revision_id,
                audit.result AS latest_audit_result, audit.reason AS latest_audit_reason,
                audit.risk_flags AS latest_risk_flags, audit.distractor_results AS latest_distractor_results,
                audit.evidence_snapshot AS latest_evidence_snapshot,
                audit.difficulty_snapshot AS latest_difficulty_snapshot, audit.created_at AS latest_audit_at,
                revision.id AS candidate_revision_id, revision.revision_number AS candidate_revision_number,
                revision.state AS candidate_revision_state, revision.candidate_payload AS candidate_revision_payload,
                revision.created_at AS candidate_revision_created_at
            FROM questions q
            LEFT JOIN LATERAL (
                SELECT a.* FROM question_quality_audits a
                WHERE a.question_id = q.id ORDER BY a.created_at DESC LIMIT 1
            ) audit ON TRUE
            LEFT JOIN LATERAL (
                SELECT r.* FROM question_revisions r
                WHERE r.question_id = q.id AND r.state = 'CANDIDATE'
                ORDER BY r.revision_number DESC LIMIT 1
            ) revision ON TRUE
            WHERE 1=1
        `;
        let countQuery = `SELECT COUNT(*) as total FROM questions q WHERE 1=1`;
        const params = [];

        if (search) {
            const searchClause = ` AND (q.question ILIKE $${params.length + 1} OR q.explanation ILIKE $${params.length + 2} OR q.answer ILIKE $${params.length + 3})`;
            query += searchClause;
            countQuery += searchClause;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (book && book !== 'all') {
            query += ` AND q.book = $${params.length + 1}`;
            countQuery += ` AND q.book = $${params.length + 1}`;
            params.push(book);
        }

        if (difficulty && difficulty !== 'all') {
            query += ` AND LOWER(q.difficulty) = $${params.length + 1}`;
            countQuery += ` AND LOWER(q.difficulty) = $${params.length + 1}`;
            params.push(difficulty.toLowerCase());
        }

        if (category && category !== 'all' && category !== 'pending') {
            query += ` AND q.category = $${params.length + 1}`;
            countQuery += ` AND q.category = $${params.length + 1}`;
            params.push(category);
        }

        if (status) {
            query += ` AND q.status = $${params.length + 1}`;
            countQuery += ` AND q.status = $${params.length + 1}`;
            params.push(status);
        } else if (category === 'pending') {
            // 如果分頁選中 'pending'，則過濾出所有 flagged
            query += ` AND COALESCE(q.quality_state, 'LEGACY') IN ('NEEDS_REPAIR','QUARANTINED','EVIDENCE_UNAVAILABLE')`;
            countQuery += ` AND COALESCE(q.quality_state, 'LEGACY') IN ('NEEDS_REPAIR','QUARANTINED','EVIDENCE_UNAVAILABLE')`;
        }

        if (qualityState && qualityState !== 'ALL') {
            const allowedStates = new Set(['LEGACY', 'SCANNING', 'VERIFIED', 'NEEDS_REPAIR', 'QUARANTINED', 'EVIDENCE_UNAVAILABLE', 'RETIRED']);
            if (!allowedStates.has(qualityState)) return res.status(400).json({ success: false, error: 'INVALID_QUALITY_STATE' });
            query += ` AND COALESCE(q.quality_state, 'LEGACY') = $${params.length + 1}`;
            countQuery += ` AND COALESCE(q.quality_state, 'LEGACY') = $${params.length + 1}`;
            params.push(qualityState);
        }

        if (source && source !== 'all') {
            if (source === 'patrol') {
                query += ` AND q.source LIKE 'patrol:%'`;
                countQuery += ` AND q.source LIKE 'patrol:%'`;
            } else {
                query += ` AND q.source = $${params.length + 1}`;
                countQuery += ` AND q.source = $${params.length + 1}`;
                params.push(source);
            }
        }

        const countResult = await dbOps.gamesDb.get(countQuery, params);
        const total = countResult ? parseInt(countResult.total) : 0;

        query += ` ORDER BY q.created_at DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        const results = await dbOps.gamesDb.query(query, [...params, limit, offset]);

        res.json({
            success: true,
            data: results.map(governanceQuestion),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Questions GET Error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/questions/stats', authenticateToken, requireRole(['admin_content']), async (req, res) => {
    try {
        const totalRow = await dbOps.gamesDb.get('SELECT COUNT(*) as count FROM questions');
        const byDifficulty = await dbOps.gamesDb.query(`SELECT difficulty, COUNT(*) as count FROM questions GROUP BY difficulty`);

        // Postgres: Use status instead of legacy quality if needed, but per schema 'quality' (int) exists.
        const byStatus = await dbOps.gamesDb.query(`SELECT status, COUNT(*) as count FROM questions GROUP BY status`);
        const byBook = await dbOps.gamesDb.query(`SELECT book, COUNT(*) as count FROM questions GROUP BY book ORDER BY count DESC LIMIT 20`);
        const byCategory = await dbOps.gamesDb.query(`SELECT category, COUNT(*) as count FROM questions GROUP BY category`);

        res.json({
            success: true,
            total: totalRow?.count || 0,
            byDifficulty: Object.fromEntries(byDifficulty.map(r => [r.difficulty || 'unknown', parseInt(r.count)])),
            byCategory: Object.fromEntries(byCategory.map(r => [r.category || 'unknown', parseInt(r.count)])),
            byStatus: Object.fromEntries(byStatus.map(r => [r.status || 'unknown', parseInt(r.count)])),
            topBooks: byBook
        });
    } catch (error) {
        console.error('Questions Stats Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/books/overview-stats', authenticateToken, requireRole(['admin_content', 'admin_ops']), async (req, res) => {
    try {
        // PostgreSQL GROUP BY requires strictly selected or aggregated columns
        const results = await dbOps.gamesDb.query(`
            SELECT book, COUNT(*) as count,
            SUM(CASE WHEN LOWER(difficulty) = 'easy' THEN 1 ELSE 0 END) as easy,
            SUM(CASE WHEN LOWER(difficulty) = 'medium' THEN 1 ELSE 0 END) as medium,
            SUM(CASE WHEN LOWER(difficulty) = 'hard' THEN 1 ELSE 0 END) as hard,
            SUM(CASE WHEN LOWER(difficulty) = 'very_hard' THEN 1 ELSE 0 END) as very_hard,
            MAX(created_at) as last_added
            FROM questions
            GROUP BY book
            ORDER BY book
        `);

        res.json({ success: true, books: results });
    } catch (error) {
        console.error('Book Overview Stats Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 3. Question Management
// ==========================================
router.get('/questions/quality/summary', authenticateToken, requireRole(['admin_content', 'admin_ops']), async (req, res) => {
    try {
        res.json({ success: true, ...(await questionQualityService.getSummary()) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/audit/logs', authenticateToken, requireRole(['admin_ops']), async (req, res) => {
    try {
        const result = await dbOps.getAuditLogs({
            page: req.query.page,
            limit: req.query.limit
        });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Audit Logs Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/questions/quality/review', authenticateToken, requireRole(['admin_content', 'admin_ops']), async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
        const offset = (page - 1) * limit;
        const search = String(req.query.search || '').trim();
        const requestedState = String(req.query.state || 'ACTION_REQUIRED').toUpperCase();
        const allowedStates = new Set([
            'LEGACY', 'SCANNING', 'VERIFIED', 'NEEDS_REPAIR',
            'QUARANTINED', 'EVIDENCE_UNAVAILABLE', 'RETIRED'
        ]);
        const params = [];
        const where = [];

        if (requestedState === 'ACTION_REQUIRED') {
            where.push(`COALESCE(q.quality_state, 'LEGACY') IN ('NEEDS_REPAIR', 'QUARANTINED', 'EVIDENCE_UNAVAILABLE')`);
        } else if (requestedState !== 'ALL') {
            if (!allowedStates.has(requestedState)) {
                return res.status(400).json({ success: false, error: 'INVALID_QUALITY_STATE' });
            }
            params.push(requestedState);
            where.push(`COALESCE(q.quality_state, 'LEGACY') = $${params.length}`);
        }

        if (search) {
            params.push(`%${search}%`);
            where.push(`(q.question ILIKE $${params.length} OR q.answer ILIKE $${params.length} OR q.book ILIKE $${params.length})`);
        }

        const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        const countRow = await dbOps.gamesDb.get(`
            SELECT COUNT(*)::INTEGER AS total FROM questions q ${whereSql}
        `, params);

        params.push(limit, offset);
        const questions = await dbOps.gamesDb.query(`
            SELECT
                q.id, q.book, q.chapter, q.verse_start, q.verse_end, q.verse_ref, q.version,
                q.question, q.answer, q.options, q.correct_index, q.distractors_pool,
                q.explanation, q.evidence, q.evidence_ref, q.evidence_quote,
                q.category, q.difficulty, q.final_difficulty_score, q.difficulty_band,
                q.status, q.quality_state, q.quality_standard_version,
                q.quality_checked_at, q.audit_reason, q.active_revision_id,
                audit.id AS latest_audit_id,
                audit.revision_id AS latest_audit_revision_id,
                audit.result AS latest_audit_result,
                audit.reason AS latest_audit_reason,
                audit.risk_flags AS latest_risk_flags,
                audit.distractor_results AS latest_distractor_results,
                audit.evidence_snapshot AS latest_evidence_snapshot,
                audit.difficulty_snapshot AS latest_difficulty_snapshot,
                audit.created_at AS latest_audit_at,
                revision.id AS candidate_revision_id,
                revision.revision_number AS candidate_revision_number,
                revision.state AS candidate_revision_state,
                revision.candidate_payload AS candidate_revision_payload,
                revision.created_at AS candidate_revision_created_at
            FROM questions q
            LEFT JOIN LATERAL (
                SELECT a.* FROM question_quality_audits a
                WHERE a.question_id = q.id
                ORDER BY a.created_at DESC LIMIT 1
            ) audit ON TRUE
            LEFT JOIN LATERAL (
                SELECT r.* FROM question_revisions r
                WHERE r.question_id = q.id AND r.state = 'CANDIDATE'
                ORDER BY r.revision_number DESC LIMIT 1
            ) revision ON TRUE
            ${whereSql}
            ORDER BY
                CASE COALESCE(q.quality_state, 'LEGACY')
                    WHEN 'NEEDS_REPAIR' THEN 1
                    WHEN 'EVIDENCE_UNAVAILABLE' THEN 2
                    WHEN 'QUARANTINED' THEN 3
                    WHEN 'SCANNING' THEN 4
                    WHEN 'LEGACY' THEN 5
                    WHEN 'VERIFIED' THEN 6
                    ELSE 7
                END,
                q.quality_checked_at DESC NULLS LAST,
                q.updated_at DESC NULLS LAST
            LIMIT $${params.length - 1} OFFSET $${params.length}
        `, params);

        const total = Number(countRow?.total || 0);
        res.json({
            success: true,
            questions: questions.map(governanceQuestion),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit))
            }
        });
    } catch (error) {
        console.error('Question Quality Review Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/questions/quality/jobs', authenticateToken, requireRole(['admin_content', 'admin_ops']), async (req, res) => {
    try {
        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
        const jobs = await dbOps.gamesDb.query(`
            SELECT * FROM question_quality_jobs
            ORDER BY created_at DESC LIMIT $1
        `, [limit]);
        res.json({ success: true, jobs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/questions/quality/queue', authenticateToken, requireRole(['admin_content', 'admin_ops']), async (req, res) => {
    try {
        const limit = Math.min(1000, Math.max(1, Number(req.body?.limit) || 100));
        const hasScope = req.body?.book || req.body?.chapter || Array.isArray(req.body?.states);
        const queued = hasScope
            ? await questionQualityService.enqueueAuditJobs({
                limit,
                book: req.body?.book || null,
                chapter: req.body?.chapter ?? null,
                states: req.body?.states || null
            })
            : await questionQualityService.enqueueLegacyAuditJobs(limit);
        res.json({ success: true, ...queued });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/questions/quality/patrol', authenticateToken, requireRole(['admin_content', 'admin_ops']), async (req, res) => {
    try {
        const limit = Math.min(10, Math.max(1, Number(req.body?.limit) || 1));
        const results = await questionQualityService.runPatrolBatch(limit);
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/questions/:id/revisions', authenticateToken, requireRole(['admin_content', 'admin_ops']), async (req, res) => {
    try {
        const revisions = await dbOps.gamesDb.query(`
            SELECT * FROM question_revisions WHERE question_id = $1 ORDER BY revision_number DESC
        `, [req.params.id]);
        const audits = await dbOps.gamesDb.query(`
            SELECT * FROM question_quality_audits WHERE question_id = $1 ORDER BY created_at DESC
        `, [req.params.id]);
        res.json({ success: true, revisions, audits });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/questions/:id/revisions/:revisionId/approve', authenticateToken, requireRole(['admin_content']), async (req, res) => {
    try {
        const ownership = await dbOps.gamesDb.get('SELECT question_id FROM question_revisions WHERE id = $1', [req.params.revisionId]);
        if (!ownership || ownership.questionId !== req.params.id) {
            return res.status(409).json({ success: false, error: 'REVISION_QUESTION_MISMATCH' });
        }
        const result = await questionQualityService.approveRevision(req.params.revisionId, req.user?.userId || 'admin');
        res.json({ success: true, result });
    } catch (error) {
        const status = error.message.startsWith('REVISION_REQUIRES_') ? 409 : 400;
        res.status(status).json({ success: false, error: error.message });
    }
});

router.post('/questions/:id/revisions/:revisionId/reject', authenticateToken, requireRole(['admin_content']), async (req, res) => {
    try {
        const ownership = await dbOps.gamesDb.get('SELECT question_id FROM question_revisions WHERE id = $1', [req.params.revisionId]);
        if (!ownership || ownership.questionId !== req.params.id) {
            return res.status(409).json({ success: false, error: 'REVISION_QUESTION_MISMATCH' });
        }
        const result = await questionQualityService.rejectRevision(
            req.params.revisionId,
            req.user?.userId || 'admin',
            req.body?.reason || null
        );
        res.json({ success: true, result });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

router.post('/questions/:id/revisions/:revisionId/restore', authenticateToken, requireRole(['admin_content']), async (req, res) => {
    try {
        const sourceRevision = await dbOps.gamesDb.get(`
            SELECT * FROM question_revisions
            WHERE id = $1 AND question_id = $2
        `, [req.params.revisionId, req.params.id]);
        if (!sourceRevision || !['APPROVED', 'SUPERSEDED'].includes(sourceRevision.state)) {
            return res.status(409).json({ success: false, error: 'REVISION_NOT_RESTORABLE' });
        }
        const existingCandidate = await dbOps.gamesDb.get(`
            SELECT id FROM question_revisions
            WHERE question_id = $1 AND state = 'CANDIDATE'
            LIMIT 1
        `, [req.params.id]);
        if (existingCandidate) {
            return res.status(409).json({ success: false, error: 'CANDIDATE_REVISION_ALREADY_EXISTS' });
        }

        const candidate = sourceRevision.previousPayload || sourceRevision.previous_payload;
        const revision = await questionQualityService.createRevision(req.params.id, candidate, {
            source: `ADMIN_RESTORE_V4:${sourceRevision.id}`,
            createdBy: req.user?.userId || 'admin'
        });
        const audits = [
            await questionQualityService.auditRevision(revision.id),
            await questionQualityService.auditRevision(revision.id)
        ];
        const audit = audits[audits.length - 1];
        res.json({
            success: true,
            message: '已建立還原候選版本並完成雙重稽核；仍需人工核准',
            revision,
            audit,
            audits
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

router.get('/questions/:id', authenticateToken, requireRole(['admin_content']), async (req, res) => {
    try {
        const { id } = req.params;

        const question = await dbOps.gamesDb.get(`
            SELECT q.*,
                audit.id AS latest_audit_id,
                audit.revision_id AS latest_audit_revision_id,
                audit.result AS latest_audit_result,
                audit.reason AS latest_audit_reason,
                audit.risk_flags AS latest_risk_flags,
                audit.distractor_results AS latest_distractor_results,
                audit.evidence_snapshot AS latest_evidence_snapshot,
                audit.difficulty_snapshot AS latest_difficulty_snapshot,
                audit.created_at AS latest_audit_at,
                revision.id AS candidate_revision_id,
                revision.revision_number AS candidate_revision_number,
                revision.state AS candidate_revision_state,
                revision.candidate_payload AS candidate_revision_payload,
                revision.created_at AS candidate_revision_created_at
            FROM questions q
            LEFT JOIN LATERAL (
                SELECT a.* FROM question_quality_audits a
                WHERE a.question_id = q.id ORDER BY a.created_at DESC LIMIT 1
            ) audit ON TRUE
            LEFT JOIN LATERAL (
                SELECT r.* FROM question_revisions r
                WHERE r.question_id = q.id AND r.state = 'CANDIDATE'
                ORDER BY r.revision_number DESC LIMIT 1
            ) revision ON TRUE
            WHERE q.id = $1
        `, [id]);

        if (!question) {
            return res.status(404).json({ success: false, error: '題目不存在' });
        }

        res.json({ success: true, question: governanceQuestion(question) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/questions/:id', authenticateToken, requireRole(['admin_content']), async (req, res) => {
    try {
        const { id } = req.params;
        const candidate = buildQuestionRevisionCandidate(req.body);
        if (Object.keys(candidate).length === 0) return res.status(400).json({ success: false, error: '沒有提供要更新的欄位' });

        const revision = await questionQualityService.createRevision(id, candidate, {
            source: 'ADMIN_EDIT_V4',
            createdBy: req.user?.userId || 'admin'
        });
        const audits = [
            await questionQualityService.auditRevision(revision.id),
            await questionQualityService.auditRevision(revision.id)
        ];
        const audit = audits[audits.length - 1];
        res.json({
            success: true,
            message: '已建立待審修訂並完成雙重稽核，正式題目尚未變更',
            revision,
            audit,
            audits
        });
    } catch (error) {
        console.error('Question Update Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/questions/:id/approve', authenticateToken, requireRole(['admin_content']), async (req, res) => {
    try {
        const { id } = req.params;
        const revisionId = req.body?.revisionId || req.body?.revision_id;
        if (!revisionId) return res.status(400).json({ success: false, error: 'REVISION_ID_REQUIRED' });
        const ownership = await dbOps.gamesDb.get('SELECT question_id FROM question_revisions WHERE id = $1', [revisionId]);
        if (!ownership || ownership.questionId !== id) {
            return res.status(409).json({ success: false, error: 'REVISION_QUESTION_MISMATCH' });
        }
        const result = await questionQualityService.approveRevision(revisionId, req.user?.userId || 'admin');
        res.json({ success: true, message: '修訂已核准並成為正式版本', result });
    } catch (error) {
        console.error('Question Approve Error:', error);
        res.status(error.message.startsWith('REVISION_REQUIRES_') ? 409 : 400)
            .json({ success: false, error: error.message });
    }
});

router.delete('/questions/:id', authenticateToken, requireRole(['admin_content']), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await questionQualityService.deleteQuestionsPermanently([id], req.user?.userId || 'admin');
        if (result.deleted === 0) return res.status(404).json({ success: false, error: '題目不存在或已刪除' });
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/questions/batch-delete', authenticateToken, requireRole(['admin_content']), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: '請提供要刪除的 ID 列表' });
        }

        const result = await questionQualityService.deleteQuestionsPermanently(ids, req.user?.userId || 'admin');
        res.json({ success: true, count: result.deleted, ...result, message: `成功永久刪除 ${result.deleted} 筆題目` });
    } catch (error) {
        console.error('Batch Delete Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});



// ==========================================
// 4. User Management
// ==========================================

router.get('/users', authenticateToken, requireRole(['admin_ops']), async (req, res) => {
    try {
        const users = await dbOps.db.query(`
            SELECT
                u.id, u.username, u.display_name, u.is_admin, u.role, u.coins, u.status,
                u.total_games, u.total_correct, u.created_at, u.last_login, u.admin_roles,
                w.bonus_ai_credits, w.exchange_ai_credits, w.paid_ai_credits,
                COALESCE(w.bonus_ai_credits, 0) + COALESCE(w.exchange_ai_credits, 0) + COALESCE(w.paid_ai_credits, 0) as total_ai_credits
            FROM users u
            LEFT JOIN ai_gov.user_ai_credit_wallet w ON u.id = w.user_id
            ORDER BY u.created_at ASC
        `);
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /admin/users/:id/ledger
 * 獲取特定使用者的金幣變動明細
 */
router.get('/users/:id/ledger', authenticateToken, requireRole(['admin_ops', 'admin_economy']), async (req, res) => {
    try {
        const { id } = req.params;
        const limit = parseInt(req.query.limit) || 100;

        console.log(`🔍 [AdminEconomy] Fetching coin ledger for user: ${id}`);
        const ledger = await dbOps.getCoinLedger(id, limit);

        res.json({ success: true, ledger });
    } catch (error) {
        console.error('❌ Admin User Ledger Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /admin/users/:id/ai-ledger
 * 獲取特定使用者的 AI 點數變動明細
 */
router.get('/users/:id/ai-ledger', authenticateToken, requireRole(['admin_ops', 'admin_economy']), async (req, res) => {
    try {
        const { id } = req.params;
        const limit = parseInt(req.query.limit) || 100;

        console.log(`🔍 [AdminEconomy] Fetching AI ledger for user: ${id}`);
        const ledger = await dbOps.getAICreditLedger(id, limit);

        res.json({ success: true, ledger });
    } catch (error) {
        console.error('❌ Admin User AI Ledger Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /admin/users/:id/role
 * 更新使用者角色 (對齊前端)
 */
router.put('/users/:id/role', authenticateToken, requireRole(['super_admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { role, adminRoles, admin_roles } = req.body;
        const targetAdminRoles = admin_roles !== undefined ? admin_roles : adminRoles;

        await dbOps.db.run(
            'UPDATE users SET role = $1, is_admin = $2, admin_roles = $3 WHERE id = $4',
            [role, role !== 'user', JSON.stringify(targetAdminRoles || []), id]
        );

        await AuditLogService.logAdmin(req.user.userId, 'USER_ROLE_UPDATE', 'user', id, { role, admin_roles: targetAdminRoles }, req);
        res.json({ success: true, message: '角色已更新', role });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /admin/users/:id/password
 * 重設使用者密碼 (對齊前端)
 */
router.put('/users/:id/password', authenticateToken, requireRole(['super_admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;
        const passwordHash = await SecurityService.hashPassword(newPassword);
        await dbOps.db.run('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
        await AuditLogService.logAdmin(req.user.userId, 'USER_PWD_RESET', 'user', id, {}, req);
        res.json({ success: true, message: '密碼已重設' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /admin/users/:id/coins
 * 調整使用者金幣
 */
router.put('/users/:id/coins', authenticateToken, requireRole(['super_admin', 'admin_economy']), async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, action, reason } = req.body;

        // [SOVEREIGN v3] 原子化調整：委派至 UsersOps
        let result;
        if (action === 'set') {
            result = await dbOps.setCoins(id, amount, reason || 'Admin Override');
        } else {
            // 'add' or 'subtract' (amount will be negative for subtract)
            result = await dbOps.adjustCoins(id, amount, reason || 'Admin Adjustment');
        }

        await AuditLogService.logAdmin(req.user.userId, 'USER_COINS_ADJUST', 'user', id, { amount, action, newBalance: result.newBalance }, req);
        res.json({ success: true, coins: result.newBalance });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /admin/users/:id/ai-credits
 * 調整使用者 AI 點數
 */
router.put('/users/:id/ai-credits', authenticateToken, requireRole(['super_admin', 'admin_economy']), async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, pool, reason } = req.body;

        // Use LogosBank for AI_CREDIT adjustments (Sovereign Architecture)
        const balances = await LogosBank.adjustAssets(id, 'AI_CREDIT', amount, reason || 'Admin Adjustment', { pool });

        await AuditLogService.logAdmin(req.user.userId, 'USER_AI_CREDITS_ADJUST', 'user', id, { amount, pool, newBalance: balances.aiCredits }, req);
        res.json({ success: true, aiCredits: balances.aiCredits });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/users/:id', authenticateToken, requireRole(['super_admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { role, admin_roles, adminRoles, status } = req.body;

        // [SOVEREIGN] 欄位寬度整合：優先使用 admin_roles，若無則降級至 adminRoles
        const targetAdminRoles = admin_roles !== undefined ? admin_roles : adminRoles;

        const updates = [];
        const params = [];

        if (role !== undefined) {
            updates.push(`role = $${params.length + 1}`);
            params.push(role);

            // [STABLE] 自動同步 is_admin 主權旗標
            updates.push(`is_admin = $${params.length + 1}`);
            params.push(role !== 'user');
        }
        if (targetAdminRoles !== undefined) {
            updates.push(`admin_roles = $${params.length + 1}`);
            params.push(Array.isArray(targetAdminRoles) ? JSON.stringify(targetAdminRoles) : targetAdminRoles);

            // 如果只有調整 adminRoles 但沒傳入 role，且 adminRoles 有值，則確保 is_admin 為 true
            if (role === undefined) {
                updates.push(`is_admin = $${params.length + 1}`);
                const rolesArray = Array.isArray(targetAdminRoles) ? targetAdminRoles : [];
                params.push(rolesArray.length > 0);
            }
        }
        if (status !== undefined) {
            updates.push(`status = $${params.length + 1}`);
            params.push(status);
        }

        if (updates.length > 0) {
            params.push(id);
            const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length}`;
            await dbOps.db.run(query, params);

            // Log the action (Unified Object Format)
            await AuditLogService.log({
                userId: req.user.userId,
                action: 'USER_UPDATE',
                targetType: 'user',
                targetId: id,
                after: { role, admin_roles: targetAdminRoles, status }
            });

            res.json({ success: true, message: '使用者權限已更新' });
        } else {
            res.status(400).json({ success: false, error: '無效的更新請求' });
        }
    } catch (error) {
        console.error('Admin User Update Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/users/:id', authenticateToken, requireRole(['super_admin']), async (req, res) => {
    try {
        const { id } = req.params;
        // Verify target is not self
        if (id === req.user.userId) {
            return res.status(400).json({ success: false, error: '不能刪除自己的帳號' });
        }

        await dbOps.db.run('DELETE FROM users WHERE id = $1', [id]);
        await AuditLogService.log(req.user.userId, 'USER_DELETE', { targetUserId: id });

        res.json({ success: true, message: '使用者已刪除' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/users/:id/reset-password', authenticateToken, requireRole(['super_admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ success: false, error: '新密碼長度不足' });
        }

        const passwordHash = await SecurityService.hashPassword(newPassword);
        await dbOps.db.run('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);

        await AuditLogService.log(req.user.userId, 'USER_PWD_RESET', { targetUserId: id });
        res.json({ success: true, message: '密碼已成功重設' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 5. Content & Backup
// ==========================================

router.get('/backup', authenticateToken, requireRole(['super_admin']), async (req, res) => {
    try {
        const { DB_HOST = 'localhost', DB_PORT = '5432', DB_USER = 'dev', DB_NAME = 'bible_quiz_v3', DB_PASSWORD = '' } = process.env;
        const filename = `bible_quiz_backup_${new Date().toISOString().split('T')[0]}.sql`;
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const pgDump = spawn('pg_dump', [
            '-h', DB_HOST,
            '-p', DB_PORT,
            '-U', DB_USER,
            '-d', DB_NAME,
            '--no-password',
            '--format=plain',
            '--no-owner',
            '--no-acl',
        ], {
            env: { ...process.env, PGPASSWORD: DB_PASSWORD },
        });

        pgDump.stdout.pipe(res);
        pgDump.stderr.on('data', (d) => console.error('[Backup] pg_dump stderr:', d.toString()));
        pgDump.on('error', (err) => {
            console.error('[Backup] pg_dump not found or failed:', err.message);
            if (!res.headersSent) {
                res.status(500).json({ error: 'pg_dump 不可用，請在伺服器環境安裝 postgresql-client' });
            }
        });
        pgDump.on('close', (code) => {
            if (code !== 0) console.error(`[Backup] pg_dump exited with code ${code}`);
        });
    } catch (error) {
        console.error('Backup Error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ==========================================
// 6. Economy Configuration
// ==========================================

router.get('/economy/config', authenticateToken, requireRole(['admin_economy']), async (req, res) => {
    try {
        const rateCoinToCredit = await dbOps.getSetting('rate_coin_to_credit', 50);
        const rateCreditToCoin = await dbOps.getSetting('rate_credit_to_coin', 45);
        res.json({
            success: true,
            data: {
                rateCoinToCredit: parseInt(rateCoinToCredit, 10),
                rateCreditToCoin: parseInt(rateCreditToCoin, 10)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/economy/config', authenticateToken, requireRole(['admin_economy']), async (req, res) => {
    try {
        const { rateCoinToCredit, rateCreditToCoin } = req.body;
        
        if (rateCoinToCredit && rateCoinToCredit > 0) {
            await dbOps.saveSetting('rate_coin_to_credit', String(rateCoinToCredit), '金幣換點數匯率 (X金幣 = 1點數)');
        }
        if (rateCreditToCoin && rateCreditToCoin > 0) {
            await dbOps.saveSetting('rate_credit_to_coin', String(rateCreditToCoin), '點數換金幣匯率 (1點數 = X金幣)');
        }

        await AuditLogService.log({
            userId: req.user.userId,
            action: 'ECONOMY_CONFIG_UPDATE',
            targetType: 'system',
            targetId: 'settings',
            after: { rateCoinToCredit, rateCreditToCoin }
        });

        res.json({ success: true, message: '經濟體系匯率已更新' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
