/**
 * PostgreSQL Database Schemas
 * Adapted from schemas.js for PostgreSQL 15+
 */

/**
 * 建立使用者資料表 (PostgreSQL)
 */
export async function createUsersTables(db) {
    // Users table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT,
            is_admin BOOLEAN DEFAULT FALSE,
            role TEXT DEFAULT 'user',
            admin_roles JSONB DEFAULT '[]', -- For granular management
            status TEXT DEFAULT 'active', -- For management workflow
            coins INTEGER DEFAULT 0,
            total_games INTEGER DEFAULT 0,
            total_correct INTEGER DEFAULT 0,
            total_answered INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP,
            last_active_at TIMESTAMP,
            settings JSONB,
            metadata JSONB,
            avatar_url TEXT,
            gender TEXT,
            birth_year INTEGER,
            bio TEXT,
            security_question TEXT,
            security_answer_hash TEXT,
            last_password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_display_name_change TIMESTAMP,
            must_reset_auth BOOLEAN DEFAULT FALSE,
            pwd_warning_dismissed_count INTEGER DEFAULT 0,
            last_warning_dismissed_at TIMESTAMP
        );

        -- [MIGRATION] Ensure missing security tracking columns exist
        ALTER TABLE users ADD COLUMN IF NOT EXISTS pwd_warning_dismissed_count INTEGER DEFAULT 0;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_warning_dismissed_at TIMESTAMP;
    `);

    // Achievements definitions
    await db.exec(`
        CREATE TABLE IF NOT EXISTS achievements (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            icon TEXT,
            type TEXT,
            category TEXT,
            condition_type TEXT,
            condition_value INTEGER,
            sort_order INTEGER,
            coin_reward INTEGER DEFAULT 0
        );
    `);

    // User Achievement Unlocks
    await db.exec(`
        CREATE TABLE IF NOT EXISTS user_achievements (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
            unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, achievement_id)
        );
        CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
    `);

    // Coin Ledger
    await db.exec(`
        CREATE TABLE IF NOT EXISTS coin_ledger (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            amount INTEGER NOT NULL,
            reason TEXT,
            balance_after INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_coin_ledger_user ON coin_ledger(user_id);
    `);

    await db.exec(`
        SELECT setval(
            pg_get_serial_sequence('coin_ledger', 'id'),
            GREATEST(COALESCE((SELECT MAX(id) FROM coin_ledger), 0), 1),
            true
        );
    `);
}

/**
 * 建立安全性與基礎架構資料表 (PostgreSQL)
 * 包含登入嘗試、Session、權限角色等
 */
export async function createSecurityTables(db) {
    // 1. user_login_attempts
    await db.exec(`
        CREATE TABLE IF NOT EXISTS user_login_attempts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email_or_username VARCHAR(320) NOT NULL,
            ip_address INET,
            user_agent TEXT,
            is_success BOOLEAN NOT NULL,
            failure_reason VARCHAR(100),
            attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_login_attempts_target ON user_login_attempts(email_or_username);
    `);

    // 2. password_reset_tokens
    await db.exec(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            request_ip INET
        );
    `);

    // 3. roles
    await db.exec(`
        CREATE TABLE IF NOT EXISTS roles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            role_code VARCHAR(50) UNIQUE NOT NULL,
            name_zh VARCHAR(100) NOT NULL,
            description TEXT,
            is_system BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 4. user_roles
    await db.exec(`
        CREATE TABLE IF NOT EXISTS user_roles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            granted_by TEXT REFERENCES users(id),
            granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            revoked_by TEXT REFERENCES users(id),
            revoked_at TIMESTAMP,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            UNIQUE(user_id, role_id)
        );
    `);

    // 5. user_sessions (Refresh Tokens)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS user_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            refresh_token_hash TEXT NOT NULL,
            device_name VARCHAR(100),
            ip_address INET,
            user_agent TEXT,
            expires_at TIMESTAMP NOT NULL,
            revoked_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_at TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
    `);

    // 6. Seed Default Roles if empty
    try {
        const rolesCount = await db.get('SELECT COUNT(*) as count FROM roles');
        if (parseInt(rolesCount.count) === 0) {
            const roles = [
                ['super_admin', '最高管理員', '擁有全系統最高權限'],
                ['admin_ops', '營運管理員', '負責使用者與審計管理'],
                ['admin_content', '內容管理員', '負責經文與題庫管理'],
                ['admin_economy', '經濟管理員', '負責智幣與交易管理'],
                ['admin_ai', 'AI 治理員', '負責模型配置與成本管理'],
                ['admin_support', '客服管理員', '負責使用者支援與密碼重設']
            ];
            for (const [code, name, desc] of roles) {
                await db.run(`
                    INSERT INTO roles (role_code, name_zh, description)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (role_code) DO NOTHING
                `, [code, name, desc]);
            }
            console.log('🌱 Seeded default system roles');
        }
    } catch (e) {
        console.error('Error seeding roles:', e.message);
    }
}

/**
 * 建立內容資料表 (PostgreSQL)
 */
