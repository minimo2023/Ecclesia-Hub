
import express from 'express';
import { dbOps } from '../../database/index.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';

const router = express.Router();
const SUPPORTED_INVENTORY_VERSIONS = new Set(['CUV_TRAD', 'LCC_TRAD', 'CNV_TRAD', 'TCV2010_TRAD']);

/**
 * [SOVEREIGN] 海巡分頁專用 API
 * 職責：回傳三大艦隊進度與昨晚生成的統計數據
 */

// 1. 取得艦隊當前位置與狀態
router.get('/status', authenticateToken, requireRole(['admin_ops', 'admin_content']), async (req, res) => {
    try {
        const PATROL_FLEET_KEY = 'patrol_fleet';
        const defaultFleet = {
            'Alpha_OT': { book: 'Genesis', chapter: 1, verse_start: 1, translation: 'CNV_TRAD', patrol_count: 0, active: true },
            'Beta_NT':  { book: 'Matthew', chapter: 1, verse_start: 1, translation: 'CUV_TRAD', patrol_count: 0, active: true },
            'Gamma_Scout': { book: 'John', chapter: 1, verse_start: 1, translation: 'TCV2010_TRAD', patrol_count: 0, active: true }
        };

        const fleet = await dbOps.getSetting(PATROL_FLEET_KEY, defaultFleet);

        // [IDLE MONITOR] 取得即時運作狀態
        const { inventoryService } = await import('./expedition/InventoryService.js');
        const { GlobalAIState } = await import('../../infrastructure/ai/gemini-client.js');
        const bibleTranslator = (await import('../../utils/bibleTranslator.js')).default;

        // 確保前端顯示的一律為中文名稱
        for (const v in fleet) {
            fleet[v].book = bibleTranslator.toChinese(fleet[v].book);
        }

        res.json({
            success: true,
            fleet,
            isWorking: inventoryService.isWorking,
            mode: '閒置感應 (Idle Sensing)',
            startedAt: inventoryService.startedAt,
            lastPulseAt: inventoryService.lastPulseAt,
            pulseCount: inventoryService.pulseCount,
            pendingGaps: inventoryService.pendingGaps,
            totalStoredThisSession: inventoryService.totalStoredThisSession,
            paidPatrolUntil: GlobalAIState.paidPatrolUntil  // 付費模式截止時間 (0 = 未啟用)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. 取得今日海巡出題統計
router.get('/stats', authenticateToken, requireRole(['admin_ops', 'admin_content']), async (req, res) => {
    try {
        const { gamesDb } = await import('../../database/index.js');

        // 統計最近 24 小時內的海巡產出
        const stats = await gamesDb.query(`
            SELECT
                source,
                version,
                count(*) as count,
                MIN(created_at) as start_time,
                MAX(created_at) as end_time
            FROM questions
            WHERE source LIKE 'patrol:%'
              AND created_at >= (CURRENT_DATE - INTERVAL '1 day')
            GROUP BY source, version
            ORDER BY source
        `);

        // 取得總量匯總
        const totalRow = await gamesDb.get(`
            SELECT count(*) as total FROM questions
            WHERE source LIKE 'patrol:%'
              AND created_at >= (CURRENT_DATE - INTERVAL '1 day')
        `);

        res.json({
            success: true,
            summary: {
                totalToday: totalRow?.total || 0,
                lastRunStats: stats
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2.5 取得真正可分配給遊戲的庫存，而非原始 PASS 總數
router.get('/inventory', authenticateToken, requireRole(['admin_ops', 'admin_content']), async (req, res) => {
    try {
        const version = String(req.query.version || 'CUV_TRAD');
        if (!SUPPORTED_INVENTORY_VERSIONS.has(version)) {
            return res.status(400).json({ success: false, error: 'UNSUPPORTED_VERSION' });
        }

        const requestedTarget = Number.parseInt(req.query.targetCount, 10);
        const targetCount = Number.isInteger(requestedTarget)
            ? Math.min(200, Math.max(1, requestedTarget))
            : 15;

        const bibleTranslator = (await import('../../utils/bibleTranslator.js')).default;
        const { questionInventoryService } = await import('./replenishment/QuestionInventoryService.js');
        const books = [...new Set((await dbOps.getAllBooks()).map(book =>
            bibleTranslator.toChinese(book.nameZh || book.name_zh || book.nameEn || book.name_en || book.id)
        ))];
        const coverage = await questionInventoryService.getBookCoverage({ books, version, targetCount });

        const statusCounts = coverage.reduce((acc, item) => {
            acc[item.status] = (acc[item.status] || 0) + 1;
            return acc;
        }, { ready: 0, degraded: 0, insufficient: 0 });

        res.json({
            success: true,
            version,
            targetCount,
            summary: {
                books: coverage.length,
                ...statusCounts,
                pendingGaps: coverage.reduce((sum, item) => sum + item.shortageTotal, 0),
                playableQuestions: coverage.reduce((sum, item) => sum + item.total, 0)
            },
            coverage
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2.6 單卷、單次、免費金鑰限定補題。此功能不會開啟背景巡航。
router.get('/targeted/status', authenticateToken, requireRole(['admin_ops', 'admin_content']), async (_req, res) => {
    const { default: replenishmentService } = await import('./replenishment/QuestionReplenishmentService.js');
    const serviceStatus = replenishmentService.getStatus();
    res.json({
        success: true,
        run: replenishmentService.getTargetedStatus(),
        automatic: {
            enabled: process.env.QUESTION_REPLENISHMENT_ENABLED === 'true',
            running: serviceStatus.running,
            isCruising: serviceStatus.isCruising,
            lastPulseAt: serviceStatus.lastPulseAt,
            totalStoredThisSession: serviceStatus.totalStoredThisSession,
            ...serviceStatus.globalPlan
        }
    });
});

router.post('/targeted/start', authenticateToken, requireRole(['admin_ops', 'admin_content']), async (req, res) => {
    try {
        const version = String(req.body?.version || 'CUV_TRAD');
        if (!SUPPORTED_INVENTORY_VERSIONS.has(version)) {
            return res.status(400).json({ success: false, error: 'UNSUPPORTED_VERSION' });
        }
        if (req.body?.freeOnly !== true) {
            return res.status(400).json({
                success: false,
                error: 'FREE_ONLY_CONFIRMATION_REQUIRED',
                message: '單卷補題只允許使用免費金鑰'
            });
        }

        const requestedBook = String(req.body?.book || '').trim();
        const bibleTranslator = (await import('../../utils/bibleTranslator.js')).default;
        const canonicalBook = bibleTranslator.toChinese(requestedBook);
        const availableBooks = [...new Set((await dbOps.getAllBooks()).map(book =>
            bibleTranslator.toChinese(book.nameZh || book.name_zh || book.nameEn || book.name_en || book.id)
        ))];
        if (!canonicalBook || !availableBooks.includes(canonicalBook)) {
            return res.status(400).json({ success: false, error: 'INVALID_BOOK', message: '請選擇有效書卷' });
        }

        const { default: replenishmentService } = await import('./replenishment/QuestionReplenishmentService.js');
        const run = await replenishmentService.startTargetedRun({
            book: canonicalBook,
            version,
            maxBatches: req.body?.maxBatches
        });
        return res.status(202).json({
            success: true,
            message: '已啟動單卷免費補題；達到可開局標準、免費額度暫停或安全上限後自動停止',
            run
        });
    } catch (error) {
        const status = ['TARGETED_REPLENISHMENT_BUSY', 'ACTIVE_GAME_ROOMS'].includes(error.code) ? 409 : 500;
        return res.status(status).json({ success: false, error: error.code || 'TARGETED_REPLENISHMENT_ERROR', message: error.message });
    }
});

router.post('/targeted/cancel', authenticateToken, requireRole(['admin_ops', 'admin_content']), async (_req, res) => {
    const { default: replenishmentService } = await import('./replenishment/QuestionReplenishmentService.js');
    const accepted = replenishmentService.cancelTargetedRun();
    return res.status(accepted ? 202 : 409).json({
        success: accepted,
        message: accepted ? '已要求停止；目前批次完成後停止' : '目前沒有執行中的單卷補題',
        run: replenishmentService.getTargetedStatus()
    });
});

// 3. 取得海巡產出的最新題目範例
router.get('/samples', authenticateToken, requireRole(['admin_ops', 'admin_content']), async (req, res) => {
    try {
        const { gamesDb } = await import('../../database/index.js');
        const samples = await gamesDb.query(`
            SELECT id, book, chapter, verse_start, question, answer, version, source, created_at
            FROM questions
            WHERE source LIKE 'patrol:%'
            ORDER BY created_at DESC NULLS LAST
            LIMIT 10
        `);

        res.json({ success: true, samples });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. 手動發射脈衝 (觸發一輪巡航，並啟用付費金鑰 2 小時)
router.post('/pulse', authenticateToken, requireRole(['admin_ops', 'admin_content']), async (req, res) => {
    try {
        if (process.env.QUESTION_REPLENISHMENT_ENABLED !== 'true') {
            return res.status(403).json({
                success: false,
                message: 'Question replenishment is disabled. Set QUESTION_REPLENISHMENT_ENABLED=true to enable it explicitly.'
            });
        }

        const { inventoryService } = await import('./expedition/InventoryService.js');
        const { GlobalAIState } = await import('../../infrastructure/ai/gemini-client.js');
        
        // 若付費模式已啟用且未到期，拒絕重複啟動
        if (GlobalAIState.isPaidPatrolActive()) {
            const remaining = Math.ceil((GlobalAIState.paidPatrolUntil - Date.now()) / 60000);
            return res.json({ success: false, message: `付費補題模式進行中，剩餘約 ${remaining} 分鐘。` });
        }
        
        if (inventoryService.isWorking) {
            return res.json({ success: false, message: '艦隊目前已經在巡航中 (Busy)' });
        }
        
        // 啟用付費金鑰模式 (2 小時)
        GlobalAIState.activatePaidPatrol(2 * 60 * 60 * 1000);
        
        // 背景觸發巡航，不等待完成，避免前端等待過久 timeout
        inventoryService.startIdleCruise().catch(err => console.error('Manual pulse error:', err));
        
        res.json({
            success: true,
            message: '已啟動付費補題模式 (2 小時)，艦隊正在出發巡航。',
            paidPatrolUntil: GlobalAIState.paidPatrolUntil
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
