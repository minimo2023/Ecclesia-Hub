import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const workerRoot = path.join(process.cwd(), 'steward-ops', 'XIT-Worker');
const databasePath = path.join(workerRoot, 'schedule.db');
const jsonPath = path.join(workerRoot, 'schedule-data.json');
if (!fs.existsSync(databasePath) || fs.statSync(databasePath).size < 4096) throw new Error('XIT schedule database is missing or empty');
if (!fs.existsSync(jsonPath)) throw new Error('XIT schedule JSON fallback is missing');
JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const database = new Database(databasePath, { readonly: true, fileMustExist: true });
try {
    const integrity = database.pragma('integrity_check');
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error(`XIT database integrity failed: ${JSON.stringify(integrity)}`);
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
    if (!tables.includes('schedules')) throw new Error('XIT schedules table is missing');
} finally {
    database.close();
}
console.log('XIT data integrity verified.');
