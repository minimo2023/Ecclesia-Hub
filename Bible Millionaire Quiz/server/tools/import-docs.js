import { dbOps } from './database/index.js'; // This initializes DB
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const INPUT_PATH = process.argv[2] || '../data/raw/commentary_ot'; // Default to OT raw dir

async function importDocs() {
    if (!existsSync(INPUT_PATH)) {
        console.error(`❌ Input path not found: ${INPUT_PATH}`);
        process.exit(1);
    }

    let files = [];
    if (statSync(INPUT_PATH).isDirectory()) {
        console.log(`📂 Scanning directory: ${INPUT_PATH}...`);
        files = readdirSync(INPUT_PATH).filter(f => f.endsWith('.json')).map(f => join(INPUT_PATH, f));
    } else {
        files = [INPUT_PATH];
    }

    console.log(`🔍 Found ${files.length} files to import.`);
    console.log('🚀 Starting import...');

    let totalInserted = 0;

    // Batch process to avoid huge memory usage
    const BATCH_SIZE = 50;
    let batch = [];

    for (const file of files) {
        try {
            let contentStr = readFileSync(file, 'utf8');
            // Strip BOM if present
            if (contentStr.charCodeAt(0) === 0xFEFF) {
                contentStr = contentStr.slice(1);
            }

            const content = JSON.parse(contentStr);
            batch.push(content);

            if (batch.length >= BATCH_SIZE) {
                totalInserted += dbOps.importCommentaries(batch);
                batch = [];
                process.stdout.write('.');
            }
        } catch (e) {
            console.error(`❌ Failed to parse ${file}:`, e.message);
        }
    }

    // Process remaining
    if (batch.length > 0) {
        totalInserted += dbOps.importCommentaries(batch);
    }

    console.log('\n✅ Import finished!');
    console.log(`   Inserted: ${totalInserted}`);
}

importDocs().catch(e => console.error(e));
