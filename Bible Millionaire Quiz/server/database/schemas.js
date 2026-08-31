/**
 * 資料庫結構定義與遷移
 * Database Schemas & Migrations
 */

/**
 * 預設成就定義
 */
const ACHIEVEMENT_DEFINITIONS = [
    // === 經典問答模式 === (coin_reward: 5-15 based on difficulty)
    { id: 'first_game', name: '🎯 初試啼聲', description: '完成第一局遊戲', icon: '🎯', type: 'normal', category: 'classic', condition_type: 'games_played', condition_value: 1, sort_order: 1, coin_reward: 5 },
    { id: 'classic_win', name: '🏆 聖經達人', description: '經典模式通關', icon: '🏆', type: 'normal', category: 'classic', condition_type: 'classic_victory', condition_value: 1, sort_order: 2, coin_reward: 20 },
    { id: 'no_lifeline_win', name: '💪 真材實料', description: '通關且未使用任何求助', icon: '💪', type: 'hidden', category: 'classic', condition_type: 'no_lifeline_victory', condition_value: 1, sort_order: 3, coin_reward: 50 },
    { id: 'coins_100', name: '💰 金幣獵人', description: '累積 100 金幣', icon: '💰', type: 'normal', category: 'classic', condition_type: 'total_coins', condition_value: 100, sort_order: 4, coin_reward: 10 },
    { id: 'coins_500', name: '💰 金幣大亨', description: '累積 500 金幣', icon: '💎', type: 'normal', category: 'classic', condition_type: 'total_coins', condition_value: 500, sort_order: 5, coin_reward: 30 },
    { id: 'use_all_lifelines', name: '🎰 智囊團', description: '單局使用過所有 3 種求助', icon: '🎰', type: 'normal', category: 'classic', condition_type: 'use_all_lifelines', condition_value: 1, sort_order: 6, coin_reward: 10 },
    { id: 'buy_lifeline_5', name: '🤑 有錢任性', description: '單局購買求助 5 次以上', icon: '🤑', type: 'hidden', category: 'classic', condition_type: 'buy_lifelines', condition_value: 5, sort_order: 7, coin_reward: 15 },

    // === 快問快答模式 ===
    { id: 'speed_first', name: '⚡ 閃電入門', description: '完成第一局快問快答', icon: '⚡', type: 'normal', category: 'speed', condition_type: 'speed_games', condition_value: 1, sort_order: 10, coin_reward: 5 },
    { id: 'speed_perfect', name: '🎯 完美一局', description: '快問快答正確率 100%', icon: '🎯', type: 'normal', category: 'speed', condition_type: 'speed_perfect', condition_value: 1, sort_order: 11, coin_reward: 25 },
    { id: 'streak_10', name: '🔥 火力全開', description: '連續答對 10 題', icon: '🔥', type: 'normal', category: 'speed', condition_type: 'max_streak', condition_value: 10, sort_order: 12, coin_reward: 10 },
    { id: 'streak_15', name: '🔥 烈焰連擊', description: '連續答對 15 題', icon: '🔥', type: 'hidden', category: 'speed', condition_type: 'max_streak', condition_value: 15, sort_order: 13, coin_reward: 20 },
    { id: 'buy_time_10', name: '⏱️ 時間管理師', description: '累計購買延長時間 10 次', icon: '⏱️', type: 'normal', category: 'speed', condition_type: 'total_time_buys', condition_value: 10, sort_order: 14, coin_reward: 10 },

    // === 聖經探索 ===
    { id: 'ot_explorer', name: '📚 舊約探索者', description: '完成任一舊約書卷挑戰', icon: '📚', type: 'normal', category: 'bible', condition_type: 'ot_book', condition_value: 1, sort_order: 20, coin_reward: 10 },
    { id: 'nt_explorer', name: '📚 新約探索者', description: '完成任一新約書卷挑戰', icon: '📚', type: 'normal', category: 'bible', condition_type: 'nt_book', condition_value: 1, sort_order: 21, coin_reward: 10 },
    { id: 'gospels_complete', name: '✝️ 福音使者', description: '完成四福音書各一次', icon: '✝️', type: 'normal', category: 'bible', condition_type: 'gospels_complete', condition_value: 4, sort_order: 22, coin_reward: 30 },
    { id: 'pentateuch_complete', name: '📜 律法學者', description: '完成摩西五經各一次', icon: '📜', type: 'normal', category: 'bible', condition_type: 'pentateuch_complete', condition_value: 5, sort_order: 23, coin_reward: 30 },
    { id: 'bible_master', name: '🌟 聖經通', description: '完成全部 66 卷書挑戰', icon: '🌟', type: 'hidden', category: 'bible', condition_type: 'all_books', condition_value: 66, sort_order: 24, coin_reward: 100 },

    // === 隱藏成就（趣味） ===
    { id: 'night_owl', name: '🌙 夜貓子', description: '凌晨 0-5 點遊玩', icon: '🌙', type: 'hidden', category: 'misc', condition_type: 'play_time', condition_value: 0, sort_order: 30, coin_reward: 5 },
    { id: 'early_bird', name: '🌅 早起的鳥', description: '早上 5-7 點遊玩', icon: '🌅', type: 'hidden', category: 'misc', condition_type: 'play_time', condition_value: 5, sort_order: 31, coin_reward: 5 },
    { id: 'unlucky', name: '😅 再接再厲', description: '單局第一題就答錯', icon: '😅', type: 'hidden', category: 'misc', condition_type: 'first_question_wrong', condition_value: 1, sort_order: 32, coin_reward: 3 },
    { id: 'lucky_guess', name: '🎲 幸運兒', description: '使用 50:50 後猜對', icon: '🎲', type: 'hidden', category: 'misc', condition_type: 'fifty_guess', condition_value: 1, sort_order: 33, coin_reward: 10 },

    // === 靈修相關 (Streak Achievements) ===
    { id: 'read_streak_7', name: '🌅 晨更 7 日', description: '連續 7 天閱讀靈修', icon: '🌅', type: 'normal', category: 'devotional', condition_type: 'read_streak', condition_value: 7, sort_order: 40, coin_reward: 10 },
    { id: 'read_streak_14', name: '🌅 晨更 14 日', description: '連續 14 天閱讀靈修', icon: '🌅', type: 'normal', category: 'devotional', condition_type: 'read_streak', condition_value: 14, sort_order: 41, coin_reward: 20 },
    { id: 'read_streak_21', name: '🌅 晨更 21 日', description: '連續 21 天閱讀靈修', icon: '🌅', type: 'normal', category: 'devotional', condition_type: 'read_streak', condition_value: 21, sort_order: 42, coin_reward: 30 },
    { id: 'read_streak_28', name: '🌅 晨更 28 日', description: '連續 28 天閱讀靈修', icon: '🌅', type: 'normal', category: 'devotional', condition_type: 'read_streak', condition_value: 28, sort_order: 43, coin_reward: 40 },
    { id: 'read_streak_35', name: '🌅 晨更 35 日', description: '連續 35 天閱讀靈修', icon: '🌅', type: 'hidden', category: 'devotional', condition_type: 'read_streak', condition_value: 35, sort_order: 44, coin_reward: 50 },
    { id: 'read_streak_40', name: '🌅 晨更 40 日', description: '連續 40 天閱讀靈修', icon: '🌅', type: 'hidden', category: 'devotional', condition_type: 'read_streak', condition_value: 40, sort_order: 45, coin_reward: 60 },
    { id: 'note_streak_7', name: '✍️ 筆記 7 日', description: '連續 7 天寫靈修筆記', icon: '✍️', type: 'normal', category: 'devotional', condition_type: 'note_streak', condition_value: 7, sort_order: 50, coin_reward: 15 },
    { id: 'note_streak_14', name: '✍️ 筆記 14 日', description: '連續 14 天寫靈修筆記', icon: '✍️', type: 'normal', category: 'devotional', condition_type: 'note_streak', condition_value: 14, sort_order: 51, coin_reward: 25 },
    { id: 'note_streak_21', name: '✍️ 筆記 21 日', description: '連續 21 天寫靈修筆記', icon: '✍️', type: 'normal', category: 'devotional', condition_type: 'note_streak', condition_value: 21, sort_order: 52, coin_reward: 35 },
    { id: 'note_streak_28', name: '✍️ 筆記 28 日', description: '連續 28 天寫靈修筆記', icon: '✍️', type: 'normal', category: 'devotional', condition_type: 'note_streak', condition_value: 28, sort_order: 53, coin_reward: 45 },
    { id: 'note_streak_35', name: '✍️ 筆記 35 日', description: '連續 35 天寫靈修筆記', icon: '✍️', type: 'hidden', category: 'devotional', condition_type: 'note_streak', condition_value: 35, sort_order: 54, coin_reward: 55 },
    { id: 'note_streak_40', name: '✍️ 筆記 40 日', description: '連續 40 天寫靈修筆記', icon: '✍️', type: 'hidden', category: 'devotional', condition_type: 'note_streak', condition_value: 40, sort_order: 55, coin_reward: 70 },

    // === 連續登入 (Login Streak) ===
    { id: 'login_streak_7', name: '📅 一週常客', description: '連續 7 天登入', icon: '📅', type: 'normal', category: 'login', condition_type: 'login_streak', condition_value: 7, sort_order: 60, coin_reward: 10 },
    { id: 'login_streak_14', name: '📅 兩週忠實', description: '連續 14 天登入', icon: '📅', type: 'normal', category: 'login', condition_type: 'login_streak', condition_value: 14, sort_order: 61, coin_reward: 20 },
    { id: 'login_streak_30', name: '📅 月度達人', description: '連續 30 天登入', icon: '📅', type: 'hidden', category: 'login', condition_type: 'login_streak', condition_value: 30, sort_order: 62, coin_reward: 50 },
];

