const sqlite = require('better-sqlite3');
const db = new sqlite('data/users.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
console.log('User DB Tables:', tables.join(', '));
for (const t of tables) {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
    console.log(`- ${t}: ${cols.join(', ')}`);
}
db.close();
