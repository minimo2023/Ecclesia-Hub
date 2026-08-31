import { initializeDatabases } from '../server/database/core.js';
import dotenv from 'dotenv';
dotenv.config();

async function probe() {
    console.log('📡 [Probe] Sending physical ping to PostgreSQL...');
    try {
        const dbs = await initializeDatabases();
        
        const tables = await dbs.usersDb.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name LIKE '%devotional%'
            ORDER BY table_name
        `);
        
        console.log('\n--- 🎯 PHYSICAL TRACE: DEVOTIONAL MODULE ---');
        if (tables && tables.length > 0) {
            tables.forEach(t => console.log(`[FOUND] ${t.tableName || t.table_name || 'unknown'}`));
        } else {
            console.log('❌ FATAL: Devotional tables STILL MISSING from physical schema.');
        }
        console.log('--------------------------------------------');
        
        process.exit(0);
    } catch (e) {
        console.error('❌ Probe Failed:', e.message);
        process.exit(1);
    }
}

probe();
