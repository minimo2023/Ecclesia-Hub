const sqlite = require('better-sqlite3');
const db = new sqlite('data/users.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
console.log('--- 🛡️ User DB Scan Report ---');
tables.forEach(t => {
    const count = db.prepare(`SELECT count(*) as c FROM ${t}`).get().c;
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
    console.log(`📊 ${t.padEnd(16)} | Count: ${count.toString().padEnd(6)} | Cols: ${cols.join(', ')}`);
});
db.close();
