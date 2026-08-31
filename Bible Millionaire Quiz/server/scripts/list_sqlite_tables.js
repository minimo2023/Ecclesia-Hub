import Database from 'better-sqlite3';
import fs from 'fs';

const dbs = ['users.db', 'content.db', 'games.db', 'notes.db'];

dbs.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`\n--- ${file} ---`);
        const db = new Database(file);
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        console.log(tables.map(t => t.name).join(', '));
    } else {
        console.log(`\n--- ${file} (NOT FOUND) ---`);
    }
});
