import { dbOps } from '../server/database/index.js';

async function check() {
    try {
        console.log('--- Checking Questions Table Columns ---');
        // PostgreSQL stores table names in lowercase unless quoted
        const cols = await dbOps.gamesDb.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'questions'");
        console.log(JSON.stringify(cols, null, 2));
        
        console.log('\n--- Checking Locations Table Columns ---');
        const locCols = await dbOps.contentDb.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'locations'");
        console.log(JSON.stringify(locCols, null, 2));

        console.log('\n--- Database Type ---');
        console.log('DB_TYPE:', process.env.DB_TYPE);
        
        process.exit(0);
    } catch (error) {
        console.error('Check failed:', error);
        process.exit(1);
    }
}

check();
