import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import SecurityService from '../services/SecurityService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const client = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'bible_quiz'
});

async function repair() {
    console.log('🛠️ Administrative Repair Tool: Argon2 Upgrade');
    
    // Get password from command line argument
    const args = process.argv.slice(2);
    const newPassword = args[0];

    if (!newPassword) {
        console.error('❌ Error: Please provide a new password.');
        console.log('Usage: node server/cli/repair-admin.js "your_new_secure_password"');
        process.exit(1);
    }

    // Validate strength
    const validation = SecurityService.validatePasswordStrength(newPassword, { username: 'admin' });
    if (!validation.isValid) {
        console.error(`❌ Weak Password: ${validation.reason}`);
        process.exit(1);
    }

    console.log('🔐 Hashing new password with Argon2id...');
    const hash = await SecurityService.hashPassword(newPassword);

    try {
        await client.connect();
        
        // Find admin user
        const res = await client.query("SELECT id FROM users WHERE username = 'admin'");
        if (res.rows.length === 0) {
            console.error('❌ Error: Admin user not found in the database. Did the migration run?');
            process.exit(1);
        }

        const adminId = res.rows[0].id;
        console.log(`👤 Admin Found (UUID: ${adminId})`);

        // Update password hash and status
        await client.query(`
            UPDATE users 
            SET password_hash = $1, 
                status = 'active', 
                last_password_changed_at = CURRENT_TIMESTAMP 
            WHERE id = $2
        `, [hash, adminId]);

        console.log('✅ Admin password UPGRADED to Argon2id successfully!');
        console.log('🚀 You can now log in with your new password.');
        process.exit(0);
    } catch (e) {
        console.error('❌ Repair FAILED:', e);
        process.exit(1);
    } finally {
        await client.end();
    }
}

repair();
