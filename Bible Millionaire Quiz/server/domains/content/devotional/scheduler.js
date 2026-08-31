/**
 * [SOVEREIGN UNIT] Devotional Scheduler V3
 * v3.8 - High-reliability Scheduling with Auto-boot Recovery
 * Pursuing "Stable and Accurate" spiritual replenishment.
 */
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '../../../utils/logger.js';
import { config } from '../../../utils/config.js';
import { inventoryService } from '../../game/expedition/InventoryService.js';
import { GlobalAIState } from '../../../infrastructure/ai/gemini-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const registeredTasks = [];
const generatingDates = new Set();

const getTaiwanDate = (offsetDays = 0) => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
    const date = new Date(`${today}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date.toISOString().slice(0, 10);
};

async function ensureDevotionalForDate(dbOps, devotionalService, dateKey, triggerSource = 'scheduled', forceRefresh = false) {
    if (generatingDates.has(dateKey)) return { success: true, action: 'generating' };

    generatingDates.add(dateKey);
    try {
        const existing = await dbOps.getDevotional(dateKey);
        if (existing && !forceRefresh) {
            logger.info(`✅ [Scheduler] [${triggerSource}] ${dateKey} data already exists. Skip backfill.`);
            return { success: true, action: 'skipped' };
        }

        // [GOVERNANCE] Check if we should proceed with background task
        if (triggerSource !== 'manual-trigger' && GlobalAIState.checkHealth() !== 'green') {
            logger.warn(`🛡️ [Scheduler] System busy (${GlobalAIState.status}). Yielding devotional generation for ${dateKey}`);
            return { success: false, action: 'yielded', error: '目前 AI 伺服器繁忙，自動生成已暫停。請稍後再試或使用手動強制生成。' };
        }

        logger.info(`[Scheduler] [${triggerSource}] ⏳ ${dateKey} missing, triggering generation...`);
        const isPriority = triggerSource === 'manual-trigger';
        await devotionalService.generateDevotional({ targetDate: dateKey, isPriority, forceRefresh });

        logger.info(`[Scheduler] [${triggerSource}] ✅ ${dateKey} hand-off complete.`);
        return { success: true, action: 'generated', date: dateKey };
    } catch (error) {
        if (error?.code === 'DEVOTIONAL_GENERATING') {
            return { success: true, action: 'generating', date: dateKey };
        }
        logger.error(`[Scheduler] ❌ ${dateKey} FAILED:`, error.message);
        return { success: false, action: 'failed', error: error.message };
    } finally {
        generatingDates.delete(dateKey);
    }
}

async function backfillMissingDevotionals(dbOps, devotionalService, days = 5) {
    logger.info(`🛡️ [Scheduler] Starting Sovereign Guard backfill check for past ${days} days...`);

    // 從今天開始回溯 (串行執行並加入延遲)
    for (let i = 0; i <= days; i++) {
        // [QUOTA GUARD] 發現免費額度耗盡 (YELLOW)，立即停止補生成
        if (GlobalAIState.checkHealth() === 'yellow' || GlobalAIState.checkHealth() === 'red') {
            logger.warn(`⚠️ [Scheduler] AI State is ${GlobalAIState.status} (Quota Exhausted). Aborting backfill loop.`);
            break; 
        }

        const targetDate = getTaiwanDate(-i);
        const result = await ensureDevotionalForDate(dbOps, devotionalService, targetDate, 'backfill');

        // 如果實際觸發了生成，則等待一段時間再處理下一個，防止 429 爆發
        if (result.action === 'generated') {
            logger.info(`⏳ [Scheduler] Waiting 15s before next backfill step...`);
            await sleep(15000);
        }
    }

    logger.info('✅ [Scheduler] Sovereign Guard backfill check completed.');
}

/**
 * [V3.8] 手動觸發特定日期的生成 (供 Admin 使用)
 */
async function manualTrigger(dbOps, devotionalService, dateKey, forceRefresh = false) {
    if (!dbOps || !devotionalService) return { success: false, error: 'Services not initialized' };

    try {
        if (forceRefresh) logger.info(`📋 [Scheduler] [Manual] Force refresh requested for ${dateKey}; existing content remains until replacement passes validation.`);
        const result = await ensureDevotionalForDate(dbOps, devotionalService, dateKey, 'manual-trigger', forceRefresh);
        return result;
    } catch (e) {
        logger.error(`[Scheduler] manualTrigger error for ${dateKey}:`, e.message);
        return { success: false, error: e.message };
    }
}

function initializeScheduler(dbOps, devotionalService) {
    if (!dbOps || !devotionalService) return false;

    const register = (cronExpr, name) => {
        cron.schedule(cronExpr, async () => {
            await ensureDevotionalForDate(dbOps, devotionalService, getTaiwanDate(), name);
        }, { scheduled: true, timezone: 'Asia/Taipei' });
        registeredTasks.push({ name, expression: cronExpr });
    };

    register('5 0 * * *', 'daily-0005');
    register('0 6 * * *', 'daily-0600');

    // [IDLE MONITOR] 積極全時閒置感應循環
    const runAggressivePatrol = async () => {
        if (process.env.QUESTION_REPLENISHMENT_ENABLED !== 'true') {
            logger.info('[Scheduler] Automatic question replenishment patrol is disabled.');
            return;
        }

        try {
            if (config.patrol.enabled) {
                // [GOVERNANCE] Check if AI is stressed
                if (GlobalAIState.checkHealth() !== 'green') {
                    logger.debug(`🛡️ [Scheduler] System busy (${GlobalAIState.status}). Patrol fleet yielding...`);
                    setTimeout(runAggressivePatrol, 120000); // Wait 2m longer
                    return;
                }

                const isIdle = await inventoryService.checkIsIdle();
                if (isIdle) {
                    logger.info('🛰️ [Scheduler] Continuous Idle Mode: Initiating cruise...');
                    const hasProgress = await inventoryService.startIdleCruise();

                    if (hasProgress) {
                        const delay = Math.max(config.patrol.throttleDelay || 30000, 60000); // 至少 60s
                        logger.info(`🛰️ [Scheduler] Step progress made. Next step in ${delay/1000}s if still idle.`);
                        setTimeout(runAggressivePatrol, delay);
                        return;
                    }
                }
            }
        } catch (error) {
            logger.error(`❌ [Scheduler] Aggressive patrol error: ${error.message}`);
        }
        // 若非閒置、無進度或發生錯誤，則恢復標準輪詢 (1分鐘)
        setTimeout(runAggressivePatrol, 60 * 1000);
    };

    // 分階段啟動 (Staggered Boot)
    setTimeout(() => {
        logger.info('🚀 [Scheduler] Phase 1: Initiating Devotional Backfill (10s post-boot)...');
        backfillMissingDevotionals(dbOps, devotionalService, 3).catch(e => logger.error('❌ Backfill failed:', e.message));
    }, 10000);

    /*
    setTimeout(() => {
        logger.info('🚀 [Scheduler] Phase 2: Initiating Patrol Fleet Cruise (30s post-boot)...');
        runAggressivePatrol().catch(e => logger.error('❌ Aggressive patrol failed:', e.message));
    }, 30000);
    */

    return true;
}

function getSchedulerStatus() {
    return { initialized: true, tasks: registeredTasks, serverTime: new Date().toISOString(), taiwanDate: getTaiwanDate() };
}

const scheduler = { initializeScheduler, ensureDevotionalForDate, backfillMissingDevotionals, getSchedulerStatus, manualTrigger };
export { initializeScheduler, ensureDevotionalForDate, backfillMissingDevotionals, getSchedulerStatus, manualTrigger };
export default scheduler;
