import fs from 'fs';
import path from 'path';

const potentialDbs = [
    'content.db',
    'users.db', 
    'games.db',
    'notes.db',
    'data/content.db',
    'data/users.db',
    'data/notes.db',
    'data/games.db',
    'data/questions.db',
    'data/fhl_bible.db',
    'data/bible_quiz.db',
    'server/data/content.db',
    'server/data/users.db',
    'server/data/notes.db',
    'server/database/games.db',
    'server/content.db',
    'server/games.db'
];

console.log('--- DB Sources Audit ---');
potentialDbs.forEach(file => {
    const fullPath = path.resolve(file);
    if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        console.log(`${file.padEnd(30)} | Size: ${(stats.size / 1024).toFixed(2)} KB | Modified: ${stats.mtime.toISOString()}`);
    } else {
        // console.log(`${file.padEnd(30)} | NOT FOUND`);
    }
});
