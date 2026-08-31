import { v7 as uuidv7 } from 'uuid';
import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../../.env') });


async function migrate() {
    console.log('🚀 Starting Phase 1 Migration: Foundation of Trust');
    
    const client = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'bible_quiz'
});
await client.connect();

    try {
        await client.query('BEGIN');

        // 1. Generate New Admin UUID (v7)
        const oldAdminId = 'admin_uuid_001';
        const newAdminId = uuidv7();
        console.log(`📦 Mapping Admin: ${oldAdminId} -> ${newAdminId}`);

        // 2. Prepare Users Table for Migration
        // Drop constraints first if any (Postgres automatically handles some, but we need to be careful with FKs)
        console.log('🛠️ Adding new_id column to users...');
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS new_id UUID');

        // 3. Populate new_id
        // For admin, use the generated v7. For others (if any), generate v7 too.
        await client.query(`
            UPDATE users SET new_id = $1 WHERE id = $2
        `, [newAdminId, oldAdminId]);
        
        // Handle other users just in case
        await client.query(`
            UPDATE users SET new_id = gen_random_uuid() WHERE new_id IS NULL
        `);

        // 4. Update Foreign Keys in all tables
        const tablesWithFk = [
            { table: 'user_achievements', col: 'user_id' },
            { table: 'coin_ledger', col: 'user_id' },
            { table: 'leaderboard', col: 'user_id' },
            { table: 'user_question_history', col: 'user_id' },
            { table: 'runs', col: 'user_id' },
            { table: 'devotional_notes', col: 'user_id' },
            { table: 'devotional_checkins', col: 'user_id' },
            { table: 'note_drafts', col: 'user_id' },
            { table: 'ai_usage_logs', col: 'user_id' },
            { table: 'user_ai_credit_wallet', col: 'user_id' },
            { table: 'ai_credit_ledger', col: 'user_id' },
            { table: 'expedition_teams', col: 'owner_id' },
            { table: 'expedition_team_members', col: 'user_id' },
            { table: 'expedition_saves', col: 'user_id' },
            { table: 'expedition_inventory', col: 'user_id' }
        ];

        for (const { table, col } of tablesWithFk) {
            console.log(`🔗 Migrating FK: ${table}.${col}...`);
            // Add temp column
            await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS new_${col} UUID`);
            // Update temp column based on users.new_id
            await client.query(`
                UPDATE ${table} t
                SET new_${col} = u.new_id
                FROM users u
                WHERE t.${col} = u.id
            `);
            // Drop old column and rename new one
            // Note: We might need to handle constraints here
            await client.query(`ALTER TABLE ${table} DROP COLUMN ${col} CASCADE`);
            await client.query(`ALTER TABLE ${table} RENAME COLUMN new_${col} TO ${col}`);
        }

        // 5. Finalize Users Table
        console.log('🏁 Finalizing users table...');
        await client.query('ALTER TABLE users DROP COLUMN id CASCADE');
        await client.query('ALTER TABLE users RENAME COLUMN new_id TO id');
        await client.query('ALTER TABLE users ADD PRIMARY KEY (id)');

        // 6. Apply Schema Refinement (Email, Status, timestamps)
        console.log('✨ Applying schema refinements...');
        await client.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS email VARCHAR(320) UNIQUE,
            ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
            ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS last_password_changed_at TIMESTAMP,
            ALTER COLUMN username SET NOT NULL,
            ALTER COLUMN username SET DATA TYPE VARCHAR(50)
        `);

        // 7. Create New Foundation Tables
        console.log('🆕 Creating new foundation tables...');
        
        // user_login_attempts
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_login_attempts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email_or_username VARCHAR(320) NOT NULL,
                ip_address INET,
                user_agent TEXT,
                is_success BOOLEAN NOT NULL,
                failure_reason VARCHAR(100),
                attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // password_reset_tokens
        await client.query(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                used_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                request_ip INET
            )
        `);

        // roles
        await client.query(`
            CREATE TABLE IF NOT EXISTS roles (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                role_code VARCHAR(50) UNIQUE NOT NULL,
                name_zh VARCHAR(100) NOT NULL,
                description TEXT,
                is_system BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // user_roles
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_roles (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
                granted_by UUID REFERENCES users(id),
                granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                revoked_by UUID REFERENCES users(id),
                revoked_at TIMESTAMP,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                UNIQUE(user_id, role_id)
            )
        `);

        // audit_logs
        await client.query(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                action_type VARCHAR(100) NOT NULL,
                target_type VARCHAR(100) NOT NULL,
                target_id VARCHAR(100),
                before_json JSONB,
                after_json JSONB,
                reason TEXT,
                correlation_id VARCHAR(100) NOT NULL,
                request_id VARCHAR(100),
                ip_address INET,
                user_agent TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // user_sessions (Refresh Tokens)
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                refresh_token_hash TEXT NOT NULL,
                device_name VARCHAR(100),
                ip_address INET,
                user_agent TEXT,
                expires_at TIMESTAMP NOT NULL,
                revoked_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_seen_at TIMESTAMP
            )
        `);

        // 8. Seed Default Roles
        console.log('🌱 Seeding default roles...');
        const roles = [
            ['super_admin', '最高管理員', '擁有全系統最高權限'],
            ['admin_ops', '營運管理員', '負責使用者與審計管理'],
            ['admin_content', '內容管理員', '負責經文與題庫管理'],
            ['admin_economy', '經濟管理員', '負責智幣與交易管理'],
            ['admin_ai', 'AI 治理員', '負責模型配置與成本管理'],
            ['admin_support', '客服管理員', '負責使用者支援與密碼重設']
        ];
        for (const [code, name, desc] of roles) {
            await client.query(`
                INSERT INTO roles (role_code, name_zh, description)
                VALUES ($1, $2, $3)
                ON CONFLICT (role_code) DO NOTHING
            `, [code, name, desc]);
        }

        // 9. Assign Super Admin role to the new admin user
        console.log('👑 Assigning Super Admin role...');
        await client.query(`
            INSERT INTO user_roles (user_id, role_id)
            SELECT u.id, r.id 
            FROM users u, roles r 
            WHERE u.username = 'admin' AND r.role_code = 'super_admin'
            ON CONFLICT DO NOTHING
        `);

        await client.query('COMMIT');
        console.log('✅ Migration COMPLETED Successfully!');
        console.log(`🔑 NEW ADMIN UUID: ${newAdminId}`);
        process.exit(0);
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Migration FAILED:', e);
        process.exit(1);
    } finally {
        await client.end();
    }
}

migrate();
