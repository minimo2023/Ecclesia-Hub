import pkg from 'pg';
const { Client } = pkg;
const dbConfig = {
    connectionString: process.env.DATABASE_URL
};
async function migrate() {
    const client = new Client(dbConfig);
    await client.connect();
    
    // Check if name_zh exists or name_ch needs to be renamed
    try {
        await client.query("ALTER TABLE locations RENAME COLUMN name_ch TO name_zh");
        console.log("Renamed name_ch to name_zh");
    } catch(e) {} // Ignore if it doesn't exist

    await client.query(`
        ALTER TABLE locations ADD COLUMN IF NOT EXISTS name_en TEXT;
        ALTER TABLE locations ADD COLUMN IF NOT EXISTS meaning TEXT;
        ALTER TABLE locations ADD COLUMN IF NOT EXISTS description TEXT;
        ALTER TABLE locations ADD COLUMN IF NOT EXISTS verse_refs TEXT;
        ALTER TABLE locations ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
        ALTER TABLE locations ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
        ALTER TABLE locations ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION;
    `);
    
    console.log("Migration complete.");
    await client.end();
}
migrate().catch(console.error);
