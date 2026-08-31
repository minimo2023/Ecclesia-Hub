/**
 * [SOVEREIGN UNIT] Database Main Entry Point
 * v3.5 - Unified Infrastructure & Proxy Exports
 * Pursuing "Stable and Accurate" data sovereignty.
 */
import { config } from '../utils/config.js';
import { initializeDatabases, crypto } from './core.js';
import { createNotesOps } from './notes.js';
import { createGamesOps } from './games.js';
import { createContentOps } from './content.js';
import { createUsersOps } from './users.js';
import { createSystemOps } from './system.js';
import { createNarrativeOps } from './operations/narrativeOps.js';
import { LogosBank } from './services/LogosBankService.js';

// Global instances (populated after initialization)
export let usersDb, contentDb, notesDb, gamesDb;
export let usersOps, notesOps, gamesOps, contentOps, systemOps, narrativeOps;

/**
 * [PHASE 4] 初始化底層架構
 * 由 server/index.js 統一呼叫，確保點火順序
 * @returns {Promise<Object>} dbOps 代理物件
 */
export async function initializeInfrastructure() {
    const DB_TYPE = config.db.type;
    console.log(`🚀 [Database] Starting infrastructure initialization (${DB_TYPE})...`);

    // 1. Dynamic Schema Import
    let schemas;
    if (DB_TYPE === 'postgres') {
        schemas = await import('./schemas/index.js');
    } else {
        throw new Error('❌ Unsupported DB_TYPE. Only "postgres" is supported.');
    }

    const {
        createUsersTables, createContentTables, createNotesTables, createGamesTables, createExpeditionTables,
        migrateUsersTableV2, createAICreditTables, createMembershipTables, createNarrativeEngineTables, createAuditTables,
        createNarrativeContentTables, migrateNarrativeScenesV2, migrateNarrativeCatalog,
        createNarrativeBlueprintV2Tables, createTimeTravelerTables, createAIGovernanceTables,
        createSecurityTables, createSystemTables, createReadingPlansTables, createQuestionQualityV4Tables,
        createQuestionBankGovernanceTables, createScriptureOrderLabTables, createScriptureRecordingTables
    } = schemas;

    // 2. Connect to Database
    const dbs = await initializeDatabases();
    usersDb = dbs.usersDb;
    contentDb = dbs.contentDb;
    notesDb = dbs.notesDb;
    gamesDb = dbs.gamesDb;

    // 3. Initialize Tables
    try {
        console.log('🔄 [Database] STEP 1: Core system tables...');
        await createUsersTables(usersDb);
        await createSecurityTables(usersDb);
        await createContentTables(contentDb);
        await createNotesTables(notesDb);
        await createReadingPlansTables(notesDb);
        await createGamesTables(gamesDb);
        await createQuestionQualityV4Tables(gamesDb);
        await createQuestionBankGovernanceTables(gamesDb);
        await createScriptureOrderLabTables(gamesDb);
        await createScriptureRecordingTables(notesDb);
        await createSystemTables(usersDb);
        
        console.log('🔄 [Database] STEP 2: Migrations & Advanced Modules...');
        if (createExpeditionTables) await createExpeditionTables(gamesDb);
        await migrateUsersTableV2(usersDb);
        await createAICreditTables(usersDb);
        await createMembershipTables(usersDb);
        await createNarrativeEngineTables(usersDb);
        await createAuditTables(usersDb);
        await createNarrativeContentTables(contentDb);
        await migrateNarrativeScenesV2(contentDb);
        await migrateNarrativeCatalog(contentDb);
        await createNarrativeBlueprintV2Tables(usersDb);
        await createTimeTravelerTables(usersDb);
        await createAIGovernanceTables(usersDb);
        
        console.log('🔄 [Database] STEP 3: StockAI & License Modules...');
        if (schemas.createStockAILicenseTables) {
            await schemas.createStockAILicenseTables(usersDb);
        }
        
        console.log('✅ [Database] Core Infrastructure initialized (Sovereign Mode).');
    } catch (e) {
        console.error('❌ [Database] ERROR CAPTURED IN INITIALIZE:', e.message);
        throw e;
    }

    // 4. Initialize Operations
    usersOps = createUsersOps(usersDb);
    notesOps = createNotesOps(notesDb);
    gamesOps = createGamesOps(gamesDb);
    contentOps = createContentOps(contentDb);
    systemOps = createSystemOps({ usersDb, contentDb, notesDb, gamesDb });
    narrativeOps = createNarrativeOps(contentDb, usersDb);

    // [SOVEREIGN 1.1] 異步點火健康檢查
    const { checkAllDatabases } = await import('./healthCheck.js');
    if (checkAllDatabases) {
        checkAllDatabases().catch(e => console.error('❌ Health check error:', e.message));
    }

    // 5. Self-Healing Tasks
    usersOps.backfillAICreditWallets().catch(e => console.warn('⚠️ Backfill failed:', e.message));

    return dbOps;
}

