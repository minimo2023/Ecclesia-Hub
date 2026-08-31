import { dbOps } from '../database/index.js';

console.log('Checking questions table columns...');
(async () => {
    try {
        // Wait for DB init
        setTimeout(async () => {
            const r = await dbOps.gamesDb.all('SELECT * FROM questions LIMIT 1');
            if (r.length === 0) {
                // If no rows, we can't see keys from row. Use helper or schema query.
                // Postgres schema query:
                const cols = await dbOps.gamesDb.all("SELECT column_name FROM information_schema.columns WHERE table_name = 'questions'");
                console.log('SCHEMA COLUMNS:', cols.map(c => c.column_name));
            } else {
                console.log('ROW COLUMNS:', Object.keys(r[0]));
            }
        }, 1000);
    } catch (e) {
        console.error('Error:', e);
    }
})();
