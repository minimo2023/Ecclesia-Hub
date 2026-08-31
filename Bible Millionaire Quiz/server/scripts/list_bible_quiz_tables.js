import Database from 'better-sqlite3';

const dbsToAudit = [
    { file: 'data/content.db', bibleTable: 'bible_verses' }
];

dbsToAudit.forEach(item => {
    const file = item.file;
    if (fs.existsSync(file)) {
        const db = new Database(file);
        console.log(`\n📄 File: ${file}`);
        const info = db.prepare("PRAGMA table_info(resources)").all();
        console.log('Columns in "resources":', info.map(c => c.name).join(', '));
    }
});
