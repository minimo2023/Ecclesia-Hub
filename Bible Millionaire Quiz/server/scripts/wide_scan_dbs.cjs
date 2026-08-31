const Database = require('better-sqlite3');
const fs = require('fs');

const dbs = [
    'data/bible_quiz.db',
    'data/fhl_bible.db',
    'data/questions.db',
    'data/bible_quiz_dev.db',
    'content.db',
    'data/content.db',
    'server/data/content.db',
    'backups/v2_stable/content.db'
];

dbs.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`\n🔍 Scanning ${file}...`);
        try {
            const db = new Database(file);
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
            tables.forEach(t => {
                const count = db.prepare(`SELECT count(*) as c FROM ${t.name}`).get().c;
                if (count > 0) {
                    console.log(`  📊 ${t.name.padEnd(20)} | Rows: ${count}`);
                }
            });
        } catch (e) {
            console.log(`  ❌ Error: ${e.message}`);
        }
    }
});