export async function createContentTables(db) {
    // Bible verses
    await db.exec(`
        CREATE TABLE IF NOT EXISTS bible_verses (
            id TEXT PRIMARY KEY,
            version TEXT,
            book TEXT,
            book_name TEXT,
            chapter INTEGER,
            verse INTEGER,
            text TEXT,
            source TEXT,
            metadata JSONB,
            cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(version, book, chapter, verse)
        );
        CREATE INDEX IF NOT EXISTS idx_verse_ref ON bible_verses(book, chapter, verse);
        CREATE INDEX IF NOT EXISTS idx_verse_version ON bible_verses(version, book);
    `);

    // Bible Books
    await db.exec(`
        CREATE TABLE IF NOT EXISTS bible_books (
            id TEXT PRIMARY KEY,
            name_zh TEXT,
            name_en TEXT,
            testament TEXT,
            category TEXT,
            chapters INTEGER,
            order_num INTEGER,
            metadata JSONB DEFAULT '{}'
        );
    `);

    // Unified Leaderboard (Consolidated from content/games)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS leaderboard (
            id TEXT PRIMARY KEY, -- Unique performance record ID
            user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
            name TEXT, -- Display name recorded at time of win
            score INTEGER DEFAULT 0,
            total_score INTEGER DEFAULT 0,
            games_played INTEGER DEFAULT 0,
            high_score INTEGER DEFAULT 0,
            is_victory BOOLEAN DEFAULT FALSE,
            mode TEXT DEFAULT 'general',
            game_mode TEXT DEFAULT 'general',
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            timestamp BIGINT,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_leaderboard_user ON leaderboard(user_id);
        CREATE INDEX IF NOT EXISTS idx_leaderboard_score_pg ON leaderboard(score DESC);
        CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(high_score DESC);
        CREATE INDEX IF NOT EXISTS idx_leaderboard_total ON leaderboard(total_score DESC);
    `);

    // Infinite Challenge Leaderboard
    await db.exec(`
        CREATE TABLE IF NOT EXISTS infinite_leaderboard (
            user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            level INTEGER DEFAULT 0,
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            timestamp BIGINT
        );
        CREATE INDEX IF NOT EXISTS idx_infinite_leaderboard_level ON infinite_leaderboard(level DESC);
    `);

    // Unified Questions (The "Ultimate" Question Bank - merging 25+ columns)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS questions (
            id TEXT PRIMARY KEY,
            difficulty TEXT DEFAULT 'MEDIUM',
            book TEXT,
            chapter INTEGER,
            verse_start INTEGER,
            verse_end INTEGER,
            verse_ref TEXT,
            version TEXT DEFAULT 'CUV_TRAD', -- 新增此欄位以支援多譯本
            question TEXT NOT NULL, -- question_text 改為 question
            options JSONB NOT NULL, -- Array of strings
            answer TEXT NOT NULL,   -- correct_answer 改為 answer
            correct_index INTEGER,
            explanation TEXT,
            evidence TEXT,
            evidence_ref TEXT,
            evidence_quote TEXT,
            source TEXT DEFAULT 'ai',
            status TEXT DEFAULT 'PASS', -- 已通過驗證的狀態
            quality TEXT,               -- 品質標籤 (flagged, disabled)
            category TEXT,               -- 題型核心標籤 (verse_fill, person, etc.)
            tags JSONB DEFAULT '[]',
            verified BOOLEAN DEFAULT FALSE,
            hash_exact TEXT UNIQUE,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_questions_ref ON questions(book, chapter);
        CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category);
        CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty);

        -- [MIGRATION] Ensure Phase 2/3 Category-Sovereign columns exist
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS question TEXT NOT NULL DEFAULT '';
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS answer TEXT NOT NULL DEFAULT '';
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS chapter INTEGER;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS verse_ref TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS category TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS evidence TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS correct_index INTEGER;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PASS';
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS quality TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS version TEXT DEFAULT 'CUV_TRAD';
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS audit_reason TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS auditor_version TEXT;
        ALTER TABLE questions ALTER COLUMN options DROP NOT NULL;

        -- [MIGRATION] Add Difficulty Scoring Columns
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS rule_difficulty_score INTEGER;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_band VARCHAR(20);
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_flags JSONB;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_breakdown JSONB;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_score_source VARCHAR(50);
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_scored_at TIMESTAMP;
        
        -- [MIGRATION] Add AI Judge & Final Score Columns
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS judge_prompt_version TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS judge_roles JSONB;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_judge_a_score INTEGER;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_judge_a_role TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_judge_b_score INTEGER;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_judge_b_role TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_judge_avg INTEGER;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_judge_delta INTEGER;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS rule_ai_delta INTEGER;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_consistency TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS rule_validity TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS final_difficulty_score INTEGER;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS final_difficulty_source TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS final_difficulty_confidence REAL;
    `);

    // Resources (詮釋資源)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS resources (
            id TEXT PRIMARY KEY,
            title TEXT,
            filename TEXT,
            file_path TEXT,
            file_type TEXT,
            file_size INTEGER,
            metadata JSONB DEFAULT '{}',
            processed BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            source TEXT
        );
    `);

    // Extracted Text (資源內容)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS extracted_text (
            id TEXT PRIMARY KEY,
            resource_id TEXT REFERENCES resources(id) ON DELETE CASCADE,
            content TEXT,
            word_count INTEGER,
            is_important BOOLEAN DEFAULT FALSE,
            importance_score DOUBLE PRECISION,
            estimated_read_time INTEGER,
            metadata JSONB DEFAULT '{}',
            extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_extracted_res ON extracted_text(resource_id);
    `);

    // Locations (地理資訊)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS locations (
            id TEXT PRIMARY KEY,
            code TEXT,
            name_zh TEXT, -- [ALIGNMENT] 標準化命名
            name_en TEXT,
            modern_name TEXT, -- 現代表名
            type TEXT,
            book TEXT, -- [ALIGNMENT] 支援快速檢索
            chapter INTEGER, -- [ALIGNMENT] 支援快速檢索
            lat DOUBLE PRECISION,
            lon DOUBLE PRECISION,
            meaning TEXT, -- [SOVEREIGNTY] 地名含義
            description TEXT, -- [SOVEREIGNTY] 歷史考古說明
            entities JSONB DEFAULT '[]', -- [SOVEREIGNTY] 人物與事件標籤
            verse_refs TEXT, -- [SOVEREIGNTY] 經文索引文本
            metadata JSONB DEFAULT '{}',
            image_path TEXT, -- 本地存儲相對路徑
            source TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            processed BOOLEAN DEFAULT FALSE
        );

        -- [MIGRATION] Phase 4.0 Geography Rebirth Upgrades
        DO $$ 
        BEGIN 
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='locations' AND column_name='name_ch') THEN
                ALTER TABLE locations RENAME COLUMN name_ch TO name_zh;
            END IF;
        END $$;
        ALTER TABLE locations ADD COLUMN IF NOT EXISTS name_en TEXT;
        ALTER TABLE locations ADD COLUMN IF NOT EXISTS meaning TEXT;
        ALTER TABLE locations ADD COLUMN IF NOT EXISTS description TEXT;
        ALTER TABLE locations ADD COLUMN IF NOT EXISTS entities JSONB DEFAULT '[]';
        ALTER TABLE locations ADD COLUMN IF NOT EXISTS verse_refs TEXT;
        ALTER TABLE locations ADD COLUMN IF NOT EXISTS modern_name TEXT;
        ALTER TABLE locations ADD COLUMN IF NOT EXISTS image_path TEXT;
        ALTER TABLE locations ADD COLUMN IF NOT EXISTS book TEXT;
        ALTER TABLE locations ADD COLUMN IF NOT EXISTS chapter INTEGER;
    `);

    // Verse Locations (經文與地理關聯)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS verse_locations (
            id SERIAL PRIMARY KEY,
            book TEXT NOT NULL,
            chapter INTEGER NOT NULL,
            verse INTEGER,
            location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
            source TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_verse_loc_ref ON verse_locations(book, chapter, verse);
        CREATE INDEX IF NOT EXISTS idx_verse_loc_id ON verse_locations(location_id);
    `);

    // Map Sheets (聖經地圖位圖與整合說明) - Phase 5.0 [SOVEREIGNTY]
    await db.exec(`
        CREATE TABLE IF NOT EXISTS maps (
            gid TEXT PRIMARY KEY, -- FHL GID 編號 (如 024)
            title TEXT, -- 地圖標題 (如 撒瑪利亞、多坍)
            image_local TEXT, -- 本地存儲相對路徑 (public/assets/maps/024.gif)
            narrative TEXT, -- [CRITICAL] 這就是地圖下方的整合說明與地點順序解說
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Location-Map Mapping (多對多關聯)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS location_maps (
            location_id TEXT REFERENCES locations(id) ON DELETE CASCADE,
            map_id TEXT REFERENCES maps(gid) ON DELETE CASCADE,
            PRIMARY KEY (location_id, map_id)
        );
        CREATE INDEX IF NOT EXISTS idx_loc_map_id ON location_maps(map_id);
    `);

    // User Question History
    await db.exec(`
        CREATE TABLE IF NOT EXISTS user_question_history (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
            answered_correctly BOOLEAN NOT NULL,
            answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, question_id)
        );
        CREATE INDEX IF NOT EXISTS idx_user_q_history_user ON user_question_history(user_id);
    `);

    await db.exec(`
        SELECT setval(
            pg_get_serial_sequence('user_question_history', 'id'),
            GREATEST(COALESCE((SELECT MAX(id) FROM user_question_history), 0), 1),
            true
        );
    `);

    // Question Reports
    await db.exec(`
        CREATE TABLE IF NOT EXISTS question_reports (
            id TEXT PRIMARY KEY,
            question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
            report_type TEXT,
            message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Game Runs
    await db.exec(`
        CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY,
            user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
            session_id TEXT,
            mode TEXT,
            selection TEXT,
            result_level INTEGER,
            title TEXT,
            lifelines_used JSONB,
            coins_earned INTEGER,
            duration_ms INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_runs_user ON runs(user_id);
    `);

    // Chapter Locks
    await db.exec(`
        CREATE TABLE IF NOT EXISTS chapter_locks (
            id TEXT PRIMARY KEY,
            book TEXT NOT NULL,
            chapter INTEGER NOT NULL,
            reason TEXT,
            auditor_version TEXT,
            locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(book, chapter)
        );
    `);


    // API Cache
    await db.exec(`
        CREATE TABLE IF NOT EXISTS api_cache (
            cache_key TEXT PRIMARY KEY,
            api_source TEXT,
            endpoint TEXT,
            response TEXT,
            expires_at TIMESTAMP,
            cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            hit_count INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_cache_source ON api_cache(api_source);
        CREATE INDEX IF NOT EXISTS idx_cache_expires ON api_cache(expires_at);
    `);

    // AI Summaries
    await db.exec(`
        CREATE TABLE IF NOT EXISTS ai_summaries (
            book TEXT NOT NULL,
            chapter INTEGER NOT NULL,
            version TEXT DEFAULT 'unv',
            summary_json JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            model_used TEXT,
            PRIMARY KEY (book, chapter, version)
        );
    `);


    // Generic Collections
    await db.exec(`
        CREATE TABLE IF NOT EXISTS collections (
            collection_name TEXT NOT NULL,
            doc_id TEXT NOT NULL,
            data JSONB NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (collection_name, doc_id)
        );
        CREATE INDEX IF NOT EXISTS idx_collection_name ON collections(collection_name);
    `);

    // Commentaries
    await db.exec(`
        CREATE TABLE IF NOT EXISTS commentaries (
            id TEXT PRIMARY KEY,
            book TEXT NOT NULL,
            title TEXT,
            content TEXT,
            source_path TEXT,
            category TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_commentary_book ON commentaries(book);
    `);

    // Categories
    await db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            series INTEGER,
            series_name TEXT,
            parent_id TEXT,
            sort_order INTEGER,
            description TEXT
        );
    `);

    // Tags
    await db.exec(`
        CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'general',
            description TEXT,
            parent_id TEXT,
            UNIQUE(name)
        );
    `);

    // Resource Tags (Relationship)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS resource_tags (
            resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
            tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (resource_id, tag_id)
        );
    `);

    // Resource Verses (Relationship)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS resource_verses (
            id TEXT PRIMARY KEY,
            resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
            book TEXT NOT NULL,
            chapter_start INTEGER,
            verse_start INTEGER,
            chapter_end INTEGER,
            verse_end INTEGER,
            confidence REAL DEFAULT 1.0,
            source TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_res_verse_lookup ON resource_verses(book, chapter_start);
    `);


    // SNH Definitions (Strong's Number 辭典)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS snh_definitions (
            id TEXT PRIMARY KEY, -- 例如 'H7225', 'G2424'
            sn_type INTEGER, -- 1 為希伯來文 (OT), 0 為希臘文 (NT)
            sn_number INTEGER, -- 7225
            original_word TEXT,
            pronunciation TEXT,
            definition TEXT,
            extended_info JSONB, -- 存儲來自 sd.php 的完整 JSON
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_snh_type_num ON snh_definitions(sn_type, sn_number);
    `);

    // Bible Objects (聖經物件百科 - Animals, Plants, Items)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS bible_objects (
            id TEXT PRIMARY KEY, -- 例如 'FHL_OBJ_0_1'
            category TEXT, -- 'animal', 'plant', 'item'
            name_zh TEXT,
            name_en TEXT,
            description TEXT,
            image_url TEXT, -- 原始遠端圖片 URL
            image_path TEXT, -- 本地存儲相對路徑
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_bible_obj_cat ON bible_objects(category);
    `);

    // Lexicons (聖經百科辭典 - Animals, Plants, Objects from Mar Library)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS lexicons (
            id SERIAL PRIMARY KEY,
            category INTEGER, -- 0:動物, 1:植物, 2:物件
            key_id TEXT, -- FHL 原始編號 (如 1.1.1)
            name_zh TEXT NOT NULL,
            name_en TEXT,
            description TEXT, -- [主體] 百科本體定義 (整理後)
            discussion TEXT, -- [深度] 歷史、考古與學術討論 (整理後)
            symbolism TEXT, -- [神藝] 神學與象徵意義 (整理後)
            translation_notes TEXT, -- [校勘] 原文翻譯與註解 (整理後)
            content_raw TEXT, -- [存根] 原始內容備選 (去連結版)
            content_ai TEXT, -- [AI 辨識] 精換後的百科解說
            quiz_pool JSONB DEFAULT '[]', -- [AI 預生成] 專屬題庫庫
            image_local TEXT, -- 本地影像路徑 (public/assets/lexicon/...)
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(category, key_id)
        );
        CREATE INDEX IF NOT EXISTS idx_lexicon_cat_key ON lexicons(category, key_id);
    `);
}


/**
 * 建立靈修筆記資料表 (PostgreSQL)
 */
export async function createNotesTables(db) {
    // User devotional notes (date-based)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS devotional_notes (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            date TEXT NOT NULL,
            note TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, date)
        );
        CREATE INDEX IF NOT EXISTS idx_notes_user ON devotional_notes(user_id);
        CREATE INDEX IF NOT EXISTS idx_notes_date ON devotional_notes(date);
    `);

    // Devotional Checkins (Daily check-in tracking)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS devotional_checkins (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            date TEXT NOT NULL,
            checked_in_at TIMESTAMP,
            coins_awarded INTEGER DEFAULT 0,
            read_at TIMESTAMP,
            read_coins_awarded INTEGER DEFAULT 0,
            wrote_note_at TIMESTAMP,
            note_coins_awarded INTEGER DEFAULT 0,
            UNIQUE(user_id, date)
        );
        CREATE INDEX IF NOT EXISTS idx_checkins_user ON devotional_checkins(user_id);
        CREATE INDEX IF NOT EXISTS idx_checkins_date ON devotional_checkins(date);
    `);

    // Daily Devotionals (AI-generated daily content)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS daily_devotionals (
            date TEXT PRIMARY KEY,
            content JSONB,
            metadata JSONB,
            generated_at BIGINT
        );
    `);

    // Devotional Stats (Track book usage)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS devotional_stats (
            book TEXT PRIMARY KEY,
            last_used_date TEXT,
            use_count INTEGER DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Devotional Generation Queue (Task tracking for robust scheduling)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS devotional_generation_queue (
            id SERIAL PRIMARY KEY,
            target_date TEXT NOT NULL UNIQUE,
            status TEXT DEFAULT 'pending',
            attempts INTEGER DEFAULT 0,
            last_error TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_queue_status ON devotional_generation_queue(status);
        CREATE INDEX IF NOT EXISTS idx_queue_date ON devotional_generation_queue(target_date);
    `);

    // Liturgical Calendar (Dynamic holiday detection - Phase 3)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS liturgical_calendar (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            "nameEn" TEXT,
            name_en TEXT, -- 保留向後相容
            theme TEXT NOT NULL,
            "calculationType" TEXT NOT NULL,
            calculation_type TEXT, -- 保留向後相容
            "fixedMonth" INTEGER,
            fixed_month INTEGER, -- 保留向後相容
            "fixedDay" INTEGER,
            fixed_day INTEGER, -- 保留向後相容
            "floatingRule" JSONB,
            floating_rule JSONB, -- 保留向後相容
            priority INTEGER DEFAULT 50,
            "suggestedBooks" TEXT,
            suggested_books TEXT, -- 保留向後相容
            active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_liturgical_active ON liturgical_calendar(active);
        CREATE INDEX IF NOT EXISTS idx_liturgical_priority ON liturgical_calendar(priority DESC);

        -- [MIGRATION] Ensure missing Suggested Books and other camelCase columns exist for notes.js
        ALTER TABLE liturgical_calendar ADD COLUMN IF NOT EXISTS "nameEn" TEXT;
        ALTER TABLE liturgical_calendar ADD COLUMN IF NOT EXISTS "calculationType" TEXT;
        ALTER TABLE liturgical_calendar ADD COLUMN IF NOT EXISTS "fixedMonth" INTEGER;
        ALTER TABLE liturgical_calendar ADD COLUMN IF NOT EXISTS "fixedDay" INTEGER;
        ALTER TABLE liturgical_calendar ADD COLUMN IF NOT EXISTS "floatingRule" JSONB;
        ALTER TABLE liturgical_calendar ADD COLUMN IF NOT EXISTS "suggestedBooks" TEXT;
    `);

    // Devotional Authors (Phase 4: Dynamic author pool)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS devotional_authors (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            "styleId" TEXT,
            style_id TEXT, -- 保留向後相容
            bio TEXT,
            avatar_url TEXT,
            active BOOLEAN DEFAULT true,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(name, "styleId")
        );
        CREATE INDEX IF NOT EXISTS idx_authors_style ON devotional_authors("styleId", active);

        -- [MIGRATION] Ensure missing styleId column exists
        ALTER TABLE devotional_authors ADD COLUMN IF NOT EXISTS "styleId" TEXT;
    `);

    // Note Drafts (User draft storage)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS note_drafts (
            user_id TEXT NOT NULL,
            date TEXT NOT NULL,
            content TEXT,
            updated_at BIGINT,
            PRIMARY KEY (user_id, date)
        );
    `);
}

