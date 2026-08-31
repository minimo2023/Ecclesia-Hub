/**
 * Wave 1 Migration: Core Content
 * Source: data/content.db
 * Targets: bible_verses, bible_books, locations, verse_locations, resources, extracted_text
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

const BATCH_SIZE = 500;

async function migrate() {
    const sqlite = new Database('data/content.db');
    const pg = new PostgresAdapter(pgConfig);
    await pg.connect();
    
    console.log('🚀 Wave 1 Migration Started: Bible, Geo, Interpretations');
    
    const tables = [
        { src: 'bible_books', dest: 'bible_books' },
        { src: 'bible_verses', dest: 'bible_verses' },
        { src: 'locations', dest: 'locations' },
        { src: 'verse_locations', dest: 'verse_locations' },
        { src: 'resources', dest: 'resources' },
        { src: 'extracted_text', dest: 'extracted_text' }
    ];
    
    const summary = [];
    
    for (const table of tables) {
        try {
            console.log(`\n📦 Migrating ${table.src} -> ${table.dest}...`);
            
            // 1. Fetch source count
            const count = sqlite.prepare(`SELECT count(*) as c FROM ${table.src}`).get().c;
            if (count === 0) {
                console.log(`  ⚠️ Table ${table.src} is empty. Skipping.`);
                summary.push({ table: table.src, status: 'EMPTY' });
                continue;
            }

            // 2. Fetch target columns from Postgres
            const pgColsRes = await pg.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = $1 AND table_schema = 'public'
            `, [table.dest]);
            const targetCols = pgColsRes.map(r => r.column_name.toLowerCase());
            
            if (targetCols.length === 0) {
                throw new Error(`Target table ${table.dest} not found in Postgres schemas.`);
            }
            
            // 3. Fetch all source rows
            const rows = sqlite.prepare(`SELECT * FROM ${table.src}`).all();
            console.log(`  📥 Total rows to move: ${count}`);
            
            // 4. Prepare Batching
            let migratedRows = 0;
            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batch = rows.slice(i, i + BATCH_SIZE);
                
                // Generate Insert Statement based on INTERSECTION of columns
                const srcCols = Object.keys(batch[0]).map(c => c.toLowerCase());
                const commonCols = srcCols.filter(c => targetCols.includes(c));
                
                if (commonCols.length === 0) {
                    throw new Error(`No common columns between SQLite ${table.src} and Postgres ${table.dest}`);
                }
                
                const placeholders = commonCols.map(() => '?').join(', ');
                const sql = `INSERT INTO ${table.dest} (${commonCols.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
                
                // Map values carefully
                const processedBatch = batch.map(row => {
                   const lowerRow = {};
                   for (const key in row) lowerRow[key.toLowerCase()] = row[key];
                   
                   return commonCols.map(key => {
                       let val = lowerRow[key];
                       if (key.endsWith('_at') && typeof val === 'number') return new Date(val * 1000).toISOString();
                       if (typeof val === 'object' && val !== null) return JSON.stringify(val);
                       return val;
                   });
                });
                
                // Execute Directly for mass migration to avoid transaction issues
                for (const vals of processedBatch) {
                    await pg.query(sql, vals);
                }
                
                migratedRows += batch.length;
                if (i % 2000 === 0) process.stdout.write(`.`);
            }
            
            console.log(`\n✅ Finished ${table.src}: ${migratedRows} rows handled.`);
            summary.push({ table: table.src, status: 'SUCCESS', count: migratedRows });
            
        } catch (e) {
            console.error(`\n❌ Error migrating ${table.src}:`, e.message);
            summary.push({ table: table.src, status: 'FAILED', error: e.message });
        }
    }
    
    console.log('\n--- Wave 1 Migration Summary ---');
    console.table(summary);
    
    await pg.close();
    sqlite.close();
    console.log('✨ Wave 1 Execution Finished.');
}

migrate().catch(console.error);
