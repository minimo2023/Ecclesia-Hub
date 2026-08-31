
import { initializeInfrastructure } from './index.js';

async function finalAudit() {
    console.log('🏛️  [Logos Bank - Physical Audit Report]');
    console.log('========================================');
    
    try {
        const dbOps = await initializeInfrastructure();
        const db = dbOps.contentDb;

        // 1. Physical Purge Verification
        console.log('\n[1. Physical Purge Status]');
        const tables = await db.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'");
        const junkList = ['extracted_text', 'api_cache', 'collections', 'commentaries', 'resources'];
        const tableNames = tables.map(t => t.tablename);
        
        let allPurged = true;
        for (const junk of junkList) {
            const exists = tableNames.includes(junk);
            console.log(`- ${junk.padEnd(20)}: ${exists ? '❌ REMAINING' : '✅ PURGED'}`);
            if (exists) allPurged = false;
        }

        // 2. Schema Hardening Verification
        console.log('\n[2. Schema Hardening Status]');
        const schemaQuery = "SELECT column_name FROM information_schema.columns WHERE table_name = 'questions' AND table_schema = 'public'";
        const qCols = await db.query(schemaQuery);
        const qColNames = qCols.map(c => c.columnName || c.column_name);
        
        console.log(`- questions.version      : ${qColNames.includes('version') ? '✅ OK' : '❌ MISSING (Detected: ' + qColNames.join(',') + ')'}`);
        console.log(`- questions.linked_entities: ${qColNames.includes('linked_entities') ? '✅ OK' : '❌ MISSING'}`);

        const lSchemaQuery = "SELECT column_name FROM information_schema.columns WHERE table_name = 'locations' AND table_schema = 'public'";
        const lCols = await db.query(lSchemaQuery);
        const lColNames = lCols.map(c => c.columnName || c.column_name);
        console.log(`- locations.lng (geo)    : ${lColNames.includes('lng') ? '✅ OK' : '❌ MISSING (Current: ' + lColNames.join(',') + ')'}`);

        const indexes = await db.query("SELECT indexname FROM pg_indexes WHERE tablename = 'questions'");
        const hasGIN = indexes.some(i => i.indexname === 'idx_questions_semantic_v3');
        console.log(`- GIN Semantic Index     : ${hasGIN ? '✅ ACTIVE' : '❌ MISSING'}`);

        // 3. Sovereign Realignment Verification
        console.log('\n[3. Sovereign Realignment Status]');
        console.log('--- Bible Verses (Text) ---');
        const verses = await db.query('SELECT version, COUNT(*) as count FROM bible_verses GROUP BY version ORDER BY count DESC');
        verses.forEach(v => console.log(`  - ${v.version.padEnd(15)}: ${String(v.count).padStart(5)} rows`));

        console.log('--- Questions (Logic) ---');
        const qCount = await db.query('SELECT version, COUNT(*) as count FROM questions GROUP BY version ORDER BY count DESC');
        qCount.forEach(v => console.log(`  - ${(v.version || 'NULL').padEnd(15)}: ${String(v.count).padStart(5)} items`));

        console.log('\n========================================');
        console.log('🏁 Audit Complete.');
        process.exit(0);
    } catch (e) {
        console.error('❌ Audit Failed:', e.message);
        process.exit(1);
    }
}

finalAudit();