/**
 * AI 成本治理資料表 (v1.5) - LEGACY
 */
export async function createAIGovernanceTables_legacy(db) {
    // AI Model Configuration & Pricing
    await db.exec(`
        CREATE TABLE IF NOT EXISTS ai_model_config (
            model_id TEXT PRIMARY KEY,
            friendly_name TEXT NOT NULL,
            input_price_per_1k_points NUMERIC DEFAULT 1.0, 
            output_price_per_1k_points NUMERIC DEFAULT 2.0,
            is_active BOOLEAN DEFAULT TRUE,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // AI Usage Logs for Audit & Stats
    await db.exec(`
        CREATE TABLE IF NOT EXISTS ai_usage_logs (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            model_id TEXT NOT NULL,
            tokens_prompt INTEGER DEFAULT 0,
            tokens_completion INTEGER DEFAULT 0,
            cost_points NUMERIC DEFAULT 0,
            correlation_id TEXT,
            metadata JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_ai_usage_model ON ai_usage_logs(model_id);
        CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_logs(created_at);
    `);

    // Seed default models if not exists
    const modelsCount = await db.get('SELECT COUNT(*) as count FROM ai_model_config');
    if (modelsCount.count === 0) {
        await db.exec(`
            INSERT INTO ai_model_config (model_id, friendly_name, input_price_per_1k_points, output_price_per_1k_points)
            VALUES 
            ('gpt-3.5-turbo', 'GPT-3.5 Turbo', 1.0, 2.0),
            ('gpt-4o', 'GPT-4o (Standard)', 5.0, 15.0),
            ('gpt-4o-mini', 'GPT-4o Mini', 0.15, 0.60),
            ('claude-3-opus', 'Claude 3 Opus', 15.0, 75.0),
            ('claude-3-sonnet', 'Claude 3 Sonnet', 3.0, 15.0);
        `);
    }
}

/**
 * 建立遊戲資料表 (PostgreSQL)
 */
export async function createGamesTables(db) {
    // Game History
    await db.exec(`
        CREATE TABLE IF NOT EXISTS game_history (
            id SERIAL PRIMARY KEY,
            user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            mode TEXT NOT NULL,
            score INTEGER NOT NULL,
            questions_answered INTEGER,
            correct_count INTEGER,
            time_elapsed INTEGER,
            completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            metadata JSONB
        );
        CREATE INDEX IF NOT EXISTS idx_game_history_user ON game_history(user_id);
    `);

    // Attempts (Question Answering Log)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS attempts (
            id SERIAL PRIMARY KEY,
            questionId TEXT,
            isCorrect BOOLEAN,
            level TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            clientTimestamp BIGINT
        );
        CREATE INDEX IF NOT EXISTS idx_attempts_qid ON attempts(questionId);
    `);

    // Note: questions and leaderboard are now unified in createContentTables
}

/**
 * 建立遠征隊資料表 (PostgreSQL)
 */
export async function createExpeditionTables(db) {
    // Expedition Teams
    await db.exec(`
        CREATE TABLE IF NOT EXISTS expedition_teams (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            owner_id TEXT, -- UUID
            owner_name TEXT NOT NULL,
            current_question INTEGER DEFAULT 0,
            current_stage INTEGER DEFAULT 1,
            lives INTEGER DEFAULT 3,
            score INTEGER DEFAULT 0,
            status TEXT DEFAULT 'waiting', -- waiting/playing/paused/ended
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_exp_teams_owner ON expedition_teams(owner_id);
        CREATE INDEX IF NOT EXISTS idx_exp_teams_status ON expedition_teams(status);

        -- [MIGRATION] Ensure columns from newer schema versions exist
        ALTER TABLE expedition_teams ADD COLUMN IF NOT EXISTS owner_name TEXT DEFAULT '';
        ALTER TABLE expedition_teams ADD COLUMN IF NOT EXISTS lives INTEGER DEFAULT 3;
        ALTER TABLE expedition_teams ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    // Expedition Team Members
    await db.exec(`
        CREATE TABLE IF NOT EXISTS expedition_team_members (
            team_id TEXT NOT NULL REFERENCES expedition_teams(id) ON DELETE CASCADE,
            user_id TEXT, -- NULL = Guest
            display_name TEXT NOT NULL,
            is_owner BOOLEAN DEFAULT FALSE,
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (team_id, display_name) -- Composite key (One display name per team)
        );
        CREATE INDEX IF NOT EXISTS idx_exp_members_user ON expedition_team_members(user_id);
    `);

    // Expedition Saves (Captain Centric - Checkpoint)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS expedition_saves (
            user_id TEXT PRIMARY KEY, -- Captain ID
            save_data JSONB, -- Stores stage, question, lives, timestamp
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- [MIGRATION] Ensure created_at exists for older databases
        ALTER TABLE expedition_saves ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    // Expedition Inventory (Player Bound)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS expedition_inventory (
            user_id TEXT,
            item_id TEXT,
            quantity INTEGER DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, item_id)
        );
        CREATE INDEX IF NOT EXISTS idx_expedition_inv_user ON expedition_inventory(user_id);
    `);

    // Expedition Questions (V2 Specific Pool)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS expedition_questions (
            id SERIAL PRIMARY KEY,
            question TEXT NOT NULL,
            options JSONB NOT NULL, -- Fixed 6 options
            correct_index INTEGER NOT NULL,
            difficulty INTEGER DEFAULT 1,
            question_type TEXT DEFAULT 'choice',
            source_verse TEXT,
            evidence TEXT,
            explanation TEXT,
            source TEXT DEFAULT 'ai_generated',
            times_used INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_exp_questions_diff ON expedition_questions(difficulty);
    `);

    // Expedition Answered Log
    await db.exec(`
        CREATE TABLE IF NOT EXISTS expedition_answered (
            team_id TEXT NOT NULL REFERENCES expedition_teams(id) ON DELETE CASCADE,
            question_id INTEGER NOT NULL REFERENCES expedition_questions(id) ON DELETE CASCADE,
            answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_correct BOOLEAN,
            PRIMARY KEY (team_id, question_id)
        );
    `);

    // Expedition Leaderboard (Team/Captain Ranking)
    // ranking based on: max_stage DESC, total_questions DESC
    await db.exec(`
        CREATE TABLE IF NOT EXISTS expedition_leaderboard (
            id TEXT PRIMARY KEY, -- Usually Captain ID or Team Session ID
            captain_id TEXT,
            captain_name TEXT,
            max_stage INTEGER,
            total_questions INTEGER, -- Tie breaker
            team_members JSONB, -- JSON array of names for display
            achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_exp_leaderboard_stage ON expedition_leaderboard(max_stage DESC, total_questions DESC);
    `);

    // Expedition Config (Dynamic Settings)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS expedition_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            description TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Expedition Records (Game History)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS expedition_records (
            id SERIAL PRIMARY KEY,
            team_id TEXT NOT NULL REFERENCES expedition_teams(id) ON DELETE CASCADE,
            stage INTEGER,
            result TEXT,
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

// ==========================================
// [V3] AI Governance & Economic Sovereignty (Physical Segregation)
// ==========================================

/**
 * AI 用量監測與 1000 元台幣預算看門狗 (Isolated)
 */
export async function createAIGovernanceTables(db) {
    console.log('🏛️ [Database] Ensuring ai_gov Schema...');
    await db.exec('CREATE SCHEMA IF NOT EXISTS ai_gov;');

    await db.exec(`
        CREATE TABLE IF NOT EXISTS ai_gov.ai_usage_logs (
            id SERIAL PRIMARY KEY,
            user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            module_name TEXT NOT NULL,
            prompt_tokens INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0,
            total_cost_twd DECIMAL(10, 5) DEFAULT 0,
            correlation_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_ai_usage_module ON ai_gov.ai_usage_logs(module_name);
        CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_gov.ai_usage_logs(user_id);

        -- AI Model Config (Rates & Status)
        CREATE TABLE IF NOT EXISTS ai_gov.ai_model_config (
            model_id TEXT PRIMARY KEY,
            friendly_name TEXT,
            input_price_per_1k_points DECIMAL(10, 5) DEFAULT 0,
            output_price_per_1k_points DECIMAL(10, 5) DEFAULT 0,
            is_active BOOLEAN DEFAULT TRUE,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- AI System Config (Budgets & Offsets)
        CREATE TABLE IF NOT EXISTS ai_gov.ai_system_config (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Seed initial budget data
        INSERT INTO ai_gov.ai_system_config (key, value) VALUES ('budget_limit_twd', '1000') ON CONFLICT DO NOTHING;
        INSERT INTO ai_gov.ai_system_config (key, value) VALUES ('initial_spent_offset_twd', '0') ON CONFLICT DO NOTHING;
    `);

    // Seed default models if not exists in ai_gov schema
    const modelsCount = await db.get('SELECT COUNT(*) as count FROM ai_gov.ai_model_config');
    if (parseInt(modelsCount.count) === 0) {
        await db.exec(`
            INSERT INTO ai_gov.ai_model_config (model_id, friendly_name, input_price_per_1k_points, output_price_per_1k_points)
            VALUES 
            ('gpt-3.5-turbo', 'GPT-3.5 Turbo', 1.0, 2.0),
            ('gpt-4o', 'GPT-4o (Standard)', 5.0, 15.0),
            ('gpt-4o-mini', 'GPT-4o Mini', 0.15, 0.60),
            ('claude-3-opus', 'Claude 3 Opus', 15.0, 75.0),
            ('claude-3-sonnet', 'Claude 3 Sonnet', 3.0, 15.0);
        `);
    }
}

/**
 * AI 點數錢包與帳本 (Isolated)
 */
export async function createAICreditTables(db) {
    await db.exec('CREATE SCHEMA IF NOT EXISTS ai_gov;');

    // AI Credit Wallet
    await db.exec(`
        CREATE TABLE IF NOT EXISTS ai_gov.user_ai_credit_wallet (
            user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            bonus_ai_credits INTEGER NOT NULL DEFAULT 0,
            exchange_ai_credits INTEGER NOT NULL DEFAULT 0,
            paid_ai_credits INTEGER NOT NULL DEFAULT 0,
            last_daily_grant_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // AI Credit Ledger
    await db.exec(`
        CREATE TABLE IF NOT EXISTS ai_gov.ai_credit_ledger (
            id SERIAL PRIMARY KEY,
            user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
            amount INTEGER NOT NULL,
            credit_pool TEXT NOT NULL,
            reason TEXT,
            balance_after INTEGER NOT NULL,
            total_balance_after INTEGER,
            correlation_id TEXT,
            related_module TEXT,
            metadata JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_ai_ledger_user ON ai_gov.ai_credit_ledger(user_id);
    `);
}

/**
 * 會員方案資料表 (PostgreSQL - Isolated)
 */
export async function createMembershipTables(db) {
    await db.exec('CREATE SCHEMA IF NOT EXISTS ai_gov;');

    await db.exec(`
        CREATE TABLE IF NOT EXISTS ai_gov.user_memberships (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            tier TEXT NOT NULL DEFAULT 'free',
            status TEXT NOT NULL DEFAULT 'active',
            valid_until TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_active_unique_v3
        ON ai_gov.user_memberships(user_id)
        WHERE status = 'active';
    `);
}

/**
 * Bible Narrative Engine 敘事引擎資料表 (PostgreSQL)
 */
export async function createNarrativeEngineTables(db) {
    // User Story Progress - 使用者對每個故事的整體進度 (一人一故事一筆)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS user_story_progress (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            story_id TEXT NOT NULL,
            current_scene_id TEXT,
            understanding_score INTEGER DEFAULT 0,
            is_completed BOOLEAN DEFAULT FALSE,
            completed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (user_id, story_id)
        );
        CREATE INDEX IF NOT EXISTS idx_story_progress_user ON user_story_progress(user_id);
        CREATE INDEX IF NOT EXISTS idx_story_progress_story ON user_story_progress(story_id);
    `);

    // Game Sessions - 每次遊玩的 Session 紀錄
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_game_sessions (
            session_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            story_id TEXT NOT NULL,
            current_scene_id TEXT,
            current_turn_id INTEGER DEFAULT 1,
            current_available_actions JSONB DEFAULT '{}',
            feed_history JSONB DEFAULT '[]',
            session_status TEXT NOT NULL DEFAULT 'active' CHECK (session_status IN ('active', 'paused', 'completed', 'abandoned')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_narr_sessions_user ON narrative_game_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_narr_sessions_story ON narrative_game_sessions(story_id);
        CREATE INDEX IF NOT EXISTS idx_narr_sessions_status ON narrative_game_sessions(session_status);
    `);

    // Scene States - 場景狀態 (一 session 一 scene 一筆)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_scene_states (
            id SERIAL PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES narrative_game_sessions(session_id) ON DELETE CASCADE,
            story_id TEXT NOT NULL,
            scene_id TEXT NOT NULL,
            goal_progress INTEGER DEFAULT 0,
            is_completed BOOLEAN DEFAULT FALSE,
            local_flags_json JSONB DEFAULT '{}',
            summary TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (session_id, scene_id)
        );
        CREATE INDEX IF NOT EXISTS idx_narr_scene_session ON narrative_scene_states(session_id);
    `);

    // Character States - 角色狀態 (一 session + scene + character 唯一)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_character_states (
            id SERIAL PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES narrative_game_sessions(session_id) ON DELETE CASCADE,
            scene_id TEXT NOT NULL,
            character_id TEXT NOT NULL,
            trust_level INTEGER DEFAULT 0,
            openness_level INTEGER DEFAULT 0,
            attitude TEXT,
            memory_summary TEXT,
            state_flags_json JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (session_id, scene_id, character_id)
        );
        CREATE INDEX IF NOT EXISTS idx_narr_char_session ON narrative_character_states(session_id);
    `);

    // Dialogue Logs - 對話紀錄 (不隨 session 刪除，保留審計用)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_dialogue_logs (
            id SERIAL PRIMARY KEY,
            session_id TEXT REFERENCES narrative_game_sessions(session_id) ON DELETE SET NULL,
            user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            story_id TEXT NOT NULL,
            scene_id TEXT NOT NULL,
            character_id TEXT,
            speaker TEXT NOT NULL CHECK (speaker IN ('user', 'character', 'narrator', 'system')),
            message TEXT NOT NULL,
            message_type TEXT,
            ai_credit_cost INTEGER DEFAULT 0,
            token_in INTEGER,
            token_out INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_narr_dialogue_session ON narrative_dialogue_logs(session_id);
        CREATE INDEX IF NOT EXISTS idx_narr_dialogue_user ON narrative_dialogue_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_narr_dialogue_created ON narrative_dialogue_logs(created_at);
    `);

    // Lore Unlocks - 知識解鎖 (綁定使用者帳號，跨 session 持久化)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_lore_unlocks (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            story_id TEXT NOT NULL,
            lore_key TEXT NOT NULL,
            unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (user_id, story_id, lore_key)
        );
        CREATE INDEX IF NOT EXISTS idx_narr_lore_user ON narrative_lore_unlocks(user_id);
        CREATE INDEX IF NOT EXISTS idx_narr_lore_story ON narrative_lore_unlocks(story_id);
    `);
}

/**
 * 管理員審計日誌資料表 (PostgreSQL)
 */
export async function createAuditTables(db) {
    // Admin Audit Logs - 敏感操作紀錄 (不隨使用者刪除而消失)
    // Table name changed from admin_audit_logs to audit_logs to match AuditLogService.js
    await db.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY, -- Changed to TEXT to accommodate UUIDs from AuditLogService.js
            actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            action_type TEXT NOT NULL,
            target_type TEXT,
            target_id TEXT,
            before_json JSONB,
            after_json JSONB,
            reason TEXT,
            correlation_id TEXT,
            ip_address TEXT,
            user_agent TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_audit_admin ON audit_logs(actor_user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action_type);
        CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_type, target_id);
        CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

        -- [MIGRATION] Ensure actor_user_id exists to fix Auth logging
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_user_id TEXT;
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action_type TEXT;
    `);
}

/**
 * 建立系統配置資料表 (PostgreSQL)
 * 用於儲存全域變數、巡航指針等設定
 */
export async function createSystemTables(db) {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value JSONB NOT NULL,
            description TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

/**
 * Narrative Content 故事內容層資料表 (PostgreSQL)
 * 用於儲存靜態的故事結構、場景、角色與知識內容。
 */
export async function createNarrativeContentTables(db) {
    // 1. Narrative Stories - 故事主表
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_stories (
            story_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            testament TEXT CHECK (testament IN ('OT', 'NT')),
            genre TEXT,
            default_narrative_tone TEXT,
            entry_scene_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 2. Narrative Story Scenes - 場景骨架
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_story_scenes (
            id SERIAL PRIMARY KEY,
            story_id TEXT NOT NULL REFERENCES narrative_stories(story_id) ON DELETE CASCADE,
            scene_id TEXT NOT NULL,
            title TEXT NOT NULL,
            entry_text TEXT NOT NULL,
            main_goal TEXT,
            main_choice_label TEXT,
            next_scene_id TEXT,
            lore_keys JSONB NOT NULL DEFAULT '[]',
            character_ids JSONB NOT NULL DEFAULT '[]',
            scripture_refs_json JSONB NOT NULL DEFAULT '[]',
            source_entity_ids_json JSONB NOT NULL DEFAULT '[]',
            source_commentary_ids_json JSONB NOT NULL DEFAULT '[]',
            generation_mode TEXT NOT NULL DEFAULT 'fixed' CHECK (generation_mode IN ('fixed', 'ai_assisted')),
            entry_text_source TEXT DEFAULT 'manual',
            source_hash TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_terminal BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (story_id, scene_id)
        );
        CREATE INDEX IF NOT EXISTS idx_narr_scenes_story ON narrative_story_scenes(story_id);
        CREATE INDEX IF NOT EXISTS idx_narr_scenes_lookup ON narrative_story_scenes(story_id, scene_id);
    `);

    // 3. Narrative Story Characters - 角色固定卡
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_story_characters (
            id SERIAL PRIMARY KEY,
            story_id TEXT NOT NULL REFERENCES narrative_stories(story_id) ON DELETE CASCADE,
            character_id TEXT NOT NULL,
            display_name TEXT NOT NULL,
            role_type TEXT NOT NULL DEFAULT 'npc' CHECK (role_type IN ('main', 'npc', 'hidden')),
            identity TEXT,
            core_traits JSONB NOT NULL DEFAULT '[]',
            speech_style TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (story_id, character_id)
        );
        CREATE INDEX IF NOT EXISTS idx_narr_chars_story ON narrative_story_characters(story_id);
    `);

    // 4. Narrative Story Character Overlays - 角色場景狀態
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_story_character_overlays (
            id SERIAL PRIMARY KEY,
            story_id TEXT NOT NULL REFERENCES narrative_stories(story_id) ON DELETE CASCADE,
            scene_id TEXT NOT NULL,
            character_id TEXT NOT NULL,
            emotional_state TEXT,
            knows_json JSONB NOT NULL DEFAULT '[]',
            can_reveal_json JSONB NOT NULL DEFAULT '[]',
            should_avoid_json JSONB NOT NULL DEFAULT '[]',
            response_policy_json JSONB NOT NULL DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (story_id, scene_id, character_id)
        );
        CREATE INDEX IF NOT EXISTS idx_narr_overlays_lookup ON narrative_story_character_overlays(story_id, scene_id, character_id);
    `);

    // 5. Narrative Story Lore - 背景知識卡
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_story_lore (
            id SERIAL PRIMARY KEY,
            story_id TEXT NOT NULL REFERENCES narrative_stories(story_id) ON DELETE CASCADE,
            lore_key TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'general',
            title TEXT NOT NULL,
            short_text TEXT NOT NULL,
            full_text TEXT NOT NULL,
            relevance_text TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (story_id, lore_key)
        );
        CREATE INDEX IF NOT EXISTS idx_narr_lore_lookup ON narrative_story_lore(story_id, lore_key);
    `);
}

/**
 * Phase 1.3: Narrative Scenes 欄位擴充遷移 (PostgreSQL)
 */
export async function migrateNarrativeScenesV2(db) {
    console.log('🔄 [Migration] Checking narrative_story_scenes for Phase 1.3 upgrades...');
    
    // Check and add columns one by one
    await db.exec(`
        ALTER TABLE narrative_story_scenes ADD COLUMN IF NOT EXISTS scripture_refs_json JSONB NOT NULL DEFAULT '[]';
        ALTER TABLE narrative_story_scenes ADD COLUMN IF NOT EXISTS source_entity_ids_json JSONB NOT NULL DEFAULT '[]';
        ALTER TABLE narrative_story_scenes ADD COLUMN IF NOT EXISTS source_commentary_ids_json JSONB NOT NULL DEFAULT '[]';
        ALTER TABLE narrative_story_scenes ADD COLUMN IF NOT EXISTS generation_mode TEXT NOT NULL DEFAULT 'fixed';
        ALTER TABLE narrative_story_scenes ADD COLUMN IF NOT EXISTS entry_text_source TEXT DEFAULT 'manual';
        ALTER TABLE narrative_story_scenes ADD COLUMN IF NOT EXISTS source_hash TEXT;
    `);

    // Ensure constraint if not present (Postgres doesn't support IF NOT EXISTS on CHECK directly easily without complex DO blocks)
    try {
        await db.exec(`
            ALTER TABLE narrative_story_scenes DROP CONSTRAINT IF EXISTS narrative_story_scenes_generation_mode_check;
            ALTER TABLE narrative_story_scenes ADD CONSTRAINT narrative_story_scenes_generation_mode_check CHECK (generation_mode IN ('fixed', 'ai_assisted'));
        `);
    } catch (e) {
        console.warn('⚠️ [Migration] Failed to update generation_mode constraint (might already exist or be incompatible):', e.message);
    }
}

/**
 * Phase 1.4: Narrative Story Catalog
 * Index table for AI matching and story selection.
 */
export async function migrateNarrativeCatalog(db) {
    console.log('📦 [Migration] Ensuring narrative_story_catalog exists...');
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_story_catalog (
            story_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            subtitle TEXT,
            summary TEXT,
            theme_tags_json JSONB NOT NULL DEFAULT '[]',
            character_tags_json JSONB NOT NULL DEFAULT '[]',
            event_tags_json JSONB NOT NULL DEFAULT '[]',
            primary_source_refs_json JSONB NOT NULL DEFAULT '[]',
            parallel_source_refs_json JSONB NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'published',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_narrative_catalog_status ON narrative_story_catalog(status);
    `);
}

