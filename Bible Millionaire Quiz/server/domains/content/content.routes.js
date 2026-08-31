// Cancelling
import express from 'express';
import fetch from 'node-fetch';
import { ContentManager } from './bible/ContentManager.js';
import { authenticateToken } from '../../middleware/auth.js';
import { LogosEngine } from '../../infrastructure/ai/LogosEngine.js';
import { resolveBibleVersion } from './bible/BibleVersionRegistry.js';
import {
    listPublicBibleVersions,
    searchScripture,
    sendScriptureSearchError
} from './bible/ScriptureContentService.js';

const router = express.Router();

/**
 * Bible Book Definitions (for FHL API mapping)
 */
const BIBLE_BOOKS_MAPPING = {
    // Old Testament
    '創世記': '創', '出埃及記': '出', '利未記': '利', '民數記': '民', '申命記': '申',
    '約書亞記': '書', '士師記': '士', '路得記': '得', '撒母耳記上': '撒上', '撒母耳記下': '撒下',
    '列王紀上': '王上', '列王紀下': '王下', '歷代志上': '代上', '歷代志下': '代下', '以斯拉記': '拉',
    '尼希米記': '尼', '以斯帖記': '斯', '約伯記': '伯', '詩篇': '詩', '箴言': '箴',
    '傳道書': '傳', '雅歌': '歌', '以賽亞書': '賽', '耶利米書': '耶', '耶利米哀歌': '哀',
    '以西結書': '結', '但以理書': '但', '何西阿書': '何', '約珥書': '珥', '阿摩司書': '摩',
    '俄巴底亞書': '俄', '約拿書': '拿', '彌迦書': '彌', '那鴻書': '鴻', '哈巴谷書': '哈',
    '西番雅書': '番', '哈該書': '該', '撒迦利亞書': '亞', '瑪拉基書': '瑪',
    // New Testament
    '馬太福音': '太', '馬可福音': '可', '路加福音': '路', '約翰福音': '約', '使徒行傳': '徒',
    '羅馬書': '羅', '哥林多前書': '林前', '哥林多後書': '林後', '加拉太書': '加', '以弗所書': '弗',
    '腓立比書': '腓', '歌羅西書': '西', '帖撒羅尼迦前書': '帖前', '帖撒羅尼迦後書': '帖後', '提摩太前書': '提前',
    '提摩太後書': '提後', '提多書': '多', '腓利門書': '門', '希伯來書': '來', '雅各書': '雅',
    '彼得前書': '彼前', '彼得後書': '彼後', '約翰一書': '約一', '約翰二書': '約二', '約翰三書': '約三',
    '猶大書': '猶', '啟示錄': '啟'
};

