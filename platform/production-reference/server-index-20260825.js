// 🚀 UNIFIED SERVER STARTING - UNIQUE REF: 778899-V39
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import helmet from 'helmet';
import morgan from 'morgan';

// --- STAGE 0: SOVEREIGN CONFIG ---
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import Infrastructure & Services
import { initializeInfrastructure, dbOps } from './database/index.js';
import { ContentManager } from './domains/content/bible/ContentManager.js';
import ReadingPlanService from './domains/content/bible/ReadingPlanService.js';
import LogosEngine from './infrastructure/ai/LogosEngine.js';
import devotionalService from './domains/content/devotional/devotional.js';
import scheduler from './domains/content/devotional/scheduler.js';
import replenishmentService from './domains/game/replenishment/QuestionReplenishmentService.js';
import { questionQualityService } from './domains/game/quality/QuestionQualityService.js';
import { GlobalAIState } from './infrastructure/ai/gemini-client.js';
import { activeRooms } from './socket/expedition/registry.js';
import { initExpeditionConfig } from './domains/game/expedition/routes.js';
import { usageReporter } from './services/usageReporter.js';

/**
 * [SOVEREIGN BOOT] 自我修復式啟動管線
 */
async function bootServer() {
    try {
        logger.info('🛡️ [Boot] Starting System Validation & Infrastructure...');
        await initializeInfrastructure();
        logger.info('✅ [Boot] Database & Ops Proxy Ready.');

        const readingPlanMigration = await ReadingPlanService.migrateLegacyActivePlans();
        if (readingPlanMigration.inspected > 0) {
            const migrated = readingPlanMigration.results.filter(result => result.success).length;
            const failed = readingPlanMigration.results.filter(result => !result.success);
            logger.info(`📖 [Boot] Migrated ${migrated}/${readingPlanMigration.inspected} legacy active reading plan(s) to V4.2.`);
            if (failed.length > 0) {
                logger.warn(`⚠️ [Boot] Reading plan migration failures: ${failed.map(item => `${item.id}: ${item.error}`).join('; ')}`);
            }
        }

        // 初始化遠征配置（必須在 DB 就緒後執行）
        await initExpeditionConfig();
        logger.info('⚓ [Boot] Expedition Config Loaded.');

        // 核心服務主權鎖定
        logger.info('🛡️ [Boot] Initializing Core Services (Logos & Content)...');
        await ContentManager.initialize(dbOps.contentDb);
        
        if (devotionalService && devotionalService.initDevotionalService) {
            devotionalService.initDevotionalService();
        }
        
        logger.info('✅ [Boot] Core Services Online.');

        // 初始化排程系統
        const schedulerInitialized = scheduler.initializeScheduler(dbOps, devotionalService);
        if (schedulerInitialized) {
            logger.info('📅 [Scheduler] Daily tasks registered.');
        }

        // 補題服務（海巡艦隊）：自動巡航，內部會依 activeRooms 與 AI health 自動讓路
        if (QUESTION_REPLENISHMENT_ENABLED) {
        replenishmentService.initialize().then(() => {
            const PULSE_INTERVAL_MS = 10 * 60 * 1000; // 10 分鐘
            const INITIAL_PULSE_DELAY_MS = 30 * 1000; // 避免與啟動流程搶資源

            setTimeout(() => {
                replenishmentService.pulse().catch(e =>
                    logger.error(`❌ [Replenishment] Initial pulse error: ${e.message}`)
                );
            }, INITIAL_PULSE_DELAY_MS);

            setInterval(() => {
                replenishmentService.pulse().catch(e =>
                    logger.error(`❌ [Replenishment] Pulse error: ${e.message}`)
                );
            }, PULSE_INTERVAL_MS);

            logger.info(`⚓ [Replenishment] Service initialized (Auto-pulse ENABLED: first=${INITIAL_PULSE_DELAY_MS / 1000}s, interval=${PULSE_INTERVAL_MS / 60000}m).`);
        }).catch(e => {
            logger.error(`❌ [Replenishment] Initialization failed: ${e.message}`);
        });
        } else {
            logger.warn('[Replenishment] Automatic question replenishment is disabled. Set QUESTION_REPLENISHMENT_ENABLED=true to enable it explicitly.');
        }

        // V4 品質巡航與自動補題解耦：可以只審查既有庫存，不自動生產新題。
        if (QUESTION_QUALITY_PATROL_ENABLED) {
            const runQualityPatrol = async () => {
                if (activeRooms.size > 0 || GlobalAIState.checkHealth() !== 'green') {
                    logger.info('[QualityPatrol V4] Deferred because a game is active or AI health is not green.');
                    return;
                }
                await questionQualityService.enqueueLegacyAuditJobs(25);
                const results = await questionQualityService.runPatrolBatch(QUESTION_QUALITY_PATROL_BATCH_SIZE);
                logger.info(`[QualityPatrol V4] Completed ${results.length} shadow audit job(s).`);
            };

            setTimeout(() => runQualityPatrol().catch(error =>
                logger.error(`[QualityPatrol V4] Initial patrol failed: ${error.message}`)
            ), QUESTION_QUALITY_PATROL_INITIAL_DELAY_MS);
            setInterval(() => runQualityPatrol().catch(error =>
                logger.error(`[QualityPatrol V4] Patrol failed: ${error.message}`)
            ), QUESTION_QUALITY_PATROL_INTERVAL_MS);
            logger.info(`[QualityPatrol V4] Shadow patrol enabled: batch=${QUESTION_QUALITY_PATROL_BATCH_SIZE}, first=${QUESTION_QUALITY_PATROL_INITIAL_DELAY_MS / 1000}s, interval=${QUESTION_QUALITY_PATROL_INTERVAL_MS / 60000}m.`);
        } else {
            logger.info('[QualityPatrol V4] Automatic shadow patrol is disabled.');
        }

    } catch (e) {
        logger.error(`🔥 [FATAL BOOT ERROR]: ${e.message}`, { stack: e.stack });
        process.exit(1);
    }
}

