import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env BEFORE import dbOps
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

console.log('Migration Script Env Check:', {
    DB_TYPE: process.env.DB_TYPE,
    DB_HOST: process.env.DB_HOST,
    DB_PORT: process.env.DB_PORT
});

// Force correct port to 5432 (Standard Postgres)
// The local environment seems to have 5433 set incorrectly
process.env.DB_PORT = '5432';

import { dbOps } from '../database/index.js';
import crypto from 'crypto';

// Parse source_verse to extract book, chapter, verse
function parseSourceVerse(source) {
    if (!source) return { book: null, chapter: null, verse: null };

    // Format: "Book Chapter:Verse" or "Book Chapter:Verse-Verse"
    // Example: "創世記 1:1" or "John 3:16"
    try {
        const parts = source.split(' ');
        if (parts.length < 2) return { book: null, chapter: null, verse: null };

        const book = parts[0];
        const ref = parts[1]; // "1:1"
        const [chapterStr, verseStr] = ref.split(':');

        return {
            book: book.trim(),
            chapter: parseInt(chapterStr),
            verse: verseStr ? parseInt(verseStr.split('-')[0]) : null
        };
    } catch (e) {
        console.warn(`Failed to parse source: ${source}`);
        return { book: null, chapter: null, verse: null };
    }
}

async function migrate() {
    console.log('🚀 Starting migration: Expedition -> Central Question Bank');

    try {
        // 1. Get all expedition questions
        const expQuestions = await dbOps.gamesDb.all('SELECT * FROM expedition_questions');
        console.log(`found ${expQuestions.length} expedition questions.`);

        let successCount = 0;

        for (const eq of expQuestions) {
            // 2. Transform data
            const { book, chapter, verse } = parseSourceVerse(eq.source_verse);

            // Generate UUID if needed, or use existing ID if it was UUID (it's Serial Int in schema, probably need new UUID)
            const newId = crypto.randomUUID();

            // Parse options
            let options = [];
            try {
                options = typeof eq.options === 'string' ? JSON.parse(eq.options) : eq.options;
            } catch (e) {
                console.warn(`Skipping ID ${eq.id}: Invalid JSON options`);
                continue;
            }

            // Determine correct answer string from index
            const correctAnswer = options[eq.correct_index];
            if (!correctAnswer) {
                console.warn(`Skipping ID ${eq.id}: Invalid correct_index ${eq.correct_index} for options length ${options.length}`);
                continue;
            }

            // Check for existing question to prevent duplicates (Idempotency)
            const existing = await dbOps.gamesDb.get('SELECT id FROM questions WHERE question_text = ?', [eq.question]);
            if (existing) {
                process.stdout.write('.'); // Compact progress for skips
                continue;
            }

            // 3. Insert into main questions table
            await dbOps.gamesDb.run(`
                INSERT INTO questions (
                    id, book, chapter, verse,
                    question_text, options, correct_answer,
                    correct_index, evidence, question_type,
                    difficulty, source, tags, 
                    verified, created_at
                ) VALUES (
                    ?, ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?,
                    ?, ?
                )
            `, [
                newId, book, chapter, verse,
                eq.question, JSON.stringify(options), correctAnswer,
                eq.correct_index, eq.evidence, eq.question_type,
                eq.difficulty === 1 ? 'easy' : (eq.difficulty === 2 ? 'medium' : 'hard'), // Map difficulty
                'expedition_migration', // distinct source
                JSON.stringify(['expedition', `stage_${eq.difficulty}`]), // tags
                true, // verified (assuming expedition pool is somewhat verified or AI gen)
                eq.created_at
            ]);

            successCount++;
        }

        console.log(`✅ Migration complete. Moved ${successCount}/${expQuestions.length} questions.`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
    }
}

migrate();
