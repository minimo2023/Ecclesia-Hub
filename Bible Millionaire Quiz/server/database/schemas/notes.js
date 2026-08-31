/**
 * 靈修、筆記與簽到 Schema (notes)
 * [V3 Sovereign Proxy]
 * Optimized for PostgreSQL 1.2 - 物理對標穩定版 (引號政策)
 */

/**
 * 建立靈修筆記資料表 (PostgreSQL)
 */
export async function createNotesTables(db) {
    // [SOVEREIGN 1.2] 冪等初始化 - 只負責建立不存在的表，不破壞既有資料

    // 1. 用戶筆記與簽到 (物理層使用 snake_case，adapter 層自動轉 camelCase)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS public.devotional_notes (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            date TEXT NOT NULL,
            note TEXT,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, date)
        );
    `);
    await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_notes_user ON public.devotional_notes(user_id);
    `);
    await db.exec(`
        CREATE TABLE IF NOT EXISTS public.devotional_checkins (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            date TEXT NOT NULL,
            checked_in_at TIMESTAMP WITH TIME ZONE,
            coins_awarded INTEGER DEFAULT 0,
            read_at TIMESTAMP WITH TIME ZONE,
            read_coins_awarded INTEGER DEFAULT 0,
            wrote_note_at TIMESTAMP WITH TIME ZONE,
            note_coins_awarded INTEGER DEFAULT 0,
            scripture_read_at TIMESTAMP WITH TIME ZONE,
            UNIQUE(user_id, date)
        );
    `);


    // [SOVEREIGN 1.2.1] Schema Migration: Add scripture_read_at
    try {
        await db.exec(`ALTER TABLE public.devotional_checkins ADD COLUMN IF NOT EXISTS scripture_read_at TIMESTAMP WITH TIME ZONE;`);
        await db.exec(`ALTER TABLE public.devotional_checkins ADD COLUMN IF NOT EXISTS read_coins_awarded INTEGER DEFAULT 0;`);
        await db.exec(`ALTER TABLE public.devotional_checkins ADD COLUMN IF NOT EXISTS note_coins_awarded INTEGER DEFAULT 0;`);
        await db.exec(`ALTER TABLE public.devotional_checkins ADD COLUMN IF NOT EXISTS scripture_coins_awarded INTEGER DEFAULT 0;`);
        console.log('📦 Migration: Added scripture_read_at to devotional_checkins');
    } catch (e) {
        // Column might already exist
    }

    // 2. 靈修內容與物業 (每張表獨立 exec + IF NOT EXISTS)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS public.daily_devotionals (
            id SERIAL PRIMARY KEY,
            "dateKey" TEXT UNIQUE NOT NULL,
            content JSONB NOT NULL,
            metadata JSONB DEFAULT '{}',
            "styleId" TEXT,
            "authorId" INTEGER,
            "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `);
    await db.exec(`
        CREATE TABLE IF NOT EXISTS public.devotional_weights (
            "bookId" TEXT PRIMARY KEY,
            "bookZh" TEXT NOT NULL,
            score INTEGER DEFAULT 100,
            "chapterCount" INTEGER DEFAULT 1,
            "lastUsedAt" TIMESTAMP WITH TIME ZONE,
            "isNewTestament" BOOLEAN DEFAULT false
        );
    `);
    await db.exec(`
        CREATE TABLE IF NOT EXISTS public.devotional_stats (
            id SERIAL PRIMARY KEY,
            "dateKey" TEXT NOT NULL,
            "bookId" TEXT NOT NULL,
            chapter INTEGER NOT NULL,
            UNIQUE("dateKey")
        );
    `);
    await db.exec(`
        CREATE TABLE IF NOT EXISTS public.devotional_generation_queue (
            id SERIAL PRIMARY KEY,
            "targetDate" TEXT NOT NULL UNIQUE,
            status TEXT DEFAULT 'pending',
            attempts INTEGER DEFAULT 0,
            "lastError" TEXT,
            "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            "completedAt" TIMESTAMP WITH TIME ZONE
        );
    `);

    // 3. 節期與作家 (每張表獨立 exec + IF NOT EXISTS)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS public.liturgical_calendar (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            "nameEn" TEXT,
            theme TEXT NOT NULL,
            "calculationType" TEXT NOT NULL,
            "fixedMonth" INTEGER,
            "fixedDay" INTEGER,
            "floatingRule" JSONB,
            priority INTEGER DEFAULT 50,
            "suggestedBooks" TEXT,
            active BOOLEAN DEFAULT true,
            "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `);
    await db.exec(`
        CREATE TABLE IF NOT EXISTS public.devotional_authors (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            "styleId" TEXT NOT NULL,
            bio TEXT,
            "avatarUrl" TEXT,
            active BOOLEAN DEFAULT true,
            "sortOrder" INTEGER DEFAULT 0,
            "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(name, "styleId")
        );
    `);
    await db.exec(`
        CREATE TABLE IF NOT EXISTS public.note_drafts (
            user_id TEXT NOT NULL,
            date TEXT NOT NULL,
            content TEXT,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, date)
        );
    `);

    // [SOVEREIGN 1.2] 回補初始化
    await seedDefaultAuthors(db);
    await backfillDevotionalStyleIds(db);
    await seedDevotionalWeights(db);
    await seedDefaultHolidays(db);
}