// 防禦性守衛
process.on('unhandledRejection', (reason) => {
    logger.error('🔥 [CRITICAL] Unhandled Rejection:', { reason });
});

process.on('uncaughtException', (err) => {
    logger.error('🔥 [CRITICAL] Uncaught Exception:', { message: err.message, stack: err.stack });
    setTimeout(() => process.exit(1), 1000);
});

// START THE ENGINE
// bootServer() will be awaited explicitly at the bottom

// Import Routes — Domain Structure v2.0
// members/
import authRoutes from './domains/members/auth.routes.js';
import userRoutes from './domains/members/user.routes.js';
import achievementsRoutes from './domains/members/achievements.routes.js';
import devotionalNotesRoutes from './domains/members/devotional_notes.routes.js';
// game/
import quizRoutes from './domains/game/quiz.routes.js';
import gameRoutes from './domains/game/game.routes.js';
import gameSessionRoutes from './domains/game/game-session.routes.js';
import adminPatrolRoutes from './domains/game/patrol.routes.js';
import generatorRoutes from './domains/game/replenishment/generators.routes.js';
import logosRoutes from './domains/game/story/logos.routes.js';
import narrativeRoutes from './domains/game/story/narrative.routes.js';
import timeTravelerRoutes from './domains/game/story/timeTraveler.routes.js';
import expeditionRoutes from './domains/game/expedition/routes.js';
// content/
import contentRoutes from './domains/content/content.routes.js';
import scriptureSelectionsRoutes from './domains/content/scripture_selections.routes.js';
import readingPlansRoutes from './domains/content/bible/reading_plans.routes.js';
import scriptureToolsRoutes from './domains/scripture-tools/routes.js';
// banking/
import adminAIRoutes from './domains/banking/admin.routes.js';
// admin/
import adminRoutes from './admin/routes.js';
import questionBankRoutes from './admin/question-bank.routes.js';
// infrastructure/
import feedbackRoutes from './infrastructure/feedback/routes.js';
// StockAI [Sovereign Module Isolation]
import stockaiRouter from './domains/stockai/router.js';

