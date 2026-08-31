/**
 * 內容資料庫操作
 * Content Database Operations (bible, commentaries, cache, collections)
 */
import crypto from 'crypto';

/**
 * 建立內容操作模組
 * @param {DatabaseAdapter} contentDb - Async Database Adapter
 */
export function createContentOps(contentDb) {
    return {
        /**
         * 儲存經文
         */
        async saveVerse(verseData) {
            const id = `${verseData.version}_${verseData.book}_${verseData.chapter}_${verseData.verse}`;
            await contentDb.run(`
                INSERT INTO bible_verses (id, version, book, book_name, chapter, verse, text, source, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    version = EXCLUDED.version, book = EXCLUDED.book, book_name = EXCLUDED.book_name,
                    chapter = EXCLUDED.chapter, verse = EXCLUDED.verse, text = EXCLUDED.text,
                    source = EXCLUDED.source, metadata = EXCLUDED.metadata
            `, [id, verseData.version, verseData.book, verseData.book_name, verseData.chapter,
                verseData.verse, verseData.text, verseData.source, JSON.stringify(verseData.metadata || {})]);
            return id;
        },

        /**
         * 取得經文
         */
        async getVerse(version, book, chapter, verse) {
            const row = await contentDb.get(`
                SELECT * FROM bible_verses WHERE version = ? AND book = ? AND chapter = ? AND verse = ?
            `, [version, book, chapter, verse]);

            if (row) {
                try { row.metadata = JSON.parse(row.metadata || '{}'); } catch (e) { row.metadata = {}; }
            }
            return row || null;
        },

        /**
         * 搜尋經文 (Simple LIKE search)
         */
        async searchVerses(keyword, version = 'unv', limit = 20) {
            try {
                const rows = await contentDb.query(`
                    SELECT * FROM bible_verses 
                    WHERE version = ? AND text LIKE ? 
                    ORDER BY book, chapter, verse 
                    LIMIT ?
                `, [version, `%${keyword}%`, limit]);

                return rows.map(row => {
                    try { row.metadata = JSON.parse(row.metadata || '{}'); } catch (e) { row.metadata = {}; }
                    return row;
                });
            } catch (error) {
                console.error('Search verses error:', error);
                return [];
            }
        },

        /**
         * 快取 API 回應
         */
        async cacheAPIResponse(cacheKey, apiSource, endpoint, response, ttl = 86400) {
            // Postgres TIMESTAMP needs a real Date object or ISO string
            const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
            await contentDb.run(`
                INSERT INTO api_cache (cache_key, api_source, endpoint, response, expires_at, hit_count)
                VALUES (?, ?, ?, ?, ?, 0)
                ON CONFLICT (cache_key) DO UPDATE SET
                    api_source = EXCLUDED.api_source, endpoint = EXCLUDED.endpoint,
                    response = EXCLUDED.response, expires_at = EXCLUDED.expires_at, hit_count = 0
            `, [cacheKey, apiSource, endpoint, JSON.stringify(response), expiresAt]);
        },

        /**
         * 取得快取的 API 回應
         */
        async getCachedAPI(cacheKey) {
            try {
                const row = await contentDb.get('SELECT * FROM api_cache WHERE cache_key = ?', [cacheKey]);
                if (!row) return null;

                const now = new Date();
                let isExpired = false;

                // Compatible with existing unix timestamps, Postgres dates, and strings
                if (row.expires_at) {
                    if (row.expires_at instanceof Date) {
                        isExpired = row.expires_at < now;
                    } else if (typeof row.expires_at === 'string') {
                        isExpired = new Date(row.expires_at) < now;
                    } else if (typeof row.expires_at === 'number') {
                        isExpired = row.expires_at < Math.floor(now.getTime() / 1000);
                    }
                }

                if (isExpired) {
                    await contentDb.run('DELETE FROM api_cache WHERE cache_key = ?', [cacheKey]);
                    return null;
                }

                await contentDb.run('UPDATE api_cache SET hit_count = hit_count + 1 WHERE cache_key = ?', [cacheKey]);
                return JSON.parse(row.response);
            } catch (error) {
                console.error('Get cached API error:', error);
                return null;
            }
        },

        /**
         * 取得注釋
         */
        async getCommentaries(book) {
            try {
                const rows = await contentDb.query('SELECT * FROM commentaries WHERE book = ?', [book]);
                return rows.map(row => {
                    try { row.content = JSON.parse(row.content); } catch (e) { }
                    return row;
                });
            } catch (error) {
                console.error('Get commentaries error:', error);
                return [];
            }
        },

        /**
         * 匯入注釋
         */
        async importCommentaries(docs) {
            await contentDb.transaction(async (tx) => {
                for (const doc of docs) {
                    const id = doc.id || crypto.randomUUID();
                    await tx.run(`
                        INSERT INTO commentaries (id, book, title, content, source_path, category)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT (id) DO UPDATE SET
                            book = EXCLUDED.book, title = EXCLUDED.title, content = EXCLUDED.content,
                            source_path = EXCLUDED.source_path, category = EXCLUDED.category
                    `, [id, doc.book, doc.title, JSON.stringify(doc.content), doc.source_path, doc.category]);
                }
            })();
            console.log(`📚 Imported ${docs.length} commentaries`);
        },

        /**
         * 儲存至通用集合
         */
        async saveToCollection(collection, docId, data) {
            await contentDb.run(`
                INSERT INTO collections (collection_name, doc_id, data, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (collection_name, doc_id) DO UPDATE SET
                    data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
            `, [collection, docId, JSON.stringify(data), new Date()]);
            return docId;
        },

        /**
         * 從通用集合取得
         */
        async getFromCollection(collection, docId) {
            try {
                const row = await contentDb.get(`
                    SELECT data FROM collections WHERE collection_name = ? AND doc_id = ?
                `, [collection, docId]);
                return row ? JSON.parse(row.data) : null;
            } catch (error) {
                console.error('Get from collection error:', error);
                return null;
            }
        },

        /**
         * 查詢通用集合
         */
        async queryCollection(collection, conditions = {}) {
            try {
                const rows = await contentDb.query(`
                    SELECT doc_id, data FROM collections WHERE collection_name = ?
                `, [collection]);

                const results = [];
                for (const row of rows) {
                    let data = {};
                    try { data = JSON.parse(row.data); } catch (e) { continue; }

                    let matches = true;
                    for (const [key, value] of Object.entries(conditions)) {
                        if (data[key] !== value) {
                            matches = false;
                            break;
                        }
                    }

                    if (matches) {
                        results.push({ id: row.doc_id, ...data });
                    }
                }
                return results;
            } catch (error) {
                console.error('Query collection error:', error);
                return [];
            }
        },

        /**
         * 從通用集合刪除
         */
        async deleteFromCollection(collection, docId) {
            await contentDb.run('DELETE FROM collections WHERE collection_name = ? AND doc_id = ?', [collection, docId]);
        },


        /**
         * 批次儲存至通用集合
         */
        async batchSaveToCollection(collection, items) {
            return await contentDb.transaction(async (tx) => {
                const results = [];
                for (const item of items) {
                    const docId = item.id || crypto.randomUUID();
                    await tx.run(`
                        INSERT INTO collections (collection_name, doc_id, data, updated_at)
                        VALUES (?, ?, ?, ?)
                        ON CONFLICT (collection_name, doc_id) DO UPDATE SET
                            data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
                    `, [collection, docId, JSON.stringify({ ...item, id: docId }), new Date()]);
                    results.push(docId);
                }
                return results;
            })();
        },

        /**
         * 批次匯入資源（福音資料核心功能）
         * @param {Array} resources - 資源對象數組
         * @returns {number} 成功導入數量
         */
        async importResources(resources) {
            await contentDb.transaction(async (tx) => {
                for (const resource of resources) {
                    const id = resource.id || crypto.randomUUID();
                    const metadata = {
                        category: resource.category || 'commentary',
                        related_books: resource.related_books || null,
                        author: resource.author || null,
                        language: resource.language || 'zh-TW',
                        ...resource.metadata
                    };

                    await tx.run(`
                        INSERT INTO resources (
                            id, title, filename, file_path, file_type, source, metadata, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT (id) DO UPDATE SET
                            title = EXCLUDED.title, filename = EXCLUDED.filename, file_path = EXCLUDED.file_path,
                            file_type = EXCLUDED.file_type, source = EXCLUDED.source, 
                            metadata = EXCLUDED.metadata
                    `, [
                        id,
                        resource.title,
                        resource.filename,
                        resource.file_path,
                        resource.content_type || 'document',
                        resource.source || 'fhl_sync',
                        JSON.stringify(metadata),
                        new Date()
                    ]);
                }
            })();

            console.log(`📚 [ContentManager] Imported ${resources.length} resources`);
            return resources.length;
        },

        /**
         * 批次匯入提取的文本內容
         * @param {Array} texts - 文本對象數組 [{resource_id, content, word_count}]
         * @returns {number} 成功導入數量
         */
        async importExtractedText(texts) {
            await contentDb.transaction(async (tx) => {
                for (const text of texts) {
                    const id = text.id || crypto.randomUUID();
                    await tx.run(`
                        INSERT INTO extracted_text (id, resource_id, content, word_count, extracted_at, metadata)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT (id) DO UPDATE SET
                            resource_id = EXCLUDED.resource_id, content = EXCLUDED.content,
                            word_count = EXCLUDED.word_count, extracted_at = EXCLUDED.extracted_at,
                            metadata = EXCLUDED.metadata
                    `, [
                        id,
                        text.resource_id,
                        text.content,
                        text.word_count || (text.content?.length || 0),
                        new Date(),
                        JSON.stringify(text.metadata || {})
                    ]);
                }
            })();

            console.log(`📝 [ContentManager] Imported ${texts.length} text extracts`);
            return texts.length;
        },

        /**
         * 查詢資源（支援多條件篩選）
         * @param {Object} filters - 篩選條件 {category, related_books, content_type, limit}
         * @returns {Array} 資源列表
         */
        async queryResources(filters = {}) {
            try {
                let whereClauses = [];
                let params = [];

                if (filters.category) {
                    whereClauses.push('category_id = ?');
                    params.push(filters.category);
                }

                if (filters.related_books) {
                    whereClauses.push('related_books LIKE ?');
                    params.push(`%${filters.related_books}%`);
                }

                if (filters.content_type) {
                    whereClauses.push('content_type = ?');
                    params.push(filters.content_type);
                }

                const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
                const limit = filters.limit ? `LIMIT ${parseInt(filters.limit, 10)}` : '';

                const sql = `SELECT * FROM resources ${whereClause} ORDER BY created_at DESC ${limit}`;
                return await contentDb.query(sql, params);
            } catch (error) {
                console.error('[ContentManager] Query resources error:', error);
                return [];
            }
        },

        /**
         * 取得資源的文本內容
         * @param {string} resourceId - 資源 ID
         * @returns {Object|null} 文本對象
         */
        async getExtractedText(resourceId) {
            try {
                return await contentDb.get('SELECT * FROM extracted_text WHERE resource_id = ?', [resourceId]);
            } catch (error) {
                console.error('[ContentManager] Get extracted text error:', error);
                return null;
            }
        },

        /**
         * 全文搜索資源庫（簡單版，未來可升級為 FTS5）
         * @param {string} query - 搜索關鍵字
         * @param {number} limit - 結果數量限制
         * @returns {Array} 搜索結果
         */
        async searchLibrary(query, limit = 20) {
            try {
                // 搜尋現有的 lexicons (百科) 與 locations (地理) 兩張實際有資料的表
                const qLike = `%${query}%`;
                const half = Math.ceil(limit / 2);

                const lexResults = await contentDb.query(`
                    SELECT id::text, name_zh as title, description, 'lexicon' as source_type,
                           CASE category WHEN 0 THEN '動物' WHEN 1 THEN '植物' ELSE '器物' END as category
                    FROM lexicons
                    WHERE name_zh ILIKE $1 OR name_en ILIKE $1 OR description ILIKE $1
                    LIMIT $2
                `, [qLike, half]);

                const locResults = await contentDb.query(`
                    SELECT id::text, name_zh as title, description, 'location' as source_type,
                           '地理' as category
                    FROM locations
                    WHERE name_zh ILIKE $1 OR name_en ILIKE $1 OR description ILIKE $1
                    LIMIT $2
                `, [qLike, half]);

                return [...(lexResults || []), ...(locResults || [])];
            } catch (error) {
                console.error('[ContentManager] searchLibrary error:', error);
                return [];
            }
        },

        // --- 百科辭典模組 (Lexicons) ---

        /**
         * 取得單一百科項目
         * @param {number} id 
         */
        async getLexicon(id) {
            try {
                return await contentDb.get('SELECT * FROM lexicons WHERE id = ?', [id]);
            } catch (error) {
                console.error('[ContentManager] getLexicon error:', error);
                return null;
            }
        },

        /**
         * 依據分類與 Key 取得單一百科項目
         * @param {number} category 0: Animal, 1: Plant, 2: Object
         * @param {string} keyId 例如 '2.24'
         */
        async getLexiconByKey(category, keyId) {
            try {
                return await contentDb.get('SELECT * FROM lexicons WHERE category = ? AND key_id = ?', [category, keyId]);
            } catch (error) {
                console.error('[ContentManager] getLexiconByKey error:', error);
                return null;
            }
        },

        /**
         * 搜尋百科
         * @param {string} query 搜尋關鍵字
         * @param {number|null} category 分類過濾 (可選)
         * @param {number} limit 筆數限制
         */
        async searchLexicons(query, category = null, limit = 20) {
            try {
                let sql = 'SELECT * FROM lexicons WHERE (name_zh LIKE ? OR name_en LIKE ? OR description LIKE ?)';
                const qLike = `%${query}%`;
                const params = [qLike, qLike, qLike];

                if (category !== null && category !== undefined) {
                    sql += ' AND category = ?';
                    params.push(category);
                }

                sql += ' ORDER BY id ASC LIMIT ?';
                params.push(limit);

                return await contentDb.query(sql, params);
            } catch (error) {
                console.error('[ContentManager] searchLexicons error:', error);
                return [];
            }
        },

        /**
         * 隨機抽取百科項目 (用於遊戲出題或隨機知識卡)
         * @param {number|null} category 分類過濾 (可選)
         * @param {number} limit 筆數限制
         */
        async getRandomLexicons(category = null, limit = 1) {
            try {
                let sql = 'SELECT * FROM lexicons';
                const params = [];

                if (category !== null && category !== undefined) {
                    sql += ' WHERE category = ?';
                    params.push(category);
                }

                sql += ' ORDER BY RANDOM() LIMIT ?';
                params.push(limit);

                return await contentDb.query(sql, params);
            } catch (error) {
                console.error('[ContentManager] getRandomLexicons error:', error);
                return [];
            }
        },

        // --- 地理模組 (Geography) ---

        /**
         * 取得單一地點
         */
        async getLocation(locationId) {
            return await contentDb.get('SELECT * FROM locations WHERE id = ?', [locationId]);
        },

        /**
         * 取得所有地點
         */
        async getAllLocations() {
            return await contentDb.query('SELECT * FROM locations');
        },

        /**
         * 根據經文取得相關地點
         */
        async getLocationsByVerse(book, chapter, verse = null) {
            try {
                let sql = `
                    SELECT l.* 
                    FROM locations l
                    JOIN verse_locations vl ON l.id = vl.location_id
                    JOIN bible_books b ON vl.book = b.name_zh
                    WHERE (b.name_zh = ? OR b.name_en = ? OR b.id = ?)
                    AND vl.chapter = ?
                `;
                const params = [book, book, book, chapter];

                if (verse) {
                    sql += " AND vl.verse = ?";
                    params.push(verse);
                }

                return await contentDb.query(sql, params);
            } catch (error) {
                console.error('[ContentManager] getLocationsByVerse error:', error);
                return [];
            }
        },

        /**
         * 計算指定範圍內的地點數量 (用於判斷是否出地理題)
         */
        async getLocationCount(book, startChapter, endChapter) {
            try {
                const sql = `
                    SELECT COUNT(DISTINCT l.id) as count
                    FROM locations l
                    JOIN verse_locations vl ON l.id = vl.location_id
                    JOIN bible_books b ON vl.book = b.name_zh
                    WHERE (b.name_zh = ? OR b.name_en = ? OR b.id = ?)
                    AND vl.chapter >= ? AND vl.chapter <= ?
                `;
                const row = await contentDb.get(sql, [book, book, book, startChapter, endChapter]);
                return row ? row.count : 0;
            } catch (error) {
                console.error('[ContentManager] getLocationCount error:', error);
                return 0;
            }
        },

        /**
         * 搜尋地點
         */
        async searchLocations(query) {
            return await contentDb.query('SELECT * FROM locations WHERE name_ch LIKE ? OR name_en LIKE ?', [`%${query}%`, `%${query}%`]);
        },

        // --- 書卷元數據 (Books) ---

        /**
         * 取得書卷資訊
         */
        async getBook(bookId) {
            return await contentDb.get(
                'SELECT * FROM bible_books WHERE id = ? OR name_zh = ? OR name_en = ? OR name_zh LIKE ?',
                [bookId, bookId, bookId, `%${bookId}%`]
            );
        },

        /**
         * 取得所有書卷
         */
        async getAllBooks() {
            return await contentDb.query('SELECT * FROM bible_books ORDER BY id');
        },

        /**
         * 匯入書卷資訊
         */
        async importBooks(books) {
            await contentDb.transaction(async (tx) => {
                for (const b of books) {
                    await tx.run(`
                        INSERT INTO bible_books (id, name_zh, name_en, testament, category, chapters, order_num, metadata)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT (id) DO UPDATE SET
                            name_zh = EXCLUDED.name_zh, name_en = EXCLUDED.name_en, testament = EXCLUDED.testament,
                            category = EXCLUDED.category, chapters = EXCLUDED.chapters, order_num = EXCLUDED.order_num,
                            metadata = EXCLUDED.metadata
                    `, [
                        b.id, b.name_zh, b.name_en, b.testament,
                        b.category || null, b.chapters, b.order_num || null,
                        JSON.stringify(b.metadata || {})
                    ]);
                }
            })();
            return books.length;
        },

        // --- 分類與標籤 (Taxonomy) ---

        /**
         * 取得所有分類
         */
        async getAllCategories() {
            return await contentDb.query('SELECT * FROM categories ORDER BY sort_order, name');
        },

        /**
         * 匯入分類
         */
        async importCategories(categories) {
            await contentDb.transaction(async (tx) => {
                for (const c of categories) {
                    await tx.run(`
                        INSERT INTO categories (id, code, name, series, series_name, parent_id, sort_order, description)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT (id) DO UPDATE SET
                            code = EXCLUDED.code, name = EXCLUDED.name, series = EXCLUDED.series,
                            series_name = EXCLUDED.series_name, parent_id = EXCLUDED.parent_id,
                            sort_order = EXCLUDED.sort_order, description = EXCLUDED.description
                    `, [
                        c.id,
                        c.code || c.id,
                        c.name,
                        c.series || null,
                        c.series_name || null,
                        c.parent_id || null,
                        c.sort_order || 0,
                        c.description || null
                    ]);
                }
            })();
            return categories.length;
        },

        /**
         * 為資源加標籤
         */
        async tagResource(resourceId, tagName) {
            // 先確保標籤存在 (PostgreSQL: ON CONFLICT DO NOTHING)
            await contentDb.run('INSERT INTO tags (name) VALUES (?) ON CONFLICT (name) DO NOTHING', [tagName]);
            const tag = await contentDb.get('SELECT id FROM tags WHERE name = ?', [tagName]);

            // 建立關連
            await contentDb.run('INSERT INTO resource_tags (resource_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [resourceId, tag.id]);
        },

        /**
         * 取得資源的所有標籤
         */
        async getResourceTags(resourceId) {
            return await contentDb.query(`
                SELECT t.* FROM tags t
                JOIN resource_tags rt ON t.id = rt.tag_id
                WHERE rt.resource_id = ?
            `, [resourceId]);
        },

        // --- AI 內容模組 (AI Content) ---

        /**
         * 儲存 AI 章節摘要
         * @param {string} book - 書卷名
         * @param {number|string} chapter - 章節
         * @param {string} version - 版本
         * @param {Object} jsonContent - 結構化摘要內容
         */
        async saveAISummary(book, chapter, version, jsonContent) {
            await contentDb.run(`
                INSERT INTO ai_summaries (book, chapter, version, summary_json, created_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (book, chapter, version) DO UPDATE SET
                    summary_json = EXCLUDED.summary_json, created_at = EXCLUDED.created_at
            `, [book, chapter, version, JSON.stringify(jsonContent), new Date()]);
        },

        /**
         * 取得 AI 章節摘要
         * @param {string} book 
         * @param {number|string} chapter 
         * @param {string} version 
         * @returns {Object|null} 摘要內容或 null
         */
        async getAISummary(book, chapter, version) {
            try {
                const row = await contentDb.get(`
                    SELECT summary_json FROM ai_summaries 
                    WHERE book = ? AND chapter = ? AND version = ?
                `, [book, chapter, version]);

                return row ? JSON.parse(row.summary_json) : null;
            } catch (error) {
                console.error('[ContentOps] Get AI summary error:', error);
                return null;
            }
        }
    };
}