/**
 * V2 僅回填既有文章的風格身份，不改動 content、作者或文章日期。
 * 先以 authorId 對應；早期資料沒有 authorId 時才使用 content.author 名稱。
 */
async function backfillDevotionalStyleIds(db) {
    try {
        await db.exec(`
            UPDATE public.daily_devotionals AS devotional
            SET "styleId" = author."styleId"
            FROM public.devotional_authors AS author
            WHERE devotional."styleId" IS NULL
              AND devotional."authorId" = author.id;

            UPDATE public.daily_devotionals AS devotional
            SET "styleId" = author."styleId"
            FROM public.devotional_authors AS author
            WHERE devotional."styleId" IS NULL
              AND devotional.content->>'author' = author.name;

            UPDATE public.daily_devotionals
            SET "styleId" = 'default'
            WHERE "styleId" IS NULL
              AND metadata->>'style' IN ('standard', 'default');
        `);
    } catch (error) {
        console.warn('⚠️ [Database] Devotional styleId backfill skipped:', error.message);
    }
}

/**
 * [SOVEREIGN 1.2] 初始化原創作家 (同步引號)
 */
async function seedDefaultAuthors(db) {
    try {
        const count = await db.get('SELECT COUNT(*) as total FROM public.devotional_authors');
        if (count && parseInt(count.total) === 0) {
            console.log('🌱 [Database] Seeding 21 devotional authors...');
            const authors = [
                { name: '林以恩', style: 'default' }, { name: '陳恩典', style: 'default' }, { name: '何信望', style: 'default' },
                { name: '陳雨晴', style: 'scenicStart' }, { name: '張曉晶', style: 'scenicStart' }, { name: '劉春雨', style: 'scenicStart' },
                { name: '柯靜心', style: 'innerDialogue' }, { name: '黃念慧', style: 'innerDialogue' }, { name: '周思畢', style: 'innerDialogue' },
                { name: '葛書亞', style: 'narrativeFlow' }, { name: '方曉薇', style: 'narrativeFlow' }, { name: '李敘文', style: 'narrativeFlow' },
                { name: '蘇映荷', style: 'poeticImagery' }, { name: '謝詩婷', style: 'poeticImagery' }, { name: '王詠嵐', style: 'poeticImagery' },
                { name: '潘安琪', style: 'gentleCompanion' }, { name: '吳暖心', style: 'gentleCompanion' }, { name: '陳同行', style: 'gentleCompanion' },
                { name: '白默然', style: 'contemplativeStillness' }, { name: '何寂光', style: 'contemplativeStillness' }, { name: '王靜安', style: 'contemplativeStillness' }
            ];
            
            for (const author of authors) {
                await db.run(
                    'INSERT INTO public.devotional_authors (name, "styleId") VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [author.name, author.style]
                );
            }
        }
    } catch (e) {
        console.warn('⚠️ [Database] Seed authors skipped:', e.message);
    }
}