const QUESTION_REPLENISHMENT_ENABLED = process.env.QUESTION_REPLENISHMENT_ENABLED === 'true';
const SCRIPTURE_TOOLS_ENABLED = process.env.SCRIPTURE_TOOLS_ENABLED === 'true';
const QUESTION_QUALITY_PATROL_ENABLED = process.env.QUESTION_QUALITY_PATROL_ENABLED === 'true';
const QUESTION_QUALITY_PATROL_BATCH_SIZE = Math.min(3, Math.max(1,
    Number.parseInt(process.env.QUESTION_QUALITY_PATROL_BATCH_SIZE || '1', 10) || 1
));
const QUESTION_QUALITY_PATROL_INITIAL_DELAY_MS = Math.min(15 * 60, Math.max(30,
    Number.parseInt(process.env.QUESTION_QUALITY_PATROL_INITIAL_DELAY_SECONDS || '120', 10) || 120
)) * 1000;
const QUESTION_QUALITY_PATROL_INTERVAL_MS = Math.min(24 * 60, Math.max(10,
    Number.parseInt(process.env.QUESTION_QUALITY_PATROL_INTERVAL_MINUTES || '30', 10) || 30
)) * 60 * 1000;

const isValidISODate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const parsedDate = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsedDate.getTime())
        && parsedDate.toISOString().slice(0, 10) === value;
};

// Import Middleware
import { apiLimiter, aiIpLimiter, aiUserLimiter } from './middleware/rateLimiter.js';
import { authenticateToken, requireRole } from './middleware/auth.js';
import { createMobileRedirectMiddleware } from './middleware/mobileRedirect.js';

// Import Socket.io
import { initializeSocket } from './socket/index.js';
import * as healthCheck from './database/healthCheck.js';

// Removed Proxy Middleware import


// JWT Secret Warning (Moved to config-aware level)
if (!process.env.JWT_SECRET && config.server.env === 'production') {
    logger.error('❌ [SECURITY] Production environment MUST set JWT_SECRET');
    process.exit(1);
}

const app = express();
const adminOpsOnly = [authenticateToken, requireRole(['admin_ops'])];
// [STABILITY] 信任第一層代理伺服器 (解決 express-rate-limit 在開發環境下的安全警告)
app.set('trust proxy', 1); 

const PORT = config.server.port;
logger.info(`🚀 [PORT-SWAP] Server aiming for PORT: ${PORT}`);

// Process lifecycle diagnostics are centralized here.
import fs from 'fs';

process.on('exit', (code) => {
    console.log(`❌ Process exiting with code: ${code}`);
});
process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT. Press Control-D to exit.');
});

// ========== Middleware ==========
// 1. Security Headers (Helmet)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                "'unsafe-eval'",
                "https://static.cloudflareinsights.com"  // Cloudflare Analytics
            ],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: [
                "'self'",
                "http://localhost:*",
                "ws://localhost:*",
                "http://127.0.0.1:*",
                "ws://127.0.0.1:*",
                "https://xtc-biblestudy.idv.tw",
                "wss://xtc-biblestudy.idv.tw",
                "https://generativelanguage.googleapis.com", // Gemini API
                "https://*.googleapis.com", // All Google APIs
                "https://*.google.com", // Google services
                "https://cloudflareinsights.com", // Cloudflare Analytics
                "https://*.suno.com", // Suno AI Music
                "https://*.bible.com", // Bible API
                "https://bible.fhl.net", // 信望愛聖經 API (對照版本)
                "wss://*" // Allow all WebSocket connections
            ],
            mediaSrc: ["'self'", "blob:"],
            objectSrc: ["'none'"],
            frameAncestors: ["'self'"],
            // Local development runs on plain HTTP. Keep the production upgrade
            // directive, but do not rewrite localhost module assets to HTTPS.
            upgradeInsecureRequests: config.server.env === 'production' ? [] : null
        }
    },
    crossOriginEmbedderPolicy: false, // 允許載入跨域資源
    crossOriginResourcePolicy: { policy: "cross-origin" } // [V8.9 Fix] 允許圖片跨域讀取，解決 3005 與 5173 路徑衝突
}));

// 2. Logging (Morgan) - Use 'dev' in development, 'combined' in production
const logLevel = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(logLevel));

// 3. CORS - 根據環境設定允許的來源
const allowedOrigins = [
    'https://xtc-biblestudy.idv.tw',
    'http://xtc-biblestudy.idv.tw',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:3005',
    'http://localhost:3005',
    // 開發環境來源
    ...(process.env.NODE_ENV !== 'production' ? [
        // Add any other dynamic origins here if needed
    ] : [])
];

