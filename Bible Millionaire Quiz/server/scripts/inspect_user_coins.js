
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { dataRoot } from '../utils/paths.js';

async function inspectUser() {
    const dbPath = path.join(dataRoot, 'users.db');
    console.log(`🔍 Inspecting DB: ${dbPath}`);
    
    try {
        const db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        // 搜尋 Wayne / minimo2000
        const user = await db.get('SELECT * FROM users WHERE username = ? OR display_name LIKE ?', ['minimo2000', '%偉恩%']);
        
        if (user) {
            console.log('✅ User Found:');
            console.table(user);
            
            // 檢查金幣流水帳
            const ledger = await db.all('SELECT * FROM coin_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', [user.id]);
            console.log('\n📝 Recent Coin Ledger:');
            console.table(ledger);
        } else {
            console.log('❌ User not found in database.');
        }

        await db.close();
    } catch (err) {
        console.error('❌ DB Error:', err.message);
    }
}

inspectUser();
