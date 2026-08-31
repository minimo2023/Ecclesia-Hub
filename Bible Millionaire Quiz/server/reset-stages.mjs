import Database from 'better-sqlite3';
const db = new Database('./database/games.db');
db.exec("DELETE FROM expedition_config WHERE key = 'stages'");
console.log('✅ Deleted old stages config, restart server to apply new defaults');
db.close();