/**
 * Phase 2.1: Narrative Blueprint V2 Tables (PostgreSQL)
 * The definitive 13-Commandment architecture.
 */
export async function createNarrativeBlueprintV2Tables(db) {
    console.log('🔄 [Schema] Establishing Narrative Blueprint V2 Tables...');

    // 1. 故事主表 (包含 Module 標記)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_stories_v2 (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            primary_source TEXT NOT NULL,
            parallel_refs_json JSONB DEFAULT '[]',
            immutable_beats_json JSONB NOT NULL DEFAULT '[]',
            threads_json JSONB NOT NULL DEFAULT '[]',
            start_scene_id TEXT NOT NULL,
            status TEXT DEFAULT 'draft',
            reusable_as_module BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 2. 模組覆寫表
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_module_overlays (
            id TEXT PRIMARY KEY,
            parent_story_id TEXT NOT NULL REFERENCES narrative_stories_v2(id) ON DELETE CASCADE,
            module_story_id TEXT NOT NULL REFERENCES narrative_stories_v2(id) ON DELETE CASCADE,
            background_thread TEXT,
            extra_npc_slots_json JSONB DEFAULT '[]',
            entry_scene_id TEXT,
            exit_target_scene TEXT NOT NULL
        );
    `);

    // 3. 場景節點
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_story_scenes_v2 (
            id TEXT PRIMARY KEY,
            story_id TEXT NOT NULL REFERENCES narrative_stories_v2(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            goal TEXT NOT NULL,
            must_happen_json JSONB NOT NULL DEFAULT '[]',
            entry_text TEXT NOT NULL,
            actions_json JSONB NOT NULL,
            characters_present_json JSONB DEFAULT '[]'
        );
        CREATE INDEX IF NOT EXISTS idx_scenes_v2_story ON narrative_story_scenes_v2(story_id);
    `);

    // 4. NPC 原型庫
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_npc_archetypes (
            id TEXT PRIMARY KEY,
            story_id TEXT NOT NULL REFERENCES narrative_stories_v2(id) ON DELETE CASCADE,
            npc_type TEXT NOT NULL,
            label TEXT NOT NULL,
            social_role TEXT,
            speech_style TEXT,
            knowledge_scope TEXT NOT NULL,
            theological_authority TEXT DEFAULT 'none',
            interaction_depth TEXT DEFAULT 'light',
            persistence TEXT DEFAULT 'scene',
            allowed_functions_json JSONB DEFAULT '[]',
            forbidden_functions_json JSONB DEFAULT '[]',
            global_entity_id TEXT, -- Link to narrative_global_entities
            source_archetype_id TEXT, -- Reference to another archetype for modularity
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Migration for Phase 2 & 3: Ensure columns exist
    try {
        await db.exec('ALTER TABLE narrative_npc_archetypes ADD COLUMN IF NOT EXISTS global_entity_id TEXT');
        await db.exec('ALTER TABLE narrative_npc_archetypes ADD COLUMN IF NOT EXISTS source_archetype_id TEXT');
        await db.exec('ALTER TABLE narrative_npc_archetypes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP');
    } catch (e) {
        console.log('Migration note: narrative_npc_archetypes columns check');
    }

    // 4b. 全域實體庫 (Phase 2)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_global_entities (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL CHECK (category IN ('person', 'location', 'event', 'object')),
            canonical_name TEXT NOT NULL,
            aliases_json JSONB DEFAULT '[]',
            description TEXT,
            metadata JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_global_entities_name ON narrative_global_entities(canonical_name);
    `);

    // 4c. 全域記憶庫 (Phase 3)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_global_memories (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            global_entity_id TEXT NOT NULL REFERENCES narrative_global_entities(id) ON DELETE CASCADE,
            memory_summary TEXT, -- 跨劇本的互動記憶摘要
            last_interaction_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, global_entity_id)
        );
    `);

    // 5. NPC 場景插槽
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_scene_npc_slots (
            id TEXT PRIMARY KEY,
            scene_id TEXT NOT NULL REFERENCES narrative_story_scenes_v2(id) ON DELETE CASCADE,
            slot_id TEXT NOT NULL,
            archetype_id TEXT NOT NULL REFERENCES narrative_npc_archetypes(id) ON DELETE CASCADE,
            headcount INTEGER DEFAULT 1,
            is_interactive BOOLEAN DEFAULT false,
            priority TEXT DEFAULT 'medium'
        );
    `);

    // 6. Runtime NPC 實體
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_session_npcs (
            session_npc_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            slot_id TEXT NOT NULL,
            display_name TEXT NOT NULL,
            resolved_traits_json JSONB NOT NULL DEFAULT '[]',
            interaction_state TEXT DEFAULT 'available'
        );
        CREATE INDEX IF NOT EXISTS idx_session_npcs_sess ON narrative_session_npcs(session_id);
    `);

    // 7. 知識庫
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_story_lore_v2 (
            id TEXT PRIMARY KEY,
            story_id TEXT NOT NULL REFERENCES narrative_stories_v2(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            category TEXT
        );
    `);

    // 8. 適材適所分析 (Passage Assessor)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_passage_assessments (
            id TEXT PRIMARY KEY,
            scripture_reference TEXT NOT NULL UNIQUE,
            text_type TEXT NOT NULL,
            dramatic_score INTEGER NOT NULL,
            signals_positive_json JSONB DEFAULT '[]',
            signals_negative_json JSONB DEFAULT '[]',
            recommended_mode TEXT NOT NULL,
            reason TEXT,
            assessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

/**
 * Bible Time Traveler Engine Tables (V1.0 - AI First Dynamic Architecture)
 */
export async function createTimeTravelerTables(db) {
    console.log('🔄 [Schema] Establishing Time Traveler Engine Tables...');

    // 1. Scene Generator Cache (The Scene Packets)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS time_traveler_scenes (
            id TEXT PRIMARY KEY,
            story_id TEXT, -- Link to narrative_stories_v2
            canonical_anchor TEXT NOT NULL,
            title TEXT NOT NULL,
            rules_json JSONB NOT NULL DEFAULT '[]',
            npcs_json JSONB NOT NULL DEFAULT '[]',
            initial_narrative TEXT NOT NULL,
            initial_buttons_json JSONB NOT NULL DEFAULT '[]',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 2. Player Sessions
    await db.exec(`
        CREATE TABLE IF NOT EXISTS time_traveler_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            scene_id TEXT NOT NULL REFERENCES time_traveler_scenes(id) ON DELETE CASCADE,
            story_id TEXT, -- Link to narrative_stories_v2
            current_state TEXT DEFAULT 'active',
            context_history JSONB NOT NULL DEFAULT '[]',
            memory_summary TEXT,
            sync_rate INTEGER DEFAULT 100,
            status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived', 'failed')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_tt_sessions_user ON time_traveler_sessions(user_id);
    `);

    // 3. Witness Logs (Personal Spiritual Record)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS witness_logs (
            id SERIAL PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES time_traveler_sessions(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            scene_id TEXT NOT NULL REFERENCES time_traveler_scenes(id) ON DELETE CASCADE,
            fragment TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_witness_logs_user ON witness_logs(user_id);
    `);

    // 4. Action Candidates (Evolutionary Action Harvesting)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS action_candidates (
            id SERIAL PRIMARY KEY,
            scene_id TEXT NOT NULL REFERENCES time_traveler_scenes(id) ON DELETE CASCADE,
            user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            action_text TEXT NOT NULL,
            status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_action_candidates_scene ON action_candidates(scene_id);
    `);
}