function seedAchievements(usersDb) {
    try {
        // Always seed/update achievements using INSERT OR REPLACE
        console.log('🌱 Seeding/updating achievements...');
        const insertStmt = usersDb.prepare(`
            INSERT OR REPLACE INTO achievements (id, name, description, icon, type, category, condition_type, condition_value, sort_order, coin_reward)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const achievement of ACHIEVEMENT_DEFINITIONS) {
            insertStmt.run(
                achievement.id,
                achievement.name,
                achievement.description,
                achievement.icon,
                achievement.type,
                achievement.category,
                achievement.condition_type,
                achievement.condition_value,
                achievement.sort_order,
                achievement.coin_reward || 0
            );
        }

        const count = usersDb.prepare('SELECT COUNT(*) as count FROM achievements').get();
        console.log(`✅ Achievements seeded: ${count.count} entries`);
    } catch (error) {
        console.error('❌ Error seeding achievements:', error.message);
    }
}


/**
 * 建立使用者資料表
 */
export function createUsersTables(usersDb) {
    usersDb.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT,
            security_question TEXT,
            security_answer_hash TEXT,
            is_admin INTEGER DEFAULT 0,
            role TEXT DEFAULT 'user',
            coins INTEGER DEFAULT 0,
            total_games INTEGER DEFAULT 0,
            total_correct INTEGER DEFAULT 0,
            total_answered INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            last_login INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);

    // Migration: Add total_answered column if missing
    try {
        const columns = usersDb.pragma('table_info(users)').map(c => c.name);
        if (!columns.includes('total_answered')) {
            usersDb.prepare('ALTER TABLE users ADD COLUMN total_answered INTEGER DEFAULT 0').run();
            console.log('📦 Migration: Added total_answered column to users table');
        }
    } catch (e) { /* Column may already exist */ }

    usersDb.exec(`
        CREATE TABLE IF NOT EXISTS game_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            coins_earned INTEGER DEFAULT 0,
            coins_spent INTEGER DEFAULT 0,
            questions_correct INTEGER DEFAULT 0,
            questions_total INTEGER DEFAULT 0,
            completed_at INTEGER DEFAULT (strftime('%s', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_game_sessions_user ON game_sessions(user_id);
    `);

    // Achievement Definitions
    usersDb.exec(`
        CREATE TABLE IF NOT EXISTS achievements (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            icon TEXT,
            type TEXT DEFAULT 'normal',
            category TEXT,
            condition_type TEXT,
            condition_value INTEGER,
            sort_order INTEGER DEFAULT 0,
            coin_reward INTEGER DEFAULT 0
        );
    `);

    // Migration: Add coin_reward column if missing
    try {
        const columns = usersDb.pragma('table_info(achievements)').map(c => c.name);
        if (!columns.includes('coin_reward')) {
            usersDb.prepare('ALTER TABLE achievements ADD COLUMN coin_reward INTEGER DEFAULT 0').run();
            console.log('📦 Migration: Added coin_reward column to achievements table');
        }
    } catch (e) { /* Column may already exist */ }

    // User Achievement Unlocks
    usersDb.exec(`
        CREATE TABLE IF NOT EXISTS user_achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            achievement_id TEXT NOT NULL,
            unlocked_at INTEGER DEFAULT (strftime('%s', 'now')),
            UNIQUE(user_id, achievement_id)
        );
        CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
    `);

    // Coin Ledger (Transaction History)
    usersDb.exec(`
        CREATE TABLE IF NOT EXISTS coin_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            amount INTEGER NOT NULL,
            reason TEXT,
            balance_after INTEGER,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_coin_ledger_user ON coin_ledger(user_id);
    `);

    // Seed default achievements
    seedAchievements(usersDb);
}

/**
 * 建立內容資料表 (聖經、注釋、資源等)
 */
export function createContentTables(contentDb) {
    // Bible verses
    contentDb.exec(`
        CREATE TABLE IF NOT EXISTS bible_verses (
            id TEXT PRIMARY KEY,
            version TEXT NOT NULL,
            book TEXT NOT NULL,
            book_name TEXT,
            chapter INTEGER NOT NULL,
            verse INTEGER NOT NULL,
            text TEXT NOT NULL,
            source TEXT,
            metadata TEXT,
            cached_at INTEGER DEFAULT (strftime('%s', 'now')),
            UNIQUE(version, book, chapter, verse)
        );
        CREATE INDEX IF NOT EXISTS idx_verse_ref ON bible_verses(book, chapter, verse);
        CREATE INDEX IF NOT EXISTS idx_verse_version ON bible_verses(version, book);
    `);

    // Bible books info
    contentDb.exec(`
        CREATE TABLE IF NOT EXISTS bible_books (
            id TEXT PRIMARY KEY,
            name_zh TEXT,
            name_en TEXT,
            testament TEXT,
            category TEXT,
            chapters INTEGER,
            order_num INTEGER,
            metadata TEXT
        );
    `);

    // API Cache
    contentDb.exec(`
        CREATE TABLE IF NOT EXISTS api_cache (
            cache_key TEXT PRIMARY KEY,
            api_source TEXT NOT NULL,
            endpoint TEXT,
            response TEXT NOT NULL,
            expires_at INTEGER,
            cached_at INTEGER DEFAULT (strftime('%s', 'now')),
            hit_count INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_cache_source ON api_cache(api_source);
        CREATE INDEX IF NOT EXISTS idx_cache_expires ON api_cache(expires_at);
    `);

    // AI Chapter Summaries Cache
    contentDb.exec(`
        CREATE TABLE IF NOT EXISTS ai_summaries (
            book TEXT NOT NULL,
            chapter INTEGER NOT NULL,
            version TEXT NOT NULL DEFAULT 'unv',
            summary_json TEXT NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            PRIMARY KEY (book, chapter, version)
        );
        CREATE INDEX IF NOT EXISTS idx_ai_summaries_book ON ai_summaries(book);
    `);

    // Commentaries
    contentDb.exec(`
        CREATE TABLE IF NOT EXISTS commentaries (
            id TEXT PRIMARY KEY,
            book TEXT NOT NULL,
            title TEXT,
            content TEXT,
            source_path TEXT,
            category TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_commentary_book ON commentaries(book);
        CREATE INDEX IF NOT EXISTS idx_commentary_category ON commentaries(category);
    `);

    // Generic Collections
    contentDb.exec(`
        CREATE TABLE IF NOT EXISTS collections (
            collection_name TEXT NOT NULL,
            doc_id TEXT NOT NULL,
            data TEXT NOT NULL,
            updated_at INTEGER DEFAULT (strftime('%s', 'now')),
            PRIMARY KEY (collection_name, doc_id)
        );
        CREATE INDEX IF NOT EXISTS idx_collection ON collections(collection_name);
    `);

    // Categories, Resources, Tags, Locations (simplified)
    contentDb.exec(`
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL,
            series INTEGER, series_name TEXT, parent_id TEXT, sort_order INTEGER, description TEXT
        );
        CREATE TABLE IF NOT EXISTS resources (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, filename TEXT, file_path TEXT, file_type TEXT,
            file_size INTEGER, category_id TEXT, audience_level TEXT, target_roles TEXT, use_case TEXT,
            content_type TEXT, summary TEXT, keywords TEXT, related_books TEXT, related_chapters TEXT,
            author TEXT, source TEXT, language TEXT DEFAULT 'zh-TW', estimated_read_time INTEGER,
            is_indexed INTEGER DEFAULT 0, is_parsed INTEGER DEFAULT 0,
            
            -- AI Data Cleaning Columns
            clean_title TEXT,
            clean_summary TEXT,
            category TEXT, -- Override original category_id with clean text
            tags TEXT,
            processed_at INTEGER,

            created_at INTEGER DEFAULT (strftime('%s', 'now')), updated_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS resource_verses (
            id TEXT PRIMARY KEY, resource_id TEXT NOT NULL, book TEXT NOT NULL,
            chapter_start INTEGER, verse_start INTEGER, chapter_end INTEGER, verse_end INTEGER,
            confidence REAL DEFAULT 1.0, source TEXT, created_at INTEGER DEFAULT (strftime('%s', 'now'))
        );
        CREATE TABLE IF NOT EXISTS extracted_text (
            id TEXT PRIMARY KEY, resource_id TEXT NOT NULL UNIQUE, content TEXT, word_count INTEGER,
            extracted_at INTEGER DEFAULT (strftime('%s', 'now'))
        );
        CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, description TEXT, parent_id TEXT
        );
        CREATE TABLE IF NOT EXISTS resource_tags (
            resource_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY (resource_id, tag_id)
        );
        CREATE TABLE IF NOT EXISTS locations (
            id TEXT PRIMARY KEY, code TEXT, name_ch TEXT NOT NULL, name_en TEXT, name_aliases TEXT,
            lat REAL, lon REAL, type TEXT, description TEXT, source TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        );
        CREATE TABLE IF NOT EXISTS verse_locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT, book TEXT NOT NULL, chapter INTEGER NOT NULL,
            verse INTEGER, location_id TEXT NOT NULL, source TEXT
        );
    `);

    // Migration for Resources Table
    migrateResourcesTable(contentDb);

    // Create indexes
    contentDb.exec(`
        CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category_id);
        CREATE INDEX IF NOT EXISTS idx_resources_clean_cat ON resources(category); 
        CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(file_type);
        CREATE INDEX IF NOT EXISTS idx_locations_name ON locations(name_ch, name_en);
    `);
}

/**
 * 資源資料表遷移 (新增清洗欄位)
 */
function migrateResourcesTable(contentDb) {
    const columns = contentDb.pragma('table_info(resources)');
    const columnNames = new Set(columns.map(c => c.name));

    const newColumns = [
        { name: 'clean_title', type: 'TEXT' },
        { name: 'clean_summary', type: 'TEXT' },
        { name: 'category', type: 'TEXT' },
        { name: 'tags', type: 'TEXT' },
        { name: 'processed_at', type: 'INTEGER' }
    ];

    newColumns.forEach(col => {
        if (!columnNames.has(col.name)) {
            try {
                console.log(`📦 Migrating resources table: Adding ${col.name}...`);
                contentDb.prepare(`ALTER TABLE resources ADD COLUMN ${col.name} ${col.type}`).run();
            } catch (e) {
                // Column might already exist
            }
        }
    });
}

/**
 * 建立筆記資料表 (靈修日誌)
 */
export function createNotesTables(notesDb) {
    notesDb.exec(`
        CREATE TABLE IF NOT EXISTS daily_devotionals (
            date TEXT PRIMARY KEY,
            content TEXT,
            metadata TEXT,
            generated_at INTEGER
        );
    `);

    notesDb.exec(`
        CREATE TABLE IF NOT EXISTS devotional_notes (
            odc_id TEXT,
            user_id TEXT,
            book TEXT,
            chapter INTEGER,
            verse INTEGER,
            note TEXT,
            highlight_color TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER,
            date TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_devotional_notes_user ON devotional_notes(user_id);
        CREATE INDEX IF NOT EXISTS idx_devotional_notes_date ON devotional_notes(date);
    `);

    notesDb.exec(`
        CREATE TABLE IF NOT EXISTS note_drafts (
            user_id TEXT,
            date TEXT,
            content TEXT,
            updated_at INTEGER,
            PRIMARY KEY (user_id, date)
        );
    `);

    // Devotional Check-ins (for daily rewards and streaks)
    notesDb.exec(`
        CREATE TABLE IF NOT EXISTS devotional_checkins (
            id INTEGER PRIMARY KEY,
            user_id TEXT NOT NULL,
            date TEXT NOT NULL,
            read_at INTEGER,
            wrote_note_at INTEGER,
            read_coins_awarded INTEGER DEFAULT 0,
            note_coins_awarded INTEGER DEFAULT 0,
            UNIQUE(user_id, date)
        );
        CREATE INDEX IF NOT EXISTS idx_checkins_user ON devotional_checkins(user_id);
        CREATE INDEX IF NOT EXISTS idx_checkins_date ON devotional_checkins(date);
    `);
}

/**
 * 建立遊戲資料表 (題庫、排行榜)
 */
export function createGamesTables(gamesDb) {
    // Questions with extended schema
    gamesDb.exec(`
        CREATE TABLE IF NOT EXISTS questions (
            id TEXT PRIMARY KEY,
            book TEXT,
            chapter INTEGER,
            difficulty TEXT,
            question TEXT,
            options TEXT,
            answer TEXT,
            explanation TEXT,
            source TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            verified INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_questions_book ON questions(book);
        CREATE INDEX IF NOT EXISTS idx_questions_diff ON questions(difficulty);
    `);

    // Schema Migration for questions
    migrateQuestionsTable(gamesDb);

    // Question Reports
    gamesDb.exec(`
        CREATE TABLE IF NOT EXISTS question_reports (
            id TEXT PRIMARY KEY,
            question_id TEXT NOT NULL,
            report_type TEXT,
            message TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_reports_qid ON question_reports(question_id);
    `);

    // Game Runs
    gamesDb.exec(`
        CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            session_id TEXT,
            mode TEXT,
            selection TEXT,
            result_level INTEGER,
            title TEXT,
            lifelines_used TEXT,
            coins_earned INTEGER,
            duration_ms INTEGER,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_runs_user ON runs(user_id);
    `);

    // Leaderboard (Unified with PostgreSQL schema)
    gamesDb.exec(`
        CREATE TABLE IF NOT EXISTS leaderboard (
            user_id TEXT PRIMARY KEY,
            username TEXT,
            display_name TEXT,
            total_score INTEGER DEFAULT 0,
            games_played INTEGER DEFAULT 0,
            high_score INTEGER DEFAULT 0,
            last_updated INTEGER DEFAULT (strftime('%s', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(high_score DESC);
    `);

    // Chapter Locks (Safety Fuse)
    gamesDb.exec(`
        CREATE TABLE IF NOT EXISTS chapter_locks (
            id TEXT PRIMARY KEY,
            book TEXT NOT NULL,
            chapter INTEGER NOT NULL,
            reason TEXT,
            auditor_version TEXT,
            locked_at INTEGER DEFAULT (strftime('%s', 'now')),
            UNIQUE(book, chapter)
        );
        CREATE INDEX IF NOT EXISTS idx_chapter_locks_ref ON chapter_locks(book, chapter);
    `);

    // ==========================================
    // Expedition Tables (New Architecture)
    // ==========================================

    // Expedition Saves (Captain Centric - Checkpoint)
    gamesDb.exec(`
        CREATE TABLE IF NOT EXISTS expedition_saves (
            user_id TEXT PRIMARY KEY, -- Captain ID
            stage INTEGER DEFAULT 1,
            question_index INTEGER DEFAULT 0,
            lives INTEGER DEFAULT 3,
            timestamp INTEGER DEFAULT (strftime('%s', 'now'))
        );
    `);

    // Expedition Inventory (Player Bound)
    gamesDb.exec(`
        CREATE TABLE IF NOT EXISTS expedition_inventory (
            user_id TEXT,
            item_id TEXT,
            quantity INTEGER DEFAULT 0,
            updated_at INTEGER DEFAULT (strftime('%s', 'now')),
            PRIMARY KEY (user_id, item_id)
        );
        CREATE INDEX IF NOT EXISTS idx_expedition_inv_user ON expedition_inventory(user_id);
    `);

    // Expedition Leaderboard (Team/Captain Ranking)
    // ranking based on: max_stage DESC, total_questions DESC
    gamesDb.exec(`
        CREATE TABLE IF NOT EXISTS expedition_leaderboard (
            id TEXT PRIMARY KEY, -- Usually Captain ID or Team Session ID
            captain_id TEXT,
            captain_name TEXT,
            max_stage INTEGER,
            total_questions INTEGER, -- Tie breaker
            team_members TEXT, -- JSON array of names for display
            achieved_at INTEGER DEFAULT (strftime('%s', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_exp_leaderboard_stage ON expedition_leaderboard(max_stage DESC, total_questions DESC);
    `);
}
/**

 * 建立遠征隊資料表 (SQLite Version)
 * Backported from schemas_pg.js for strict environment parity.
 */
export function createExpeditionTables(gamesDb) {
    // Expedition Teams
    gamesDb.exec(`
        CREATE TABLE IF NOT EXISTS expedition_teams(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT,
    owner_name TEXT NOT NULL,
    current_question INTEGER DEFAULT 0,
    current_stage INTEGER DEFAULT 1,
    lives INTEGER DEFAULT 3,
    score INTEGER DEFAULT 0,
    status TEXT DEFAULT 'waiting', --waiting / playing / paused / ended
            created_at INTEGER DEFAULT(strftime('%s', 'now')),
    updated_at INTEGER DEFAULT(strftime('%s', 'now'))
);
        CREATE INDEX IF NOT EXISTS idx_exp_teams_owner ON expedition_teams(owner_id);
        CREATE INDEX IF NOT EXISTS idx_exp_teams_status ON expedition_teams(status);
`);

    // Expedition Team Members
    gamesDb.exec(`
        CREATE TABLE IF NOT EXISTS expedition_team_members(
    team_id TEXT NOT NULL REFERENCES expedition_teams(id) ON DELETE CASCADE,
    user_id TEXT, --NULL = Guest
            display_name TEXT NOT NULL,
    is_owner INTEGER DEFAULT 0,
    joined_at INTEGER DEFAULT(strftime('%s', 'now')),
    PRIMARY KEY(team_id, display_name)
);
        CREATE INDEX IF NOT EXISTS idx_exp_members_user ON expedition_team_members(user_id);
`);

    // Expedition Saves (Captain Centric - Checkpoint)
    // Note: Table 'expedition_saves' might already exist from legacy CreateGamesTables?
    // Checking schemas_pg.js, it is separate. In schemas.js (lines 515), it was inside createGamesTables?
    // YES. In schemas.js lines 516-523, 'expedition_saves' ALREADY EXISTS inside createGamesTables.
    // AND 'expedition_inventory' ALREADY EXISTS (lines 527-533).
    // AND 'expedition_leaderboard' ALREADY EXISTS (lines 540-548).

    // So we only need to add:
    // - expedition_teams
    // - expedition_team_members
    // - expedition_questions (if not exists)
    // - expedition_answered
    // - expedition_config
    // - expedition_records

    // Expedition Questions (V2 Specific Pool)
    gamesDb.exec(`
        CREATE TABLE IF NOT EXISTS expedition_questions(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    options TEXT NOT NULL, --JSON string
            correct_index INTEGER NOT NULL,
    difficulty INTEGER DEFAULT 1,
    question_type TEXT DEFAULT 'choice',
    source_verse TEXT,
    source TEXT DEFAULT 'ai_generated',
    times_used INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT(strftime('%s', 'now'))
);
        CREATE INDEX IF NOT EXISTS idx_exp_questions_diff ON expedition_questions(difficulty);
`);

    // Expedition Answered Log
    gamesDb.exec(`
        CREATE TABLE IF NOT EXISTS expedition_answered(
    team_id TEXT NOT NULL REFERENCES expedition_teams(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES expedition_questions(id) ON DELETE CASCADE,
    answered_at INTEGER DEFAULT(strftime('%s', 'now')),
    is_correct INTEGER,
    PRIMARY KEY(team_id, question_id)
);
`);

    // Expedition Config (Dynamic Settings)
    gamesDb.exec(`
        CREATE TABLE IF NOT EXISTS expedition_config(
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at INTEGER DEFAULT(strftime('%s', 'now'))
);
`);

    // Expedition Records (Game History)
    gamesDb.exec(`
        CREATE TABLE IF NOT EXISTS expedition_records(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_name TEXT NOT NULL,
    members TEXT, --JSON string
            score INTEGER DEFAULT 0,
    stage_reached INTEGER DEFAULT 1,
    duration_seconds INTEGER DEFAULT 0,
    played_at INTEGER DEFAULT(strftime('%s', 'now'))
);
        CREATE INDEX IF NOT EXISTS idx_expedition_records_score ON expedition_records(score DESC, stage_reached DESC);
`);
}
/**
 * 題庫結構遷移 (新增嚴格驗證欄位)
 */
function migrateQuestionsTable(gamesDb) {
    const columns = gamesDb.pragma('table_info(questions)');
    const columnNames = new Set(columns.map(c => c.name));

    const newColumns = [
        { name: 'chapter_start', type: 'INTEGER DEFAULT 0' },
        { name: 'chapter_end', type: 'INTEGER DEFAULT 0' },
        { name: 'stem', type: 'TEXT' },
        { name: 'qtype', type: "TEXT DEFAULT 'single_choice'" },
        { name: 'evidence_ref', type: 'TEXT' },
        { name: 'evidence_quote', type: 'TEXT' },
        { name: 'anchors', type: 'TEXT' },
        { name: 'keywords', type: 'TEXT' },
        { name: 'quality', type: "TEXT DEFAULT 'normal'" },
        { name: 'hash_exact', type: 'TEXT' },
        { name: 'sig_semantic', type: 'TEXT' },
        { name: 'stats_shown', type: 'INTEGER DEFAULT 0' },
        { name: 'stats_correct', type: 'INTEGER DEFAULT 0' },
        { name: 'stats_wrong', type: 'INTEGER DEFAULT 0' },
        { name: 'updated_at', type: 'INTEGER' },
        // Audit-First System Columns (v1.0)
        { name: 'status', type: "TEXT DEFAULT 'LEGACY'" }, // PASS, FREEZE, LEGACY
        { name: 'risk_flags', type: 'TEXT' }, // JSON Array
        { name: 'audit_reason', type: 'TEXT' },
        { name: 'audited_at', type: 'INTEGER' },
        { name: 'auditor_version', type: 'TEXT' },
        // Difficulty Scoring Columns
        { name: 'rule_difficulty_score', type: 'INTEGER' },
        { name: 'difficulty_band', type: 'TEXT' },
        { name: 'difficulty_flags', type: 'TEXT' },
        { name: 'difficulty_breakdown', type: 'TEXT' },
        { name: 'difficulty_score_source', type: 'TEXT' },
        { name: 'difficulty_scored_at', type: 'INTEGER' },
        // AI Judge & Final Score Columns
        { name: 'judge_prompt_version', type: 'TEXT' },
        { name: 'judge_roles', type: 'TEXT' },
        { name: 'ai_judge_a_score', type: 'INTEGER' },
        { name: 'ai_judge_a_role', type: 'TEXT' },
        { name: 'ai_judge_b_score', type: 'INTEGER' },
        { name: 'ai_judge_b_role', type: 'TEXT' },
        { name: 'ai_judge_avg', type: 'INTEGER' },
        { name: 'ai_judge_delta', type: 'INTEGER' },
        { name: 'rule_ai_delta', type: 'INTEGER' },
        { name: 'ai_consistency', type: 'TEXT' },
        { name: 'rule_validity', type: 'TEXT' },
        { name: 'final_difficulty_score', type: 'INTEGER' },
        { name: 'final_difficulty_source', type: 'TEXT' },
        { name: 'final_difficulty_confidence', type: 'REAL' }
    ];

    newColumns.forEach(col => {
        if (!columnNames.has(col.name)) {
            try {
                console.log(`📦 Migrating questions table: Adding ${col.name}...`);
                gamesDb.prepare(`ALTER TABLE questions ADD COLUMN ${col.name} ${col.type} `).run();
            } catch (e) {
                // Column might already exist in some edge cases
            }
        }
    });

    // One-time data migration
    gamesDb.prepare(`
        UPDATE questions SET chapter_start = chapter, chapter_end = chapter 
        WHERE chapter > 0 AND(chapter_start IS NULL OR chapter_start = 0)
    `).run();

    gamesDb.prepare(`UPDATE questions SET stem = question WHERE stem IS NULL OR stem = ''`).run();

    // Audit-First Migration: Mark all existing pre-audit questions as LEGACY
    gamesDb.prepare(`
        UPDATE questions SET status = 'LEGACY' 
        WHERE status IS NULL OR status = 'UNSURE'
    `).run();

    // Indexes for new columns
    gamesDb.exec(`
        CREATE INDEX IF NOT EXISTS idx_questions_hash ON questions(hash_exact);
        CREATE INDEX IF NOT EXISTS idx_questions_sig ON questions(sig_semantic);
        CREATE INDEX IF NOT EXISTS idx_questions_range ON questions(book, chapter_start, chapter_end);
`);
}
