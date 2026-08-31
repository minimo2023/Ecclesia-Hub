
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data/content.db');
const db = new Database(DB_PATH);

console.log('🔍 Diagnosing Content Database Relationships...\n');

try {
    // 1. Check Bible Books
    console.log('--- Bible Books (Sample) ---');
    const books = db.prepare('SELECT id, name_zh, name_en FROM bible_books LIMIT 5').all();
    console.table(books);

    // 2. Check Verse Locations Link
    console.log('\n--- Verse Locations Link ---');
    const locationCount = db.prepare('SELECT COUNT(*) as c FROM verse_locations').get().c;
    console.log(`Total verse_locations rows: ${locationCount}`);

    if (locationCount > 0) {
        const sampleLoc = db.prepare(`
            SELECT vl.book_id, vl.chapter, l.name_ch 
            FROM verse_locations vl
            JOIN locations l ON vl.location_id = l.id
            LIMIT 3
        `).all();
        console.log('Sample joins:', sampleLoc);

        // Test Join with Book Name
        const joinTest = db.prepare(`
            SELECT count(*) as c
            FROM verse_locations vl
            JOIN bible_books b ON vl.book_id = b.id
            WHERE b.name_zh = '創世記'
        `).get();
        console.log(`Locations linked to '創世記' (via name_zh): ${joinTest.c}`);
    } else {
        console.warn('⚠️ verse_locations is empty!');
    }

    // 3. Check Resources Link
    console.log('\n--- Resources Link ---');
    const resourceCount = db.prepare('SELECT COUNT(*) as c FROM resources').get().c;
    console.log(`Total resources: ${resourceCount}`);

    if (resourceCount > 0) {
        const sampleRes = db.prepare('SELECT id, title, related_books FROM resources WHERE related_books IS NOT NULL LIMIT 5').all();
        console.log('Sample resources with related_books:');
        sampleRes.forEach(r => console.log(`- [${r.title}]: ${r.related_books}`));

        // Test Query
        const queryTest = db.prepare(`
            SELECT count(*) as c FROM resources WHERE related_books LIKE '%創世記%'
        `).get();
        console.log(`Resources related to '創世記': ${queryTest.c}`);

        const queryTestEn = db.prepare(`
            SELECT count(*) as c FROM resources WHERE related_books LIKE '%Genesis%'
        `).get();
        console.log(`Resources related to 'Genesis': ${queryTestEn.c}`);
    } else {
        console.warn('⚠️ resources is empty!');
    }

} catch (err) {
    console.error('Diagnosis failed:', err);
}