const corsOptions = {
    origin: function (origin, callback) {
        const isLocalDevelopmentOrigin = process.env.NODE_ENV !== 'production'
            && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || '');
        // 允許無 origin 的請求（如 Postman、curl、同源請求）
        if (!origin || allowedOrigins.includes(origin) || isLocalDevelopmentOrigin) {
            callback(null, true);
        } else {
            console.warn(`⚠️ CORS blocked origin: ${origin}`);
            callback(new Error('CORS not allowed'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'X-Requested-With', 'Accept', 'X-Client-Id']
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Route handlers in older modules sometimes include internal error text. Keep
// development diagnostics while enforcing one stable production 5xx contract.
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        const sendJson = res.json.bind(res);
        res.json = (payload) => {
            if (res.statusCode >= 500 && !req.path.startsWith('/health/')) {
                return sendJson({ success: false, error: 'SERVER_ERROR' });
            }
            return sendJson(payload);
        };
        next();
    });
}

// 📱 Mobile Redirect Middleware — 手機裝置自動重導至 Mobile App
app.use(createMobileRedirectMiddleware());

// 4. Rate Limiting (Applied to /api routes)
// 開發環境可選擇性停用，生產環境強制啟用
if (process.env.NODE_ENV === 'production') {
    app.use('/api', apiLimiter);
    console.log('🛡️ Rate Limiter enabled for production');
} else {
    console.log('⚠️ Rate Limiter disabled for development');
}

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/health/ready', async (_req, res) => {
    try {
        const readiness = await dbOps.usersDb.get(`
            SELECT
                to_regclass('public.users') IS NOT NULL AS users_ready,
                to_regclass('public.game_reward_sessions') IS NOT NULL AS rewards_ready,
                to_regclass('public.asset_ledger') IS NOT NULL AS ledger_ready
        `);
        const ready = Boolean(readiness?.usersReady && readiness?.rewardsReady && readiness?.ledgerReady);
        return res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
    } catch (error) {
        logger.warn(`[Readiness] Database check failed: ${error.message}`);
        return res.status(503).json({ status: 'not_ready' });
    }
});

// ========== API Routes Mounting ==========

// Debug Middleware: Log all API requests
app.use('/api', (req, res, next) => {
    // [LOGGING ONLY] 不再手動更新 global.lastActivityAt，交由 Socket Session 判定閒置
    console.log(`📡 API Request: ${req.method} ${req.originalUrl}`);
    next();
});

// 1. Auth & Admin (Apply stricter auth limiter inside auth.js for specific routes)
// app.use('/api/dev', devRoutes); // 已移除
app.use('/api/admin/ai', adminAIRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes); // User Settings, Profile & AI Credits (Plural for consistency)
app.use('/api/admin/patrol', adminPatrolRoutes); // Sea Patrol Tracking
app.use('/api/admin/question-bank', questionBankRoutes);
app.use('/api/admin', adminRoutes);

