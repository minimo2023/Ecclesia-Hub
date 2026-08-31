import { dbOps } from '../server/database/index.js';

/**
 * 提升使用者為 Super Admin (對標 v1.5 全角色)
 * 使用方式: node scripts/promote-admin.js [username]
 */
async function promoteAdmin() {
    const username = process.argv[2];
    
    if (!username) {
        console.error('❌ 請提供使用者名稱: node scripts/promote-admin.js <username>');
        process.exit(1);
    }

    try {
        console.log(`🔍 正在查找使用者: ${username}...`);
        
        // 取得使用者
        const user = await dbOps.db.prepare('SELECT id, username FROM users WHERE username = ?').get(username.toLowerCase());
        
        if (!user) {
            console.error(`❌ 找不到使用者: ${username}`);
            process.exit(1);
        }

        console.log(`✅ 找到使用者 ID: ${user.id}`);

        // v1.5 指定的 6 大管理角色
        const allRoles = [
            'super_admin',
            'admin_ops',
            'admin_content',
            'admin_economy',
            'admin_ai',
            'admin_support'
        ];

        // 更新權限 (PostgreSQL ARRAY 格式)
        // 注意: 這裡假設 dbOps.db 已經是封裝好的 PostgresAdapter 或 SQLite
        // 根據 schemas_pg.js，admin_roles 是 text[]
        const adminRolesSql = `{${allRoles.join(',')}}`;

        await dbOps.db.prepare(`
            UPDATE users 
            SET is_admin = true, 
                role = 'super_admin', 
                admin_roles = ? 
            WHERE id = ?
        `).run(adminRolesSql, user.id);

        console.log(`🚀 成功將 ${username} 提升為 Super Admin！`);
        console.log(`🔑 已授與角色: ${allRoles.join(', ')}`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ 執行失敗:', error);
        process.exit(1);
    }
}

promoteAdmin();
