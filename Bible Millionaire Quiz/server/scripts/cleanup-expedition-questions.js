/**
 * Cleanup Script: Delete malformed expedition questions
 * 清理格式錯誤的遠征題目
 * 
 * Run: node server/scripts/cleanup-expedition-questions.js
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dynamic import to handle path resolution
const { dbOps, initializeDatabase } = await import(join(__dirname, '..', 'database', 'index.js'));

async function cleanupMalformedQuestions() {
    console.log('🧹 Starting expedition question cleanup...');

    await initializeDatabase();

    try {
        // Get all questions
        const allQuestions = await dbOps.gamesDb.prepare(
            'SELECT id, question, options, difficulty FROM expedition_questions'
        ).all();

        console.log(`📊 Total questions in pool: ${allQuestions.length}`);

        let deletedCount = 0;
        let validCount = 0;
        const deleteIds = [];

        for (const q of allQuestions) {
            let isValid = true;
            let options;

            try {
                // Try to parse options
                if (typeof q.options === 'string') {
                    options = JSON.parse(q.options);
                } else {
                    options = q.options;
                }

                // Validate options is an array with at least 2 items
                if (!Array.isArray(options) || options.length < 2) {
                    isValid = false;
                }
            } catch (e) {
                isValid = false;
            }

            if (!isValid) {
                deleteIds.push(q.id);
                console.log(`❌ Malformed Q#${q.id}: ${q.question?.substring(0, 30)}... (options: ${String(q.options).substring(0, 50)})`);
            } else {
                validCount++;
            }
        }

        if (deleteIds.length > 0) {
            // Delete malformed questions
            const placeholders = deleteIds.map(() => '?').join(',');
            await dbOps.gamesDb.prepare(
                `DELETE FROM expedition_questions WHERE id IN (${placeholders})`
            ).run(...deleteIds);
            deletedCount = deleteIds.length;
        }

        console.log(`\n✅ Cleanup complete!`);
        console.log(`   - Deleted: ${deletedCount} malformed questions`);
        console.log(`   - Remaining: ${validCount} valid questions`);

        // Show pool stats by difficulty
        const stats = await dbOps.gamesDb.prepare(`
            SELECT difficulty, COUNT(*) as count 
            FROM expedition_questions 
            GROUP BY difficulty
        `).all();

        console.log('\n📊 Pool Stats by Stage:');
        stats.forEach(s => {
            console.log(`   Stage ${s.difficulty}: ${s.count} questions`);
        });

    } catch (error) {
        console.error('❌ Cleanup failed:', error);
    }

    process.exit(0);
}

cleanupMalformedQuestions();
