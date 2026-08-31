import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

// Use local environment by default
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'dev',
  password: process.env.DB_PASSWORD || 'dev123',
  database: process.env.DB_NAME || 'bible_quiz_v3'
});

async function main() {
  console.log('=== Pruning Local Database to 500 Distributed Questions ===');

  try {
    // 1. Get all available books
    const { rows: bookRows } = await pool.query('SELECT DISTINCT book FROM questions WHERE status = $1', ['PASS']);
    const books = bookRows.map(r => r.book);
    
    if (books.length === 0) {
      console.log('No questions found in database.');
      return;
    }

    console.log(`Found ${books.length} unique books in the database.`);

    // 2. Calculate how many questions per book to aim for 500 total
    const TARGET_TOTAL = 500;
    const targetPerBook = Math.ceil(TARGET_TOTAL / books.length);
    console.log(`Aiming for ~${targetPerBook} questions per book...`);

    const selectedIds = [];

    // 3. Randomly select questions per book
    for (const book of books) {
      const { rows } = await pool.query(`
        SELECT id FROM questions 
        WHERE book = $1 AND status = 'PASS'
        ORDER BY RANDOM() 
        LIMIT $2
      `, [book, targetPerBook]);
      
      rows.forEach(r => selectedIds.push(r.id));
    }

    console.log(`Selected ${selectedIds.length} questions to KEEP.`);

    // If we have fewer than 500, we might need to top up with random questions from any book
    // But since the DB has 6000+ questions, we likely hit exactly or slightly more than 500.
    // Let's cap exactly at 500 by randomly removing excess if needed.
    while (selectedIds.length > TARGET_TOTAL) {
        const removeIdx = Math.floor(Math.random() * selectedIds.length);
        selectedIds.splice(removeIdx, 1);
    }
    
    console.log(`Final count of questions to KEEP: ${selectedIds.length}`);

    if (selectedIds.length === 0) {
      console.log('No IDs selected. Aborting to prevent deleting everything.');
      return;
    }

    // 4. Delete everything else
    console.log(`Deleting all other questions...`);
    
    // Postgres limits parameters in IN clause to ~32767, but 500 is perfectly fine.
    const deleteResult = await pool.query(`
      DELETE FROM questions 
      WHERE id != ALL($1)
    `, [selectedIds]);

    console.log(`✅ Success! Deleted ${deleteResult.rowCount} questions.`);
    console.log(`Database is now pruned to exactly ${selectedIds.length} questions for testing.`);

  } catch (error) {
    console.error('Error during pruning:', error);
  } finally {
    await pool.end();
  }
}

main();
