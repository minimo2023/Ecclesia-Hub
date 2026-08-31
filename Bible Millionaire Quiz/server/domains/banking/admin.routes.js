import express from 'express';
import { dbOps } from '../../database/index.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import quotaService from '../../infrastructure/ai/QuotaService.js';
import {
    DEFAULT_GEMINI_MODEL,
    FLASH_MODEL_SHUTDOWN_DATES,
    RECOMMENDED_GEMINI_MODELS,
    isAllowedGeminiModel
} from '../../infrastructure/ai/model-policy.js';

const router = express.Router();

/**
 * [PHASE 4] AI 治理核心路由
 */

// 1. 獲取所有模型配置與費率
router.get('/config', authenticateToken, requireRole(['admin_ops']), async (req, res) => {
    try {
        const configs = await dbOps.db.query('SELECT * FROM ai_gov.ai_model_config ORDER BY model_id');
        const systemConfig = await dbOps.db.query('SELECT key, value FROM ai_gov.ai_system_config');
        const systemConfigMap = Object.fromEntries(systemConfig.map(c => [c.key, c.value]));
        if (!isAllowedGeminiModel(systemConfigMap.default_ai_model)) {
            systemConfigMap.default_ai_model = DEFAULT_GEMINI_MODEL;
        }

        res.json({
            success: true,
            data: configs.map(config => {
                const modelId = config.modelId ?? config.model_id;
                const isActive = config.isActive ?? config.is_active;
                return {
                    model_id: modelId,
                    friendly_name: config.friendlyName ?? config.friendly_name,
                    input_price_per_1k_points: config.inputPricePer1kPoints ?? config.input_price_per_1k_points,
                    output_price_per_1k_points: config.outputPricePer1kPoints ?? config.output_price_per_1k_points,
                    is_active: isAllowedGeminiModel(modelId) && isActive,
                    updated_at: config.updatedAt ?? config.updated_at,
                    policy_allowed: isAllowedGeminiModel(modelId)
                };
            }),
            systemConfig: systemConfigMap,
            modelPolicy: {
                family: 'flash',
                generalPurposeOnly: true,
                defaultModel: DEFAULT_GEMINI_MODEL,
                recommendedModels: RECOMMENDED_GEMINI_MODELS,
                shutdownDates: FLASH_MODEL_SHUTDOWN_DATES
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. 獲取 Token 統計數據 (含每日趨勢)
router.get('/stats', authenticateToken, requireRole(['admin_ops']), async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;

        // 抓取 Google 配額紅綠燈數據 (Phase 4 核心)
        const quotaStatus = await quotaService.getGeminiQuota();

        // A. 抓取近 N 天的每日消耗台幣與 Token
        const dailyBreakdown = await dbOps.db.query(`
            SELECT
                TO_CHAR(created_at, 'YYYY-MM-DD') as date,
                COALESCE(SUM(prompt_tokens + completion_tokens), 0) as tokens,
                COALESCE(SUM(total_cost_twd), 0) as cost
            FROM ai_gov.ai_usage_logs
            WHERE created_at >= CURRENT_DATE - interval '${days} days'
            GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
            ORDER BY date ASC
        `);

        // B. 抓取總累計數據
        const totalStats = await dbOps.db.get(`
            SELECT
                COALESCE(SUM(prompt_tokens + completion_tokens), 0) as "totalTokens",
                COALESCE(SUM(total_cost_twd), 0) as "totalCost"
            FROM ai_gov.ai_usage_logs
        `);

        // C. 抓取初始抵銷額 (Offset) 與預算上限
        const configEntries = await dbOps.db.query('SELECT key, value FROM ai_gov.ai_system_config');
        const configMap = Object.fromEntries(configEntries.map(e => [e.key, e.value]));

        // parseNumeric: PostgreSQL DECIMAL 欄位可能回傳 Decimal 物件，需先 String() 再 parseFloat
        const parseNumeric = (v, fallback = 0) => { const n = parseFloat(String(v ?? fallback)); return isNaN(n) ? fallback : n; };

        const initialOffset = parseNumeric(configMap['initial_spent_offset_twd']);
        const budgetLimit   = parseNumeric(configMap['budget_limit_twd'], 1000);
        const totalCostSum  = parseNumeric(totalStats?.totalCost);

        res.json({
            success: true,
            data: {
                totalTokensUsed: parseInt(totalStats?.totalTokens || 0),
                totalPointsConsumed: (totalCostSum + initialOffset).toFixed(2),
                budgetLimit,
                quotaStatus,
                dailyBreakdown: dailyBreakdown.map(d => ({
                    date: d.date,
                    tokens: parseInt(d.tokens || 0),
                    cost: parseNumeric(d.cost).toFixed(2)
                }))
            }
        });
    } catch (error) {
        console.error('AI Stats API Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. 更新或新增模型配置 (Upsert)
router.put('/config/:id', authenticateToken, requireRole(['admin_ops']), async (req, res) => {
    try {
        const { id } = req.params;
        const { friendly_name, input_price_per_1k_points, output_price_per_1k_points, is_active } = req.body;

        if (!isAllowedGeminiModel(id)) {
            return res.status(400).json({
                success: false,
                code: 'MODEL_NOT_ALLOWED',
                error: '模型政策僅允許尚未停用、可處理文字與工具呼叫的 Gemini Flash 系列。'
            });
        }

        await dbOps.db.run(`
            INSERT INTO ai_gov.ai_model_config (model_id, friendly_name, input_price_per_1k_points, output_price_per_1k_points, is_active)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (model_id) DO UPDATE 
            SET friendly_name = EXCLUDED.friendly_name, 
                input_price_per_1k_points = EXCLUDED.input_price_per_1k_points, 
                output_price_per_1k_points = EXCLUDED.output_price_per_1k_points, 
                is_active = EXCLUDED.is_active, 
                updated_at = CURRENT_TIMESTAMP
        `, [id, friendly_name, input_price_per_1k_points, output_price_per_1k_points, is_active]);

        res.json({ success: true, message: '配置已更新' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. 手動同步初始已用額度 (Offset)
router.post('/sync-initial', authenticateToken, requireRole(['admin_ops']), async (req, res) => {
    try {
        const { offset } = req.body;
        await dbOps.db.run(`
            INSERT INTO ai_gov.ai_system_config (key, value) VALUES ('initial_spent_offset_twd', $1)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        `, [offset.toString()]);

        res.json({ success: true, message: '初始額度已同步' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 5. 設定系統預設模型
router.post('/default-model', authenticateToken, requireRole(['admin_ops']), async (req, res) => {
    try {
        const { modelId } = req.body;
        if (!isAllowedGeminiModel(modelId)) {
            return res.status(400).json({
                success: false,
                code: 'MODEL_NOT_ALLOWED',
                error: '模型政策僅允許尚未停用、可處理文字與工具呼叫的 Gemini Flash 系列。'
            });
        }

        await dbOps.db.run(`
            INSERT INTO ai_gov.ai_system_config (key, value) VALUES ('default_ai_model', $1)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        `, [modelId]);

        // 4. 強制刷新全站 AI 配置
        const { syncAIConfig } = await import('../../infrastructure/ai/gemini-client.js');
        await syncAIConfig(true);

        res.json({ success: true, message: `預設模型已切換為 ${modelId}` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 6. 獲取審計日誌 (含分頁)
router.get('/logs', authenticateToken, requireRole(['admin_ops']), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const offset = (page - 1) * limit;

        const logs = await dbOps.db.query(`
            SELECT
                l.id,
                l.module_name,
                l.prompt_tokens,
                l.completion_tokens,
                l.total_cost_twd,
                l.created_at,
                c.friendly_name as model_name,
                l.model_id
            FROM ai_gov.ai_usage_logs l
            LEFT JOIN ai_gov.ai_model_config c ON l.model_id = c.model_id
            ORDER BY l.created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        res.json({ success: true, data: logs });
    } catch (error) {
        console.error('AI Logs API Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 7. AI 成本歸因分析 (依功能模組，區分免費/付費，支援帳期對齊)
router.get('/cost-analysis', authenticateToken, requireRole(['admin_ops']), async (req, res) => {
    try {
        const { mode, month, days } = req.query;

        // 解析查詢起始時間（台灣時區 UTC+8）
        let dateFrom;
        let dateTo = null;
        let periodLabel;

        if (mode === 'current_period' || (!mode && !month && !days)) {
            // 本月 1 日 00:00 台灣時間 = UTC 前一日 16:00
            const now = new Date();
            const twNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
            dateFrom = new Date(Date.UTC(twNow.getUTCFullYear(), twNow.getUTCMonth(), 1) - 8 * 60 * 60 * 1000);
            periodLabel = `${twNow.getUTCFullYear()}年${twNow.getUTCMonth() + 1}月（當前帳期）`;
        } else if (month) {
            // month = 'YYYY-MM'
            const [y, m] = month.split('-').map(Number);
            dateFrom = new Date(Date.UTC(y, m - 1, 1) - 8 * 60 * 60 * 1000);
            dateTo = new Date(Date.UTC(y, m, 1) - 8 * 60 * 60 * 1000);
            periodLabel = `${y}年${m}月`;
        } else {
            const n = parseInt(days) || 30;
            dateFrom = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
            periodLabel = `最近 ${n} 天`;
        }

        const queryParams = [dateFrom.toISOString()];
        let timeCondition = "created_at >= $1";
        if (dateTo) {
            queryParams.push(dateTo.toISOString());
            timeCondition += " AND created_at < $2";
        }

        const byModule = await dbOps.db.query(`
            SELECT module_name,
                   COALESCE(SUM(prompt_tokens + completion_tokens), 0)::int as total_tokens,
                   COALESCE(SUM(CASE WHEN total_cost_twd = 0 THEN prompt_tokens + completion_tokens ELSE 0 END), 0)::int as free_tokens,
                   COALESCE(SUM(CASE WHEN total_cost_twd > 0 THEN prompt_tokens + completion_tokens ELSE 0 END), 0)::int as paid_tokens,
                   COALESCE(SUM(total_cost_twd), 0) as total_cost
            FROM ai_gov.ai_usage_logs
            WHERE ${timeCondition}
            GROUP BY module_name ORDER BY total_cost DESC, total_tokens DESC
        `, queryParams);

        const totals = await dbOps.db.get(`
            SELECT 
                COALESCE(SUM(prompt_tokens + completion_tokens), 0)::int as total_tokens,
                COALESCE(SUM(CASE WHEN total_cost_twd = 0 THEN prompt_tokens + completion_tokens ELSE 0 END), 0)::int as free_tokens,
                COALESCE(SUM(CASE WHEN total_cost_twd > 0 THEN prompt_tokens + completion_tokens ELSE 0 END), 0)::int as paid_tokens,
                COALESCE(SUM(CASE WHEN total_cost_twd = 0 THEN 1 ELSE 0 END), 0)::int as free_requests,
                COALESCE(SUM(CASE WHEN total_cost_twd > 0 THEN 1 ELSE 0 END), 0)::int as paid_requests,
                COALESCE(SUM(total_cost_twd), 0) as total_cost
            FROM ai_gov.ai_usage_logs 
            WHERE ${timeCondition}
        `, queryParams);

        // current_period 模式加入 initial_spent_offset
        let offsetTwd = 0;
        const includesOffset = (mode === 'current_period' || (!mode && !month && !days));
        if (includesOffset) {
            const offsetRow = await dbOps.db.get("SELECT value FROM ai_gov.ai_system_config WHERE key = 'initial_spent_offset_twd'");
            offsetTwd = parseFloat(offsetRow?.value || 0);
        }

        res.json({
            success: true,
            data: {
                byModule,
                totals: {
                    ...totals,
                    totalCost: parseFloat(totals?.totalCost || totals?.total_cost || 0) + offsetTwd
                },
                periodLabel,
                includesOffset
            }
        });
    } catch (error) {
        console.error('AI Cost Analysis Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
