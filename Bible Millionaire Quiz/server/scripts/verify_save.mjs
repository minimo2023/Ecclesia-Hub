import { initializeInfrastructure, dbOps } from '../database/index.js';
import dotenv from 'dotenv';
dotenv.config();

async function verify() {
    await initializeInfrastructure();
    const res = await dbOps.db.query("SELECT book, category, question, verse_ref FROM questions WHERE source = 'AI_SOVEREIGN' ORDER BY created_at DESC LIMIT 15");
    console.table(res);
    process.exit(0);
}
verify();
