import { ContentManager } from '../server/services/ContentManager.js';
import SecurityService from '../server/services/SecurityService.js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
    try {
        await ContentManager.initialize();
        const db = ContentManager.getDb();
        
        const username = 'minimo2000';
        const newPassword = 'admin123'; // 臨時密碼
        
        console.log(`🚀 Resetting password for ${username}...`);
        
        const passwordHash = await SecurityService.hashPassword(newPassword);
        
        const result = await db.run('UPDATE users SET password_hash = ? WHERE username = ?', [passwordHash, username]);
        
        if (result.changes > 0) {
            console.log(`✅ Success! User ${username} password has been reset to: ${newPassword}`);
        } else {
            console.log(`❌ Failed: User ${username} not found.`);
        }

    } catch (e) {
        console.error('❌ Reset Failed:', e);
    } finally {
        process.exit(0);
    }
}

run();
