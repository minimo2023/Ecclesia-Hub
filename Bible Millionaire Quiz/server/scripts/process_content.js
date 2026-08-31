
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';

// Setup environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../server/.env');

// Force load env from server directory
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}

const BATCH_SIZE = 10;
const DELAY_MS = 2000;

async function main() {
    console.log('🧹 Starting Data Cleaning Process...');
    console.log(`Node ENV: ${process.env.NODE_ENV}`);

    // Dynamic Imports
    const { SqliteAdapter } = await import('../database/adapters/sqlite.js');
    const { LogosEngine } = await import('../services/LogosEngine.js');
    const { ContentManager } = await import('../services/ContentManager.js');

    // Initialize DB Connection specific for this script
    // We connect manually to ensure we have control over the connection
    const dbPath = path.resolve(__dirname, '../../data/content.db');
    const db = new SqliteAdapter(dbPath);
    await db.connect();

    // Initialize ContentManager (Required for LogosEngine cache)
    await ContentManager.initialize(db);

    // Stats
    let processedCount = 0;

    // Auto-Migration (Ensure columns exist script-side)
    const columns = [
        'clean_title TEXT',
        'clean_summary TEXT',
        'category TEXT',
        'tags TEXT',
        'processed_at INTEGER'
    ];

    for (const colDef of columns) {
        const colName = colDef.split(' ')[0];
        try {
            await db.run(`ALTER TABLE resources ADD COLUMN ${colDef}`); // Use run for DDL
            console.log(`📦 Added column: ${colName}`);
        } catch (e) {
            // Check if error is "duplicate column name" -> ignore
            if (!e.message.includes('duplicate column')) {
                // console.warn(`   Migration note: ${e.message}`);
            }
        }
    }

    // Check pending count
    // Note: Migration happens on server startup. If this script runs standalone and schema isn't updated, 
    // SELECT processed_at will fail.
    // We assume the user has RESTARTED the server (`npm run dev:all`) at least once after my previous edit to schemas.js.

    try {
        const countCheck = await db.query('SELECT COUNT(*) as count FROM resources WHERE processed_at IS NULL');
        // console.log('Count Result:', countCheck);
        if (countCheck && countCheck.length > 0) {
            console.log(`Found ${countCheck[0].count} records needing cleaning.`);
        } else {
            console.error('❌ Check failed: Query returned empty result');
            // Proceed anyway? No, loop will fail
            process.exit(1);
        }
    } catch (e) {
        console.error('Check failed:', e.message);
        process.exit(1);
    }

    // Loop
    while (true) {
        const rows = await db.query(`
            SELECT id, title, content_type, summary, source FROM resources 
            WHERE processed_at IS NULL 
            LIMIT ?
        `, [BATCH_SIZE]);

        if (rows.length === 0) {
            console.log('✨ All records processed!');
            break;
        }

        console.log(`Processing batch of ${rows.length} records... (Total processed: ${processedCount})`);

        for (const row of rows) {
            try {
                // Prepare Context
                const context = {
                    title: row.title,
                    content: row.summary || row.title,
                    type: row.content_type || 'resource'
                };

                // Use explicit task 'data_cleaning'
                const result = await LogosEngine.askBrain('data_cleaning', {
                    userContext: context
                }, { forceRefresh: true });

                const aiData = result;

                if (aiData) {
                    await db.run(`
                        UPDATE resources SET 
                            clean_title = ?,
                            clean_summary = ?,
                            category = ?,
                            tags = ?,
                            processed_at = ?
                        WHERE id = ?
                    `, [
                        aiData.clean_title,
                        aiData.summary,
                        aiData.category,
                        JSON.stringify(aiData.tags || []),
                        Date.now(),
                        row.id
                    ]);
                    console.log(`   ✅ [${aiData.category}] ${aiData.clean_title}`);
                    processedCount++;
                } else {
                    console.warn(`   ⚠️ AI returned empty result for ${row.id}`);
                    await db.run(`UPDATE resources SET processed_at = ? WHERE id = ?`, [Date.now(), row.id]);
                }

                await new Promise(r => setTimeout(r, 200));

            } catch (err) {
                console.error(`   ❌ Failed to process ${row.id}:`, err.message);
                await db.run(`UPDATE resources SET processed_at = ? WHERE id = ?`, [Date.now(), row.id]);
            }
        }

        if (rows.length === BATCH_SIZE) {
            await new Promise(r => setTimeout(r, DELAY_MS));
        }
    }
}

main().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
