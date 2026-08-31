const sqlite = require('better-sqlite3');
const db = new sqlite('data/users.db');
const row = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
console.log('SQLite Admin ID:', row ? row.id : 'NOT FOUND');
db.close();
