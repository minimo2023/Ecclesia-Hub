import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbs = [
    'data/bible_quiz_dev.db', // Check if this exists based on .env
    'data/bible_quiz.db',
    'data/fhl_bible.db',
    'data/questions.db',
    'data/users.db',
    'data/notes.db'
];

dbs.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`\n--- ${file} ---`);
        try {
            const db = new Database(file);
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
            console.log(tables.map(t => t.name).join(', '));
            
            // If content.db, check for specific tables
            if (tables.some(t => t.name === 'bible_verses')) {
                console.log('  [Found bible_verses]');
            }
            if (tables.some(t => t.name === 'resources')) {
                console.log('  [Found resources]');
            }
            if (tables.some(t => t.name === 'locations')) {
                console.log('  [Found locations]');
            }
        } catch (e) {
            console.log(`  [Error reading: ${e.message}]`);
        }
    }
});