/**
 * [SOVEREIGN 1.2] 初始化 66 卷書權重 (同步引號)
 */
async function seedDevotionalWeights(db) {
    try {
        const count = await db.get('SELECT COUNT(*) as total FROM public.devotional_weights');
        if (count && parseInt(count.total) > 0) return;

        console.log('🌱 [Database] Seeding 66 Bible books weights...');
        const books = [
            { id: 'Genesis', zh: '創世記', ch: 50, nt: false }, { id: 'Exodus', zh: '出埃及記', ch: 40, nt: false },
            { id: 'Leviticus', zh: '利未記', ch: 27, nt: false }, { id: 'Numbers', zh: '民數記', ch: 36, nt: false },
            { id: 'Deuteronomy', zh: '申命記', ch: 34, nt: false }, { id: 'Joshua', zh: '約書亞記', ch: 24, nt: false },
            { id: 'Judges', zh: '士師記', ch: 21, nt: false }, { id: 'Ruth', zh: '路得記', ch: 4, nt: false },
            { id: '1Samuel', zh: '撒母耳記上', ch: 31, nt: false }, { id: '2Samuel', zh: '撒母耳記下', ch: 24, nt: false },
            { id: '1Kings', zh: '列王紀上', ch: 22, nt: false }, { id: '2Kings', zh: '列王紀下', ch: 25, nt: false },
            { id: '1Chronicles', zh: '歷代志上', ch: 29, nt: false }, { id: '2Chronicles', zh: '歷代志下', ch: 36, nt: false },
            { id: 'Ezra', zh: '以斯拉記', ch: 10, nt: false }, { id: 'Nehemiah', zh: '尼希米記', ch: 13, nt: false },
            { id: 'Esther', zh: '以斯帖記', ch: 10, nt: false }, { id: 'Job', zh: '約伯記', ch: 42, nt: false },
            { id: 'Psalms', zh: '詩篇', ch: 150, nt: false }, { id: 'Proverbs', zh: '箴言', ch: 31, nt: false },
            { id: 'Ecclesiastes', zh: '傳道書', ch: 12, nt: false }, { id: 'SongofSongs', zh: '雅歌', ch: 8, nt: false },
            { id: 'Isaiah', zh: '以賽亞書', ch: 66, nt: false }, { id: 'Jeremiah', zh: '耶利米書', ch: 52, nt: false },
            { id: 'Lamentations', zh: '耶利米哀歌', ch: 5, nt: false }, { id: 'Ezekiel', zh: '以西結書', ch: 48, nt: false },
            { id: 'Daniel', zh: '但以理書', ch: 12, nt: false }, { id: 'Hosea', zh: '何西阿書', ch: 14, nt: false },
            { id: 'Joel', zh: '約珥書', ch: 3, nt: false }, { id: 'Amos', zh: '阿摩司書', ch: 9, nt: false },
            { id: 'Obadiah', zh: '俄巴底亞書', ch: 1, nt: false }, { id: 'Jonah', zh: '約拿書', ch: 4, nt: false },
            { id: 'Micah', zh: '彌迦書', ch: 7, nt: false }, { id: 'Nahum', zh: '那鴻書', ch: 3, nt: false },
            { id: 'Habakkuk', zh: '哈巴谷書', ch: 3, nt: false }, { id: 'Zephaniah', zh: '西番雅書', ch: 3, nt: false },
            { id: 'Haggai', zh: '哈該書', ch: 2, nt: false }, { id: 'Zechariah', zh: '撒迦利亞書', ch: 14, nt: false },
            { id: 'Malachi', zh: '瑪拉基書', ch: 4, nt: false },
            { id: 'Matthew', zh: '馬太福音', ch: 28, nt: true }, { id: 'Mark', zh: '馬可福音', ch: 16, nt: true },
            { id: 'Luke', zh: '路加福音', ch: 24, nt: true }, { id: 'John', zh: '約翰福音', ch: 21, nt: true },
            { id: 'Acts', zh: '使徒行傳', ch: 28, nt: true }, { id: 'Romans', zh: '羅馬書', ch: 16, nt: true },
            { id: '1Corinthians', zh: '哥林多前書', ch: 16, nt: true }, { id: '2Corinthians', zh: '哥林多後書', ch: 13, nt: true },
            { id: 'Galatians', zh: '加拉太書', ch: 6, nt: true }, { id: 'Ephesians', zh: '以弗所書', ch: 6, nt: true },
            { id: 'Philippians', zh: '腓立比書', ch: 4, nt: true }, { id: 'Colossians', zh: '歌羅西書', ch: 4, nt: true },
            { id: '1Thessalonians', zh: '帖撒羅尼迦前書', ch: 5, nt: true }, { id: '2Thessalonians', zh: '帖撒羅尼迦後書', ch: 3, nt: true },
            { id: '1Timothy', zh: '提摩太前書', ch: 6, nt: true }, { id: '2Timothy', zh: '提摩太後書', ch: 4, nt: true },
            { id: 'Titus', zh: '提多書', ch: 3, nt: true }, { id: 'Philemon', zh: '腓利門書', ch: 1, nt: true },
            { id: 'Hebrews', zh: '希伯來書', ch: 13, nt: true }, { id: 'James', zh: '雅各書', ch: 5, nt: true },
            { id: '1Peter', zh: '彼得前書', ch: 5, nt: true }, { id: '2Peter', zh: '彼得後書', ch: 3, nt: true },
            { id: '1John', zh: '約翰一書', ch: 5, nt: true }, { id: '2John', zh: '約翰二書', ch: 1, nt: true },
            { id: '3John', zh: '約翰三書', ch: 1, nt: true }, { id: 'Jude', zh: '猶大書', ch: 1, nt: true },
            { id: 'Revelation', zh: '啟示錄', ch: 22, nt: true }
        ];

        for (const book of books) {
            await db.run(`
                INSERT INTO public.devotional_weights ("bookId", "bookZh", "chapterCount", "isNewTestament")
                VALUES ($1, $2, $3, $4)
                ON CONFLICT ("bookId") DO NOTHING
            `, [book.id, book.zh, book.ch, book.nt]);
        }
    } catch (e) {
        console.warn('⚠️ [Database] Seed weights failed:', e.message);
    }
}

/**
 * [SOVEREIGN 1.2] 注入預設節期 (同步引號)
 */
async function seedDefaultHolidays(db) {
    try {
        const count = await db.get('SELECT COUNT(*) as total FROM public.liturgical_calendar');
        if (count && parseInt(count.total) > 0) return;

        const holidays = [
            { name: '新年', en: 'New Year', theme: '新的開始', m: 1, d: 1, p: 80, books: 'Isaiah, Revelation' },
            { name: '平安夜', en: 'Christmas Eve', theme: '降生期待', m: 12, d: 24, p: 90, books: 'Luke' },
            { name: '聖誕節', en: 'Christmas', theme: '道成肉身', m: 12, d: 25, p: 100, books: 'Matthew, John' }
        ];

        for (const h of holidays) {
            await db.run(`
                INSERT INTO public.liturgical_calendar (name, "nameEn", theme, "calculationType", "fixedMonth", "fixedDay", priority, "suggestedBooks")
                VALUES ($1, $2, $3, 'fixed', $4, $5, $6, $7)
            `, [h.name, h.en, h.theme, h.m, h.d, h.p, h.books]);
        }
    } catch (e) {
        console.warn('⚠️ [Database] Seed holidays failed:', e.message);
    }
}
