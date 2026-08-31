// Temporary script to reset admin password in running server
import { dbOps } from './database/index.js';
import bcrypt from 'bcryptjs';

async function resetAdminPassword() {
    try {
        const newPassword = 'admin888';
        const hash = await bcrypt.hash(newPassword, 10);

        console.log('Generated hash:', hash);

        // Update in memory database
        dbOps.usersDb.run('UPDATE users SET password_hash = ? WHERE username = ?', [hash, 'admin']);

        // Save to file
        dbOps.saveUsersDb();

        console.log('✅ Admin password reset to "admin888"');

        // Verify
        const stmt = dbOps.usersDb.prepare('SELECT password_hash FROM users WHERE username = ?');
        stmt.bind(['admin']);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            console.log('Stored hash:', row.password_hash);
            const isValid = await bcrypt.compare(newPassword, row.password_hash);
            console.log('Verification:', isValid ? '✅ Password matches' : '❌ Password mismatch');
        }
        stmt.free();

    } catch (error) {
        console.error('Error:', error);
    }
}

resetAdminPassword();