// GET /api/content/scripture
// Query: book (Chinese Name), chapter, version (default: unv)
router.get('/scripture', async (req, res) => {
    try {
        const { book, chapter, version = 'unv' } = req.query;

        console.log(`📖 [Content] Request scripture: ${book} ${chapter} (${version})`);

        if (!book || !chapter) {
            return res.status(400).json({ success: false, error: 'Missing book or chapter' });
        }

        const resolvedVersion = resolveBibleVersion(version);
        if (!resolvedVersion) {
            return res.status(400).json({ success: false, error: 'UNSUPPORTED_BIBLE_VERSION' });
        }

        // Determine locale from version (Basic mapping)
        const locale = (version === 'niv' || version === 'web' || version === 'kjv') ? 'en' : 'zh-TW';

        // Pass version directly so ContentManager uses the correct version for lookup and API calls
        const verses = await ContentManager.bible.getChapterVerses(book, chapter, version);

        if (verses && verses.length > 0) {
            return res.json({
                success: true,
                source: 'local',
                data: verses,
                version: {
                    requested: resolvedVersion.requestedVersion,
                    canonical: resolvedVersion.canonicalVersion,
                    storage: resolvedVersion.storageVersion,
                    source: resolvedVersion.sourceVersion
                }
                // Backward compatibility fields if needed by frontend
            });
        }

        return res.json({ success: true, data: [] });

    } catch (error) {
        console.error('❌ [Content] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/content/scripture/versions
// Stable public scripture capability. It is intentionally not tied to the
// optional Scripture Tools experiment flag.
router.get('/scripture/versions', async (_req, res) => {
    try {
        const versions = await listPublicBibleVersions();
        res.json({ success: true, versions });
    } catch (error) {
        console.error('❌ [Content] Scripture versions error:', error);
        res.status(500).json({
            success: false,
            error: 'SCRIPTURE_VERSIONS_FAILED',
            message: '暫時無法取得可用譯本'
        });
    }
});

// GET /api/content/scripture/search
// Search belongs to the formal Scripture Explorer, not Reading Plans.
router.get('/scripture/search', async (req, res) => {
    try {
        const result = await searchScripture({
            query: req.query.q,
            version: req.query.version,
            book: req.query.book,
            limit: req.query.limit
        });
        res.json({ success: true, ...result });
    } catch (error) {
        sendScriptureSearchError(res, error);
    }
});

// GET /api/content/devotional/history
router.get('/devotional/history', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { page = 1, limit = 10, search = '' } = req.query;
        // dbOps isn't imported here, so we must import it or use it if already imported
        const { dbOps } = await import('../../database/index.js');
        const historyData = await dbOps.getDevotionalHistory({
            page: parseInt(page),
            limit: parseInt(limit),
            search,
            userId
        });
        
        res.json({
            success: true,
            history: historyData.items || historyData.history || [],
            pagination: historyData.pagination
        });
    } catch (error) {
        console.error('❌ [Content] Devotional History Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/content/geography/locations/verse
router.get('/geography/locations/verse', async (req, res) => {
    try {
        const { book, chapter } = req.query;
        if (!book || !chapter) return res.status(400).json({ success: false, error: 'Missing book or chapter' });

        const result = await ContentManager.geography.getLocationsByVerse(book, chapter);
        if (result.success) {
            return res.json(result); // result already { success: true, data: [...] }
        } else {
            return res.status(500).json(result);
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /api/content/geography/search
router.get('/geography/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.status(400).json({ success: false, error: 'Missing query' });

        const result = await ContentManager.geography.searchLocations(q);
        return res.json(result);
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /api/content/search (Library Search)
router.get('/search', async (req, res) => {
    try {
        const { q, limit = 10, book, chapter } = req.query;
        if (!q) return res.status(400).json({ success: false, error: 'Missing query' });

        // Context for AI search
        const context = {
            query: q,
            book: book !== 'undefined' && book !== 'null' ? book : null,
            chapter: chapter !== 'undefined' && chapter !== 'null' ? parseInt(chapter) : null
        };

        // Results will be grouped by type
        const groupedResults = {
            ai: [],      // AI 智慧回答
            scripture: [], // 相關經文
            reference: []  // 參考資料
        };

        // 1. Always ask AI for intelligent, context-aware answer
        console.log(`🧠 [Search] Querying Logos Engine with context:`, context);
        try {
            const aiResponse = await LogosEngine.askBrain('knowledge_search', context);

            if (aiResponse) {
                // Add Direct Answer
                if (aiResponse.direct_answer) {
                    groupedResults.ai.push({
                        title: '💡 智慧回答',
                        type: 'AI',
                        content: aiResponse.direct_answer,
                        link: null
                    });
                }

                // Categorize AI results
                if (aiResponse.results && Array.isArray(aiResponse.results)) {
                    aiResponse.results.forEach(r => {
                        const item = {
                            title: r.title,
                            type: r.type || '資料',
                            content: r.content,
                            link: r.link
                        };

                        // Categorize by type
                        if (r.type === '經文') {
                            groupedResults.scripture.push(item);
                        } else {
                            groupedResults.reference.push(item);
                        }
                    });
                }
            }
        } catch (aiError) {
            console.error('⚠️ [Search] Logos Engine failed:', aiError.message);
        }

        // 2. Supplement with local DB search (limited to 5)
        try {
            const localResults = await ContentManager.resources.searchLibrary(q, 5);
            localResults.forEach(r => {
                // Determine display title
                const displayTitle = r.clean_title || r.title;

                // Avoid duplicates by checking title
                const isDuplicate = [...groupedResults.scripture, ...groupedResults.reference]
                    .some(existing => existing.title === displayTitle || existing.title === r.title);

                if (!isDuplicate) {
                    // Map English categories to Chinese if needed, or leave as is
                    // AI returns: Map, History, Theology, Biography, Archaeology, Scripture, Other
                    const categoryMap = {
                        'Map': '地圖', 'History': '歷史', 'Theology': '神學',
                        'Biography': '人物', 'Archaeology': '考古', 'Scripture': '經文'
                    };
                    const typeLabel = categoryMap[r.category] || r.category || '資料';

                    groupedResults.reference.push({
                        title: displayTitle,
                        type: typeLabel,
                        content: r.clean_summary || r.content?.substring(0, 200) + '...' || r.description || '',
                        link: r.url || null
                    });
                }
            });
        } catch (dbError) {
            console.error('⚠️ [Search] Local DB search failed:', dbError.message);
        }

        // 3. Flatten for backward compatibility, but include group info
        const flatResults = [
            ...groupedResults.ai,
            ...groupedResults.scripture.slice(0, 3),  // Limit scriptures
            ...groupedResults.reference.slice(0, 5)   // Limit references
        ];

        return res.json({
            success: true,
            data: flatResults,
            grouped: groupedResults  // For future grouped UI
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /api/content/fun-facts?book=創世記
// 取得指定書卷的「你知道嗎？」有趣聖經知識
router.get('/fun-facts', async (req, res) => {
    try {
        const { book } = req.query;
        if (!book) return res.status(400).json({ success: false, error: 'Missing book' });

        const result = await LogosEngine.askBrain('fun_facts', { book }, { priority: false });
        if (!result || result.error) {
            return res.status(500).json({ success: false, error: '生成失敗，請稍後再試' });
        }

        res.json({ success: true, book, facts: result.facts || [] });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

export default router;