// 2. Feature Modules
// app.use('/api/ai', aiRoutes); // 已移除過時路由
app.use('/api/generate', aiIpLimiter, generatorRoutes);
app.use('/api/logos', authenticateToken, aiIpLimiter, aiUserLimiter, logosRoutes); // Logos Engine - "The Brain"
// app.use('/api/devotional', aiRoutes); // 已移除過時路由
app.use('/api/devotional-notes', devotionalNotesRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/achievements', achievementsRoutes); // Achievement system
app.use('/api/content', contentRoutes); // Content Manager (Geography, Resources, Library)
app.use('/api/bible', readingPlansRoutes); // Bible Reading Plans
app.use('/api/scripture-selections', scriptureSelectionsRoutes); // Scripture highlights and notes
if (SCRIPTURE_TOOLS_ENABLED) {
    app.use('/api/scripture-tools', scriptureToolsRoutes); // Isolated scripture tools experiment
}
app.use('/api/quiz', quizRoutes); // Quiz System (Unified)
app.use('/api/game-sessions', gameSessionRoutes); // Server-authoritative game rewards
app.use('/api/expedition', expeditionRoutes); // Expedition Mode (獨立模組)
app.use('/api/narrative', narrativeRoutes); // Bible Narrative Engine (MVP Prototype)
app.use('/api/time-traveler', timeTravelerRoutes); // Bible Time Traveler AI Engine
// app.use('/api/pipeline', pipelineRoutes); // Removed

// [StockAI] Independent Product Line
app.use('/api/stockai', stockaiRouter);

// 3. Game & Bible Data
app.use('/api', gameRoutes); // /api/leaderboard, /api/users/coins
// app.use('/api', bibleRoutes); // FHL API 已移除

// 4. Special Aliases
// (legacy batch save removed — use domain-specific endpoints)

// [SOVEREIGN 1.2] 靈修公開 API - 前端相容層
// 前端 AIService.js 呼叫 /api/ai/devotional，此端點從資料庫讀取今日靈修
function isFallbackDevotionalTitle(title, author) {
    if (!title || typeof title !== 'string') return true;
    const trimmed = title.trim();
    if (!trimmed) return true;
    if (trimmed === '今日靈修') return true;
    if (trimmed.includes('的今日靈修')) return true;
    return Boolean(author && trimmed === `${author} 的今日靈修`);
}

function deriveDevotionalTitle(content) {
    const candidates = [
        content.topic,
        content.mainTheme,
        content.main_theme,
        content.theme,
        content.summaryTitle,
        content.title,
    ].filter(Boolean);

    const meaningful = candidates.find((candidate) => !isFallbackDevotionalTitle(candidate, content.author));
    if (meaningful) return meaningful;

    const cleanReference = String(content.scriptureReference || content.reference || '')
        .replace(/\s*\([^)]*\)\s*/g, '')
        .replace(/\s+\d+(\:\d+(-\d+)?)?$/, '')
        .trim();

    return cleanReference ? `${cleanReference}默想` : '今日靈修';
}

function normalizeDevotionalContent(content, rowMetadata = null) {
    if (!content || typeof content !== 'object') return content;
    return {
        ...content,
        title: deriveDevotionalTitle(content),
        metadata: {
            ...(rowMetadata && typeof rowMetadata === 'object' ? rowMetadata : {}),
            ...(content.metadata && typeof content.metadata === 'object' ? content.metadata : {})
        }
    };
}

