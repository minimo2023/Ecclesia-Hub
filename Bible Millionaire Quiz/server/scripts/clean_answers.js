import { initializeDatabases } from '../database/core.js';

const stripPunc = (s) => typeof s === 'string' ? s.trim().replace(/^[。，、；：！？「」『』【】《》〈〉…—～·.,;:!?'"()\[\]{}\s]+|[。，、；：！？「」『』【】《》〈〉…—～·.,;:!?'"()\[\]{}\s]+$/g, '').trim() : s;

async function run() {
    try {
        console.log('Connecting to database...');
        const dbs = await initializeDatabases();
        const gamesDb = dbs.gamesDb;

        const rows = await gamesDb.query("SELECT id, answer, options FROM questions");
        if (!rows || rows.length === 0) {
            console.log('No questions found.');
            process.exit(0);
        }

        let updatedCount = 0;

        for (const row of rows) {
            const originalAnswer = row.answer;
            const cleanedAnswer = stripPunc(originalAnswer);
            
            let originalOptionsStr = row.options;
            let cleanedOptionsStr = originalOptionsStr;

            if (originalOptionsStr && typeof originalOptionsStr === 'string' && originalOptionsStr.startsWith('[')) {
                try {
                    const opts = JSON.parse(originalOptionsStr);
                    const cleanedOpts = opts.map(opt => stripPunc(opt));
                    cleanedOptionsStr = JSON.stringify(cleanedOpts);
                } catch (e) {
                    console.error(`Failed to parse options for question ${row.id}`);
                }
            } else if (Array.isArray(originalOptionsStr)) {
                const cleanedOpts = originalOptionsStr.map(opt => stripPunc(opt));
                cleanedOptionsStr = JSON.stringify(cleanedOpts);
                originalOptionsStr = JSON.stringify(originalOptionsStr); // 轉成字串以便比對
            }

            if (originalAnswer !== cleanedAnswer || originalOptionsStr !== cleanedOptionsStr) {
                try {
                    // Update the row
                    await gamesDb.query(
                        "UPDATE questions SET answer = $1, options = $2 WHERE id = $3",
                        [cleanedAnswer, cleanedOptionsStr, row.id]
                    );
                    updatedCount++;
                } catch (updateErr) {
                    console.error(`Error updating question ${row.id}`, updateErr);
                }
            }
        }

        console.log(`✅ Successfully cleaned ${updatedCount} questions.`);
        process.exit(0);
    } catch (e) {
        console.error('Error cleaning database', e);
        process.exit(1);
    }
}

run();