/**
 * 統一 dbOps 代理介面 (Sovereign Proxy)
 * 這是全站資料操作的唯一合法關口
 */
export const dbOps = {
    // === Direct Access ===
    get db() { return usersDb; },
    get usersDb() { return usersDb; },
    get contentDb() { return contentDb; },
    get notesDb() { return notesDb; },
    get gamesDb() { return gamesDb; },

    // === Modular Proxies ===
    getUser: async (id) => await usersOps.getUser(id),
    handleDailyBonus: async (id) => await usersOps.handleDailyBonus(id),
    adjustAICredits: async (u, p, a, r, c) => {
        const result = await LogosBank.adjustAssets(u, 'AI_CREDIT', a, r, { pool: p, correlationId: c });
        return result.aiCredits;
    },
    logAIUsage: async (u, m, pt, ct, cp, ci) => await usersOps.logAIUsage(u, m, pt, ct, cp, ci),
    recordCoinChange: async (u, a, r, b) => await usersOps.recordCoinChange(u, a, r, b),
    adjustCoins: async (u, d, r) => {
        const result = await LogosBank.adjustAssets(u, 'COIN', d, r);
        return { newBalance: result.coins };
    },
    exchangeAssets: async (u, a, direction = 'coin_to_credit') => {
        // dynamic rate fetch
        const rateCoinToCredit = parseInt(await systemOps.getSetting('rate_coin_to_credit', 50), 10);
        const rateCreditToCoin = parseInt(await systemOps.getSetting('rate_credit_to_coin', 45), 10);
        
        let cost, awarded;
        if (direction === 'coin_to_credit') {
            cost = a * rateCoinToCredit;
            awarded = a;
        } else if (direction === 'credit_to_coin') {
            cost = a;
            awarded = a * rateCreditToCoin;
        } else {
            throw new Error('Invalid exchange direction');
        }

        const result = await LogosBank.exchange(u, cost, awarded, direction, 'exchange');
        return {
            awarded: result.awarded,
            cost: result.cost,
            newExchangeBalance: result.newExchangeBalance,
            aiCredits: result.aiCredits,
            coins: result.coins
        };
    },
    setCoins: async (u, a, r) => await usersOps.setCoins(u, a, r),
    getCoinLedger: async (u, l) => await usersOps.getCoinLedger(u, l),
    getAICreditLedger: async (u, l) => await usersOps.getAICreditLedger(u, l),
    getEconomyTotalStats: async () => await usersOps.getEconomyTotalStats(),
    getAIModelConfigs: async () => await usersOps.getAIModelConfigs(),
    getAIUsageStats: async (d) => await usersOps.getAIUsageStats(d),
    
    getStats: async () => await systemOps.getStats(),
    getSystemInfo: async () => await systemOps.getSystemInfo(),
    getAuditLogs: async (l) => await systemOps.getAuditLogs(l),
    getSetting: async (k, d) => await systemOps.getSetting(k, d),
    saveSetting: async (k, v, desc) => await systemOps.saveSetting(k, v, desc),

    enqueueGeneration: async (t) => await notesOps.enqueueGeneration(t),
    getRecentDevotionals: async (l) => await notesOps.getRecentDevotionals(l),
    saveDevotional: async (d) => await notesOps.saveDevotional(d),
    getDevotional: async (d) => await notesOps.getDevotional(d),
    deleteDevotional: async (d) => await notesOps.deleteDevotional(d),
    getTodayLiturgicalEvent: async (ds) => await notesOps.getTodayLiturgicalEvent(ds),
    getDevotionalHistory: async (o) => await notesOps.getDevotionalHistory(o),
    getAuthorsForStyle: async (s) => await notesOps.getAuthorsForStyle(s),
    
    selectWeightedScripture: async (sb) => await notesOps.selectWeightedScripture(sb),
    updateWeightedSelection: async (b, d, c) => await notesOps.updateWeightedSelection(b, d, c),
    getUserNotes: async (u) => await notesOps.getUserNotes(u),
    getDraft: async (u, d) => await notesOps.getDraft(u, d),
    saveDraft: async (u, d, c) => await notesOps.saveDraft(u, d, c),
    deleteDraft: async (u, d) => await notesOps.deleteDraft(u, d),

    getLeastUsedBooks: async (l, v) => await gamesOps.getLeastUsedBooks(l, v),
    checkSemanticDuplicate: async (q) => await gamesOps.checkSemanticDuplicate(q),
    getSemanticGroupKeysByQuestionTexts: async (texts) => await gamesOps.getSemanticGroupKeysByQuestionTexts(texts),
    getQuestionsByRange: async (...args) => await gamesOps.getQuestionsByRange(...args),
    getQuestionsInBatchRange: async (...args) => await gamesOps.getQuestionsInBatchRange(...args),
    getPlayableQuestionsInBatchRange: async (...args) => await gamesOps.getPlayableQuestionsInBatchRange(...args),
    getPlayableQuestionInventory: async (...args) => await gamesOps.getPlayableQuestionInventory(...args),
    getChapterCategoryStats: async (...args) => await gamesOps.getChapterCategoryStats(...args),
    getBookTotalQuestions: async (...args) => await gamesOps.getBookTotalQuestions(...args),
    getBookQuestionCounts: async (...args) => await gamesOps.getBookQuestionCounts(...args),
    batchSaveQuestions: async (items) => await gamesOps.batchSaveQuestions(items),
    updateQuestionDistractors: async (...args) => await gamesOps.updateQuestionDistractors(...args),
    getPassQuestionsWithoutDistractors: async (limit) => await gamesOps.getPassQuestionsWithoutDistractors(limit),
    updateQuestionDifficultyScore: async (id, sd) => await gamesOps.updateQuestionDifficultyScore(id, sd),
    getPassQuestionsWithoutScore: async (limit) => await gamesOps.getPassQuestionsWithoutScore(limit),
    getAllBooks: async () => await contentOps.getAllBooks(),


    // Content & Bible Proxies
    saveVerse: async (v) => await contentOps.saveVerse(v),
    getVerse: async (...args) => await contentOps.getVerse(...args),
    searchVerses: async (...args) => await contentOps.searchVerses(...args),
    cacheAPIResponse: async (...args) => await contentOps.cacheAPIResponse(...args),
    getCachedAPI: async (...args) => await contentOps.getCachedAPI(...args),
    getCommentaries: async (...args) => await contentOps.getCommentaries(...args),
    getLexicon: async (...args) => await contentOps.getLexicon(...args),
    searchLexicons: async (...args) => await contentOps.searchLexicons(...args),
    getRandomLexicons: async (...args) => await contentOps.getRandomLexicons(...args),
    getLocation: async (...args) => await contentOps.getLocation(...args),
    getAllLocations: async (...args) => await contentOps.getAllLocations(...args),
    getLocationsByVerse: async (...args) => await contentOps.getLocationsByVerse(...args),
    getLocationCount: async (...args) => await contentOps.getLocationCount(...args),
    searchLocations: async (...args) => await contentOps.searchLocations(...args),

    // Standard save mocks
    saveDatabase() { },
};

export { crypto };
