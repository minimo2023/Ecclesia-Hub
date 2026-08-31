import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { dbOps } from '../database/index.js';

// Setup environment for standalone script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

function migrate() {
    console.log('Running migration: Add option_E and option_F using existing dbOps...');
    const db = dbOps.gamesDb; // questions table is in games.db!

    try {
        try {
            db.prepare('ALTER TABLE questions ADD COLUMN option_E TEXT').run();
            console.log('✅ Added option_E');
        } catch (err) {
            if (err.message.includes('duplicate column name')) {
                console.log('⚠️ option_E already exists');
            } else {
                console.error('❌ Failed to add option_E:', err.message);
            }
        }

        try {
            db.prepare('ALTER TABLE questions ADD COLUMN option_F TEXT').run();
            console.log('✅ Added option_F');
        } catch (err) {
            if (err.message.includes('duplicate column name')) {
                console.log('⚠️ option_F already exists');
            } else {
                console.error('❌ Failed to add option_F:', err.message);
            }
        }

        // Verify
        const columns = db.prepare("PRAGMA table_info(questions)").all();
        const columnNames = columns.map(c => c.name);
        console.log('Current columns:', columnNames.join(', '));

        if (columnNames.includes('option_E') && columnNames.includes('option_F')) {
            console.log('🎉 Migration SUCCESS');
            process.exit(0);
        } else {
            console.error('❌ Migration FAILED');
            process.exit(1);
        }
    } catch (err) {
        console.error('🔥 Fatal error:', err);
        process.exit(1);
    }
}

migrate();
