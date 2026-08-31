// Test script to verify database stats query
import { dbOps } from './database/index.js';

console.log('🔍 Testing database connection...');

try {
    console.log('\n1. Testing gamesDb:');
    console.log('gamesDb exists:', !!dbOps.gamesDb);

    console.log('\n2. Testing book stats query:');
    const results = dbOps.gamesDb.prepare(`
        SELECT 
            book,
            COUNT(*) as count,
            SUM(CASE WHEN difficulty = 'easy' THEN 1 ELSE 0 END) as easy,
            SUM(CASE WHEN difficulty = 'medium' THEN 1 ELSE 0 END) as medium,
            SUM(CASE WHEN difficulty = 'hard' THEN 1 ELSE 0 END) as hard,
            SUM(CASE WHEN difficulty = 'very_hard' THEN 1 ELSE 0 END) as very_hard,
            SUM(CASE WHEN status = 'flagged' OR quality = 'suspicious' THEN 1 ELSE 0 END) as suspected,
            MAX(created_at) as last_added
        FROM questions
        GROUP BY book
        ORDER BY book
        LIMIT 5
    `).all();

    console.log('\nResults:');
    console.log(JSON.stringify(results, null, 2));

    console.log('\n✅ Test successful!');
} catch (error) {
    console.error('\n❌ Test failed:');
    console.error(error);
}
