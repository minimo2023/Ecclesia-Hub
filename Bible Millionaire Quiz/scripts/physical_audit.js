import { initializeDatabases } from '../server/database/core.js';
import dotenv from 'dotenv';
dotenv.config();

async function runAudit() {
    console.log('🚀 [1.1 Audit] Starting Physical Sovereignty Check...');
    
    try {
        const dbs = await initializeDatabases();
        if (!dbs) throw new Error('Database initialization returned null');
        
        const db = dbs.db;
        const aiDb = dbs.aiDb;
        const gamesDb = dbs.gamesDb;

        console.log('\n--- [public.daily_devotionals] ---');
        // PostgreSQL: 務必確認 Table 是否存在
        const devos = await db.all('SELECT date, generated_at FROM public.daily_devotionals ORDER BY date DESC LIMIT 10');
        if (devos && devos.length > 0) {
            console.table(devos);
        } else {
            console.log('⚠️ No daily devotionals found.');
        }
        
        const count = await db.get('SELECT COUNT(*) as total FROM public.daily_devotionals');
        console.log(`Total rows: ${count?.total || 0}`);

        console.log('\n--- [ai_gov.ai_usage_logs] ---');
        const logs = await aiDb.all('SELECT module_name, cost_twd, created_at FROM ai_gov.ai_usage_logs ORDER BY created_at DESC LIMIT 10');
        if (logs && logs.length > 0) {
            console.table(logs);
        } else {
            console.log('⚠️ No AI usage logs found in ai_gov schema.');
        }
        
        const logCount = await aiDb.get('SELECT COUNT(*) as total FROM ai_gov.ai_usage_logs');
        console.log(`AI Log entries: ${logCount?.total || 0}`);

        console.log('\n--- [expedition_config] ---');
        const configCount = await gamesDb.get('SELECT COUNT(*) as total FROM expedition_config');
        console.log(`Config rows: ${configCount?.total || 0}`);
        
        console.log('\n✅ 1.1 PHYSICAL AUDIT COMPLETE');
    } catch (err) {
        console.error('❌ Audit Failed at line:', err.stack);
    } finally {
        // 確保進程結束
        setTimeout(() => process.exit(0), 1000);
    }
}

runAudit();