app.get('/api/ai/devotional', async (req, res) => {
    try {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
        const dateKey = req.query.date || today;
        const row = await dbOps.getDevotional(dateKey);
        if (!row) {
            return res.json({ success: false, error: '今日靈修尚未生成，請稍後再試', isMissing: true });
        }
        const content = normalizeDevotionalContent(
            typeof row.content === 'string' ? JSON.parse(row.content) : row.content,
            typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
        );
        res.json({ success: true, data: content, dateKey: row.dateKey || dateKey });
    } catch (e) {
        console.error('[API] /api/ai/devotional error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 5. Serve static files (Frontend) - AFTER all API routes
const publicPath = path.join(__dirname, 'public');
const uploadsPath = path.join(__dirname, 'uploads');
const scriptureToolsPublicPath = path.join(__dirname, '../scripture-tools-app/dist');

if (SCRIPTURE_TOOLS_ENABLED) {
    app.use('/scripture-tools', express.static(scriptureToolsPublicPath, { index: 'index.html' }));
    app.use('/scripture-tools', (_req, res) => res.status(404).send('Scripture tool page not found.'));
} else {
    app.use('/scripture-tools', (_req, res) => res.status(404).send('Scripture tools are not enabled.'));
}

app.use(express.static(publicPath));
app.use('/uploads', express.static(uploadsPath));
// [ARCHITECTURAL DECOUPLING] Serve large static assets from standalone directory
app.use('/images/bible_knowledge', express.static(path.join(__dirname, 'static_assets/images/bible_knowledge')));
app.use('/images/geography', express.static(path.join(__dirname, 'static_assets/images/geography')));
app.use('/assets/lexicon', express.static(path.join(__dirname, 'static_assets/lexicon')));
app.use('/assets/maps', express.static(path.join(__dirname, 'static_assets/assets/maps')));

// [Production] Mobile App 靜態資源 — 掛載於 /m/ 路徑
const mobilePublicPath = fs.existsSync(path.join(__dirname, 'public-mobile'))
    ? path.join(__dirname, 'public-mobile')
    : path.join(__dirname, '../mobile-app/dist');
app.use('/m', express.static(mobilePublicPath));

// ========== 靈修排程系統 V3 ==========
// [SOVEREIGN V39] 已移至 bootServer() 統一導入 (Line 44)

// 公開排程狀態 API（供 Admin 查詢）
app.get('/api/admin/scheduler/status', ...adminOpsOnly, (req, res) => {
    res.json(scheduler.getSchedulerStatus());
});

// 補題服務狀態 API
app.get('/api/admin/replenishment/status', ...adminOpsOnly, (req, res) => {
    res.json({
        ...replenishmentService.getStatus(),
        enabled: QUESTION_REPLENISHMENT_ENABLED,
        autoPulseEnabled: QUESTION_REPLENISHMENT_ENABLED
    });
});

// 手動觸發補題 pulse（供 Admin 立即補題）
app.post('/api/admin/replenishment/pulse', ...adminOpsOnly, async (req, res) => {
    if (!QUESTION_REPLENISHMENT_ENABLED) {
        return res.status(403).json({
            success: false,
            message: 'Question replenishment is disabled. Set QUESTION_REPLENISHMENT_ENABLED=true to enable it explicitly.'
        });
    }

    if (replenishmentService.isCruising) {
        return res.json({ success: false, message: '補題服務正在執行中，請稍後再試。' });
    }
    replenishmentService.pulse().catch(e =>
        logger.error(`❌ [Replenishment] Manual pulse error: ${e.message}`)
    );
    res.json({ success: true, message: '已觸發補題 pulse，請稍後查詢狀態。' });
});

// 手動觸發生成 API（供 Admin 補生成過去日期）
app.post('/api/admin/scheduler/generate', ...adminOpsOnly, async (req, res) => {
    const { date } = req.body;
    if (!isValidISODate(date)) {
        return res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD' });
    }

    console.log(`📋 [Admin] Manual generation requested for ${date} (force: ${req.body.forceRefresh})`);
    const result = await scheduler.manualTrigger(dbOps, devotionalService, date, req.body.forceRefresh === true);
    res.json(result);
});

// 刪除靈修 API
app.delete('/api/admin/scheduler/:date', ...adminOpsOnly, async (req, res) => {
    const { date } = req.params;
    if (!isValidISODate(date)) {
        return res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD' });
    }

    console.log(`🗑️ [Admin] Deletion requested for ${date}`);
    const success = await dbOps.deleteDevotional(date);
    if (success) {
        res.json({ success: true, message: `已成功刪除 ${date} 的靈修內容` });
    } else {
        res.status(500).json({ success: false, error: '刪除失敗' });
    }
});

// 手動觸發補生成 API（批量填補過去 N 天）
app.post('/api/admin/scheduler/backfill', ...adminOpsOnly, async (req, res) => {
    const days = Number(req.body.days ?? 30);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
        return res.status(400).json({
            success: false,
            error: 'INVALID_BACKFILL_DAYS',
            message: 'days must be an integer between 1 and 365.'
        });
    }

    console.log(`📋 [Admin] Backfill requested for past ${days} days`);
    res.json({ message: `Backfill started for ${days} days. Check server logs for progress.` });

    // 背景執行補生成（不阻塞回應）
    scheduler.backfillMissingDevotionals(dbOps, devotionalService, days).catch(err => {
        console.error('Backfill error:', err);
    });
});

// [DEBUG] 排除列表診斷 API
app.get('/api/admin/scheduler/debug-exclusions', ...adminOpsOnly, async (req, res) => {
    try {
        // 複製 devotional.js 中的邏輯
        const recentDevotionals = await dbOps.getRecentDevotionals(60);

        const parseResults = recentDevotionals.map(d => {
            try {
                const contentObj = typeof d.content === 'string' ? JSON.parse(d.content) : d.content;
                const rawRef = contentObj?.scriptureReference || null;
                const cleanedRef = rawRef ? rawRef.replace(/\s*\([^)]+\)\s*$/, '').trim() : null;
                return {
                    date: d.date,
                    rawRef,
                    cleanedRef,
                    contentType: typeof d.content,
                    hasScriptureRef: !!contentObj?.scriptureReference
                };
            } catch (e) {
                return {
                    date: d.date,
                    error: e.message,
                    contentPreview: typeof d.content === 'string' ? d.content.substring(0, 100) : 'not-string'
                };
            }
        });

        // 正規化
        const normalizeScriptureRef = (ref) => {
            if (!ref) return '';
            return ref.replace(/\s+/g, '').replace(/[：:]/g, ':').replace(/[－\-–—]/g, '-').toLowerCase();
        };

        const exclusionList = parseResults
            .filter(r => r.cleanedRef)
            .map(r => ({
                original: r.cleanedRef,
                normalized: normalizeScriptureRef(r.cleanedRef)
            }));

        const uniqueNormalized = [...new Set(exclusionList.map(e => e.normalized))];

        res.json({
            totalDevotionals: recentDevotionals.length,
            parseResults: parseResults.slice(0, 10), // 只顯示前10個
            exclusionListLength: exclusionList.length,
            uniqueNormalizedCount: uniqueNormalized.length,
            uniqueNormalized
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API misses must stay API responses and must never fall through to SPA HTML.
app.use('/api', (_req, res) => {
    res.status(404).json({ success: false, error: 'API_NOT_FOUND' });
});

// ========== Frontend Fallback (SPA) ==========
// Make sure this is AFTER all API routes and excludes socket.io
app.get('*', (req, res, next) => {
    // 排除 Socket.io 路徑，交由 Socket.io 處理器或下一個中間件
    if (req.path.startsWith('/socket.io')) {
        return next();
    }
    // Mobile App SPA fallback：/m/* 路徑導向 Mobile App 的 index.html
    if (req.path.startsWith('/m/') || req.path === '/m') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.sendFile(path.join(mobilePublicPath, 'index.html'));
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(publicPath, 'index.html'));
});

// ========== Global Error Handler ==========
app.use((err, req, res, _next) => {
    logger.error('Express request failed', {
        errorName: err.name,
        errorCode: err.code,
        method: req.method,
        path: req.path
    });
    res.status(500).json({
        success: false,
        error: 'SERVER_ERROR',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Port Fallback Logic
const startServer = async (retryPort) => {
    const targetPort = retryPort || PORT;

    // Create new HTTP server for each attempt
    const server = createServer(app);

    // 2. 初始化核心 Socket 通訊
    initializeSocket(server);


    // 伺服器健康檢查與基礎設施同步
    (async () => {
        try {
            console.log('🔄 [Server] Starting secondary initializations...');
            // 1. 初始化資料庫連線狀況檢查
            await healthCheck.checkAllDatabases();
            console.log('✅ [Server] DB Health Check completed');
        } catch (e) {
            console.error('⚠️ [Server] Background Initialization Warning:', e.message);
        }
    })();

    server.listen(targetPort, async () => {
        console.log(`
        🚀 Server v5.0.0 (Autonomous Fleet Operations) is running on port ${targetPort}
        📡 API Base: http://localhost:${targetPort}
        ⏰ Time: ${new Date().toLocaleTimeString()}
        🔌 Socket.io attached to server
        `);

        // Cron Jobs (Legacy SQLite Backup - Deactivated for Postgres Unified Arch)
        console.log('📅 [Cron] Sync from Docker (Legacy) is DISABLED.');
        console.log('📅 [Cron] Backup schedules registered');

        // Start Daily Usage Reporter
        usageReporter.startSchedule();

        // 啟動時補生成交由 scheduler 模組自身管理 (在 config 載入 5 秒後執行)
    });

    server.on('error', (e) => {
        if (e.code === 'EADDRINUSE') {
            console.error(`🔥 Port ${targetPort} is already in use. Please kill the lingering process and try again.`);
            process.exit(1);
        } else {
            console.error('🔥 Server Error:', e);
        }
    });
};

// [REMOVED] Redundant and broken IIFE that attempts to re-initialize DB with wrong paths
// The DB initialization is handled by 'import { dbOps } from ./database/index.js'
// and ContentManager.initialize is handled in startServer()

export { app, bootServer, startServer };
