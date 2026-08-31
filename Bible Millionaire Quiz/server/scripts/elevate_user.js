/**
 * Elevate User CLI (V3.0 Logos Voyager / Governor 360)
 * 作用：將現有的使用者提升為超級管理員，不採用硬編碼方式。
 * 
 * 使用方式: node server/scripts/elevate_user.js <username>
 */
import { PostgresAdapter } from '../database/adapters/postgres.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'dev',
    password: process.env.DB_PASSWORD || 'dev123',
    database: process.env.DB_NAME || 'bible_quiz_v3'
};

const username = process.argv[2];

if (!username) {
    console.error('❌ 請提供使用者名稱: node server/scripts/elevate_user.js <username>');
    process.exit(1);
}

async function elevate() {
    const db = new PostgresAdapter(config);
    try {
        await db.connect();
        
        // 1. 檢查使用者是否存在
        const user = await db.get('SELECT id, role FROM users WHERE username = $1', [username]);
        
        if (!user) {
            console.error(`❌ 找不到使用者: "${username}"。請先在系統註冊帳號。`);
            await db.close();
            return;
        }

        console.log(`🚀 正在將 "${username}" (${user.id}) 提升為超級管理員...`);

        // 2. 執行提權
        await db.run(`
            UPDATE users 
            SET role = 'super_admin', 
                admin_roles = $1, 
                is_admin = TRUE, 
                status = 'active'
            WHERE username = $2
        `, [JSON.stringify(['super_admin']), username]);

        console.log(`✅ 成功！"${username}" 現在具備超級管理員權限。`);
        
    } catch (e) {
        console.error('❌ 提權失敗:', e.message);
    } finally {
        await db.close();
    }
}

elevate();
