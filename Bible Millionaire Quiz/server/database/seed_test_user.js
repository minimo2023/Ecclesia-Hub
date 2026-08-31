import { dbOps } from './index.js';
import SecurityService from '../services/SecurityService.js';
import crypto from 'crypto';

async function seedTestUser() {
    try {
        const username = 'test';
        const password = 'admin888';
        const question = '你最喜歡的聖經人物是？';
        const answer = '大衛';
        
        const existing = await dbOps.db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        
        const passwordHash = await SecurityService.hashPassword(password);
        const answerHash = await SecurityService.hashPassword(answer);
        
        if (existing) {
            await dbOps.db.run(
                'UPDATE users SET password_hash = ?, security_question = ?, security_answer_hash = ? WHERE username = ?',
                [passwordHash, question, answerHash, username]
            );
            console.log(`✅ Test user "${username}" updated.`);
        } else {
            const id = crypto.randomUUID();
            await dbOps.db.run(`
                INSERT INTO users (id, username, password_hash, display_name, role, security_question, security_answer_hash)
                VALUES (?, ?, ?, ?, 'user', ?, ?)
            `, [id, username, passwordHash, '測試員', question, answerHash]);
            console.log(`✅ Test user "${username}" created.`);
        }
        process.exit(0);
    } catch (e) {
        console.error('Seed test user failed:', e);
        process.exit(1);
    }
}

seedTestUser();
