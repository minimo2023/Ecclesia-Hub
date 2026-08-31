const sqlite = require('better-sqlite3');
const dbs = ['users.db', 'games.db', 'notes.db'];

dbs.forEach(name => {
    const path = `data/${name}`;
    try {
        const db = new sqlite(path);
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
        console.log(`\n--- 🛡️ ${name} Scan ---`);
        tables.forEach(t => {
            const count = db.prepare(`SELECT count(*) as c FROM ${t}`).get().c;
            const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
            console.log(`📊 ${t.padEnd(18)} | Count: ${count.toString().padEnd(6)} | Cols: ${cols.join(', ')}`);
        });
        db.close();
    } catch (e) {
        console.error(`Error scanning ${name}:`, e.message);
    }
});
