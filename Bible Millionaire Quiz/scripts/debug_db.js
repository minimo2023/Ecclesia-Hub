import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.production' });

async function checkDB() {
    const pool = new pg.Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: false
    });
    
    try {
        const res = await pool.query('SELECT "dateKey", length("dateKey") as len FROM public.daily_devotionals ORDER BY "dateKey" DESC LIMIT 5');
        console.log("ROWS:", JSON.stringify(res.rows, null, 2));
        
        // Also test the deletion and fetching logic
        const dateKey = '2026-05-30';
        const getRes = await pool.query('SELECT "dateKey" FROM public.daily_devotionals WHERE "dateKey" = $1', [dateKey]);
        console.log(`EXISTS ${dateKey}:`, getRes.rowCount > 0);
        
    } catch(e) {
        console.error("ERR:", e);
    } finally {
        await pool.end();
    }
}
checkDB();
