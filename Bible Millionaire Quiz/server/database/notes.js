/**
 * 筆記資料庫操作
 * Notes Database Operations (devotionals, user notes)
 * [SOVEREIGN 1.2] PostgreSQL 物理引號對標版本
 */

/**
 * 建立筆記操作模組
 * @param {Database} notesDb - PostgresAdapter instance
 */
export function createNotesOps(notesDb) {
    return {
        /**
         * [SOVEREIGN 1.2] 權重選題引擎 (Weighted Selection Engine)
         * 依照冷卻分數與 10 天硬鎖機制在資料庫進行抽籤
         */
        async selectWeightedScripture(suggestedBooks = null, options = {}) {
            try {
                // [節期優先] 如果有建議書卷，優先從建議庫隨機抽取
                if (suggestedBooks && suggestedBooks.trim() !== '') {
                    const bookList = suggestedBooks.split(',').map(s => s.trim());
                    console.log(`🎄 [Selector] Holiday priority mode: ${bookList.join(', ')}`);
                    const rows = await notesDb.query(`
                        SELECT "bookId", "bookZh", "chapterCount", score
                        FROM public.devotional_weights
                        WHERE "bookId" = ANY($1) 
                        ORDER BY RANDOM() LIMIT 1
                    `, [bookList]);
                    if (rows && rows.length > 0) return formatResult(rows[0]);
                }

                // [常規模式] 10 天內硬鎖排除，從冷卻時間最久 (分數最高) 的前 10 名中抽取
                const limit = options.limit || 1;
                const rows = await notesDb.query(`
                    WITH hard_locked AS (
                        SELECT "bookId" FROM public.devotional_stats 
                        WHERE "dateKey" > TO_CHAR(CURRENT_DATE - INTERVAL '10 days', 'YYYY-MM-DD')
                    ),
                    eligible_books AS (
                        SELECT "bookId", "bookZh", score, "chapterCount"
                        FROM public.devotional_weights
                        WHERE "bookId" NOT IN (SELECT "bookId" FROM hard_locked GROUP BY "bookId")
                        ORDER BY score DESC, RANDOM()
                        LIMIT 10
                    )
                    SELECT * FROM eligible_books ORDER BY RANDOM() LIMIT $1;
                `, [limit]);

                if (!rows || rows.length === 0) {
                    console.warn('⚠️ [Selector] Hard lock too tight, falling back to random.');
                    const fallback = await notesDb.get('SELECT "bookId", "bookZh", "chapterCount", score FROM public.devotional_weights ORDER BY RANDOM() LIMIT 1');
                    return [formatResult(fallback)];
                }

                return rows.map(r => formatResult(r));

                function formatResult(book) {
                    if (!book) return null;
                    const chapter = Math.floor(Math.random() * (book.chapterCount || 1)) + 1;
                    console.log(`✅ [Selector] Selected: ${book.bookZh} (${book.bookId}) Ch ${chapter}`);
                    return {
                        bookId: book.bookId,
                        bookZh: book.bookZh,
                        chapter: chapter,
                        score: book.score
                    };
                }
            } catch (error) {
                console.error('❌ [Selector] Selection error:', error.message);
                return null;
            }
        },

        /**
         * [SOVEREIGN 1.2] 更新選題權重
         */
        async updateWeightedSelection(bookId, dateKey, chapter) {
            try {
                // 1. 紀錄歷史 (使用雙引號對標實體欄位)
                await notesDb.run(`
                    INSERT INTO public.devotional_stats ("dateKey", "bookId", chapter)
                    VALUES ($1, $2, $3)
                    ON CONFLICT ("dateKey") DO UPDATE SET "bookId" = $2, chapter = $3
                `, [dateKey, bookId, chapter]);

                // 2. 調整分數
                await notesDb.run(`
                    UPDATE public.devotional_weights 
                    SET score = score - 50, "lastUsedAt" = CURRENT_TIMESTAMP
                    WHERE "bookId" = $1
                `, [bookId]);
            } catch (error) {
                console.error('❌ [Selector] Update weight error:', error.message);
            }
        },

        /**
         * 取得指定日期的靈修內容
         */
        async getDevotional(dateKey) {
            try {
                const sql = 'SELECT * FROM public.daily_devotionals WHERE "dateKey" = $1';
                const row = await notesDb.get(sql, [dateKey]);
                return row || null;
            } catch (error) {
                console.error('❌ [Database] Get devotional error:', error.message);
                return null;
            }
        },

        /**
         * 儲存靈修內容
         */
        async saveDevotional(data) {
            try {
                await notesDb.run(
                    `INSERT INTO public.daily_devotionals ("dateKey", content, metadata, "styleId", "authorId") 
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT ("dateKey") DO UPDATE SET 
                        content = EXCLUDED.content,
                        metadata = EXCLUDED.metadata,
                        "styleId" = EXCLUDED."styleId",
                        "authorId" = EXCLUDED."authorId",
                        "createdAt" = CURRENT_TIMESTAMP`,
                    [
                        data.dateKey || data.date, 
                        typeof data.content === 'string' ? data.content : JSON.stringify(data.content), 
                        data.metadata || {},
                        data.styleId || null,
                        data.authorId || null
                    ]
                );
                return true;
            } catch (error) {
                console.error('❌ [Database] Save devotional error:', error.message);
                return false;
            }
        },

        /**
         * 刪除指定日期的靈修內容
         */
        async deleteDevotional(dateKey) {
            try {
                await notesDb.run('DELETE FROM public.daily_devotionals WHERE "dateKey" = $1', [dateKey]);
                return true;
            } catch (error) {
                console.error('❌ [Database] Delete devotional error:', error.message);
                return false;
            }
        },

        /**
         * 取得最近使用的靈修書卷
         */
        async getRecentDevotionals(days = 60) {
            try {
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - days);
                const cutoffStr = cutoff.toISOString().split('T')[0];

                return await notesDb.query(`
                    SELECT "dateKey" as date, content, metadata 
                    FROM public.daily_devotionals 
                    WHERE "dateKey" >= $1 
                    ORDER BY "dateKey" DESC
                `, [cutoffStr]);
            } catch (error) {
                console.error('[NotesOps] getRecentDevotionals error:', error.message);
                return [];
            }
        },

        // --- 節期與作家 (管理與生成用) ---
        async getTodayLiturgicalEvent(dateStr) {
            try {
                const [year, month, day] = dateStr.split('-').map(Number);
                return await notesDb.get(`
                    SELECT name, theme, priority, "suggestedBooks" 
                    FROM public.liturgical_calendar 
                    WHERE active = true AND "calculationType" = 'fixed' 
                      AND "fixedMonth" = $1 AND "fixedDay" = $2
                    ORDER BY priority DESC LIMIT 1
                `, [month, day]);
            } catch (error) { return null; }
        },

        async getAuthorsForStyle(styleId) {
            try {
                return await notesDb.query(`
                    SELECT id, name, bio, "avatarUrl" 
                    FROM public.devotional_authors 
                    WHERE "styleId" = $1 AND active = true
                    ORDER BY "sortOrder" ASC
                `, [styleId]);
            } catch (error) { return []; }
        },

        /**
         * [SOVEREIGN 1.2] 管理端歷史查詢
         */
        async getDevotionalHistory({ page = 1, limit = 10, search = '', userId = null }) {
            try {
                const offset = (page - 1) * limit;
                let sql = 'SELECT d.* FROM public.daily_devotionals d';
                let countSql = 'SELECT COUNT(*) as count FROM public.daily_devotionals d';
                const params = [];

                if (userId) {
                    sql = 'SELECT d.* FROM public.daily_devotionals d INNER JOIN public.devotional_checkins c ON d."dateKey" = c.date';
                    countSql = 'SELECT COUNT(*) as count FROM public.daily_devotionals d INNER JOIN public.devotional_checkins c ON d."dateKey" = c.date';
                }

                const conditions = [];
                if (userId) {
                    params.push(userId);
                    conditions.push(`c.user_id = $${params.length} AND c.read_at IS NOT NULL`);
                }

                if (search) {
                    params.push(`%${search}%`);
                    conditions.push(`d.content::text LIKE $${params.length}`);
                }

                if (conditions.length > 0) {
                    const whereClause = ' WHERE ' + conditions.join(' AND ');
                    sql += whereClause;
                    countSql += whereClause;
                }

                sql += ` ORDER BY d."dateKey" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
                
                const [history, countResult] = await Promise.all([
                    notesDb.query(sql, [...params, limit, offset]),
                    notesDb.get(countSql, params)
                ]);

                return {
                    history: history || [],
                    pagination: {
                        page,
                        limit,
                        total: countResult ? parseInt(countResult.count) : 0,
                        totalPages: Math.ceil((countResult ? parseInt(countResult.count) : 0) / limit)
                    }
                };
            } catch (error) {
                console.error('❌ [Database] getDevotionalHistory error:', error.message);
                return { history: [], pagination: { page, limit, total: 0, totalPages: 0 } };
            }
        },

        // --- 使用者筆記 ---
        async getUserNotes(userId) {
            try {
                return await notesDb.query(
                    'SELECT date, note, updated_at FROM devotional_notes WHERE user_id = $1 ORDER BY date DESC',
                    [userId]
                ) || [];
            } catch (error) {
                console.error('[NotesOps] getUserNotes error:', error.message);
                return [];
            }
        },

        // --- 草稿管理 ---
        async getDraft(userId, date) {
            try {
                return await notesDb.get(
                    'SELECT content, updated_at FROM public.note_drafts WHERE user_id = $1 AND date = $2',
                    [userId, date]
                ) || null;
            } catch (error) {
                console.error('[NotesOps] getDraft error:', error.message);
                return null;
            }
        },

        async saveDraft(userId, date, content) {
            try {
                await notesDb.run(`
                    INSERT INTO public.note_drafts (user_id, date, content, updated_at)
                    VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                    ON CONFLICT(user_id, date) DO UPDATE SET
                        content = EXCLUDED.content,
                        updated_at = CURRENT_TIMESTAMP
                `, [userId, date, content]);
                return true;
            } catch (error) {
                console.error('[NotesOps] saveDraft error:', error.message);
                return false;
            }
        },

        async deleteDraft(userId, date) {
            try {
                await notesDb.run(
                    'DELETE FROM public.note_drafts WHERE user_id = $1 AND date = $2',
                    [userId, date]
                );
                return true;
            } catch (error) {
                console.error('[NotesOps] deleteDraft error:', error.message);
                return false;
            }
        },

        // --- 佇列管理 (Scheduler 專用) ---
        async enqueueGeneration(targetDate) {
            try {
                await notesDb.run(`
                    INSERT INTO public.devotional_generation_queue ("targetDate", status)
                    VALUES ($1, 'pending')
                    ON CONFLICT ("targetDate") DO NOTHING
                `, [targetDate]);
                return true;
            } catch (error) { return false; }
        },

        async updateQueueStatus(targetDate, status, error = null) {
            try {
                await notesDb.run(`
                    UPDATE public.devotional_generation_queue 
                    SET status = $1, "lastError" = $2, "completedAt" = CASE WHEN $1 = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END
                    WHERE "targetDate" = $3
                `, [status, error, targetDate]);
            } catch (e) { }
        }
    };
}
