import { database } from '../services/database/DatabaseAdapter';
import { questions as staticQuestions } from '../data/questions';

export const migrateStaticQuestionsToFirestore = async () => {
    console.log("Starting migration...");
    let addedCount = 0;
    let skippedCount = 0;

    for (const q of staticQuestions) {
        try {
            // Check for duplicates (Exact match)
            const existing = await database.query('questions', {
                book: q.book,
                question: q.question
            });

            if (existing.length === 0) {
                await database.add('questions', {
                    book: q.book,
                    chapter: null, // Static questions don't have chapter info
                    category: q.category,
                    difficulty: q.difficulty,
                    question: q.question,
                    options: q.options,
                    answer: q.answer,
                    source: 'static_migration',
                    createdAt: Date.now(),
                    verified: true // Static questions are assumed verified
                });
                addedCount++;
                if (addedCount % 50 === 0) console.log(`Migrated ${addedCount} questions...`);
            } else {
                skippedCount++;
            }
        } catch (e) {
            console.error("Error migrating question:", q, e);
        }
    }

    console.log(`Migration Complete! Added: ${addedCount}, Skipped: ${skippedCount}`);
    alert(`Migration Complete!\nAdded: ${addedCount}\nSkipped: ${skippedCount}`);
};
