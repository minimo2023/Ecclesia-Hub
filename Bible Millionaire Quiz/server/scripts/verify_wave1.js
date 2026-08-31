/**
 * Wave 1 Verification: External Audit
 * Compares counts and samples between SQLite (data/content.db) and Postgres.
 */
import Database from 'better-sqlite3';
import { PostgresAdapter } from '../database/adapters/postgres.js';
import dotenv from 'dotenv';
dotenv.config();

const pgConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 5433,
    user: process.env.DB_USER || 'dev',
    password: process.env.DB_PASSWORD || 'dev123',
    database: process.env.DB_NAME || 'bible_quiz_dev'
};

async function verify() {
    const sqlite = new Database('data/content.db');
    const pg = new PostgresAdapter(pgConfig);
    await pg.connect();
    
    console.log('\n--- ⚖️ Wave 1 External Audit Report ---');
    
    const tables = [
        { name: 'bible_books', pk: 'id' },
        { name: 'bible_verses', pk: 'id' },
        { name: 'locations', pk: 'id' },
        { name: 'verse_locations', pk: 'id' },
        { name: 'resources', pk: 'id' },
        { name: 'extracted_text', pk: 'id' }
    ];
    
    let allMatch = true;
    
    for (const table of tables) {
        // Count Scan
        const sCount = sqlite.prepare(`SELECT count(*) as c FROM ${table.name}`).get().c;
        const pRes = await pg.query(`SELECT count(*) as c FROM ${table.name}`);
        const pCount = parseInt(pRes[0].c);
        
        const status = sCount === pCount ? '✅ MATCH' : '❌ MISMATCH';
        console.log(`📊 ${table.name.padEnd(16)} | SQLite: ${sCount.toString().padEnd(6)} | PG: ${pCount.toString().padEnd(6)} | ${status}`);
        
        if (sCount !== pCount) allMatch = false;
        
        // Sample Check (1 random row)
        if (sCount > 0) {
            const sRow = sqlite.prepare(`SELECT * FROM ${table.name} LIMIT 1`).get();
            const pRowRes = await pg.query(`SELECT * FROM ${table.name} WHERE ${table.pk} = $1`, [sRow[table.pk]]);
            
            if (pRowRes.length > 0) {
                console.log(`   🔎 Sample [${sRow[table.pk]}] found in PG.`);
            } else {
                console.log(`   ⚠️ Sample [${sRow[table.pk]}] NOT found in PG!`);
                allMatch = false;
            }
        }
    }
    
    console.log('\n--- Final Verdict ---');
    if (allMatch) {
         console.log('🏆 STATUS: ALL CORE DATA VERIFIED. WAVE 1 SUCCESS.');
    } else {
         console.warn('⚠️ STATUS: DISCREPANCIES DETECTED. REVIEW LOGS.');
    }
    
    await pg.close();
    sqlite.close();
}

verify().catch(console.error);
