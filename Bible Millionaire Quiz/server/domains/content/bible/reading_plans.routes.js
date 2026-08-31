import express from 'express';
import { dbOps } from '../../../database/index.js';
import { authenticateToken } from '../../../middleware/auth.js';
import { resolveBibleVersion } from './BibleVersionRegistry.js';
import { presentBibleChapterVerses } from './BibleTextPresentation.js';
import { listPublicBibleVersions } from './ScriptureContentService.js';
import ReadingPlanService, { ReadingPlanError, taiwanDateKey } from './ReadingPlanService.js';

const router = express.Router();

const sendReadingPlanError = (res, error, label) => {
    console.error(label, error);
    if (error instanceof ReadingPlanError) {
        return res.status(error.status).json({ success: false, error: error.code, message: error.message });
    }
    return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: '伺服器暫時無法處理讀經計畫' });
};

const CHINESE_TO_ENGLISH_BOOKS = {
    "創世記": "Genesis", "出埃及記": "Exodus", "利未記": "Leviticus", "民數記": "Numbers", "申命記": "Deuteronomy",
    "約書亞記": "Joshua", "士師記": "Judges", "路得記": "Ruth", "撒母耳記上": "1 Samuel", "撒母耳記下": "2 Samuel",
    "列王紀上": "1 Kings", "列王紀下": "2 Kings", "歷代志上": "1 Chronicles", "歷代志下": "2 Chronicles", "以斯拉記": "Ezra",
    "尼希米記": "Nehemiah", "以斯帖記": "Esther", "約伯記": "Job", "詩篇": "Psalms", "箴言": "Proverbs",
    "傳道書": "Ecclesiastes", "雅歌": "Song of Solomon", "以賽亞書": "Isaiah", "耶利米書": "Jeremiah", "耶利米哀歌": "Lamentations",
    "以西結書": "Ezekiel", "但以理書": "Daniel", "何西阿書": "Hosea", "約珥書": "Joel", "阿摩司書": "Amos",
    "俄巴底亞書": "Obadiah", "約拿書": "Jonah", "彌迦書": "Micah", "那鴻書": "Nahum", "哈巴谷書": "Habakkuk",
    "西番雅書": "Zephaniah", "哈該書": "Haggai", "撒迦利亞書": "Zechariah", "瑪拉基書": "Malachi",
    "馬太福音": "Matthew", "馬可福音": "Mark", "路加福音": "Luke", "約翰福音": "John", "使徒行傳": "Acts",
    "羅馬書": "Romans", "哥林多前書": "1 Corinthians", "哥林多後書": "2 Corinthians", "加拉太書": "Galatians", "以弗所書": "Ephesians",
    "腓立比書": "Philippians", "歌羅西書": "Colossians", "帖撒羅尼迦前書": "1 Thessalonians", "帖撒羅尼迦後書": "2 Thessalonians", "提摩太前書": "1 Timothy",
    "提摩太後書": "2 Timothy", "提多書": "Titus", "腓利門書": "Philemon", "希伯來書": "Hebrews", "雅各書": "James",
    "彼得前書": "1 Peter", "彼得後書": "2 Peter", "約翰一書": "1 John", "約翰二書": "2 John", "約翰三書": "3 John",
    "猶大書": "Jude", "啟示錄": "Revelation"
};

/**
 * @route GET /api/bible/versions
 * @desc Get available bible versions
 */
router.get('/versions', async (req, res) => {
    try {
        const versions = await listPublicBibleVersions();
        res.json({ versions });
    } catch (error) {
        console.error('Fetch versions error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/bible/fetch-local
 * @desc Get bible verses from local database
 */
router.get('/fetch-local', async (req, res) => {
    try {
        const { book, chapter, verse_start, verse_end, version } = req.query;
        if (!book || !chapter) {
            return res.status(400).json({ error: 'Missing book or chapter parameters' });
        }
        
        const resolvedVersion = resolveBibleVersion(version || 'CUV_TRAD');
        if (!resolvedVersion) {
            return res.status(400).json({ error: 'Unsupported bible version' });
        }
        const targetVersion = resolvedVersion.storageVersion;
        let query = 'SELECT * FROM bible_verses WHERE book = $1 AND chapter = $2 AND version = $3';
        let params = [book, chapter, targetVersion];
        
        let paramIndex = 4;
        if (verse_start && verse_end) {
            query += ` AND verse >= $${paramIndex} AND verse <= $${paramIndex + 1}`;
            params.push(verse_start, verse_end);
        } else if (verse_start) {
            query += ` AND verse >= $${paramIndex}`;
            params.push(verse_start);
        }
        
        query += ' ORDER BY verse ASC';

        const result = await dbOps.contentDb.query(query, params);
        
        res.json({
            verses: result.rows || result,
            version: {
                requested: version || 'CUV_TRAD',
                canonical: resolvedVersion.canonicalVersion,
                storage: resolvedVersion.storageVersion,
                source: resolvedVersion.sourceVersion
            }
        });
    } catch (error) {
        console.error('Fetch local bible error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route POST /api/bible/reading-plans/wizard-preview
 * @desc Generate a preview of a reading plan based on wizard selections
 */
router.post('/reading-plans/wizard-preview', authenticateToken, async (req, res) => {
    try {
        const result = ReadingPlanService.preview(req.body || {});
        res.json({
            success: true,
            preview: result.schedule.slice(0, 7).map(item => ({
                day: item.dayNumber,
                date: item.assignedDate,
                range: item.scriptureReferences.map(ref => `${ref.book} ${ref.chapter}章`).join('、')
            })),
            estimated_days: result.summary.actualReadingDays,
            summary: result.summary,
            warning: result.summary.highLoad ? `最高單日需閱讀 ${result.summary.maxChaptersPerDay} 章` : null
        });
    } catch (error) {
        sendReadingPlanError(res, error, 'Wizard preview error:');
    }
});

/**
 * @route POST /api/bible/reading-plans/start
 * @desc Start a reading plan and save schedule
 */
router.post('/reading-plans/start', authenticateToken, async (req, res) => {
    try {
        const result = await ReadingPlanService.create(req.user.userId, req.body || {});
        res.json({ success: true, user_plan_id: result.userPlanId, summary: result });
    } catch (error) {
        sendReadingPlanError(res, error, 'Start plan error:');
    }
});

/**
 * @route GET /api/bible/reading-plans/history
 * @desc Get user's completed reading plans and flat list of completed books
 */
router.get('/reading-plans/history', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const historyResult = await dbOps.notesDb.query(`
            SELECT 
                urp.id AS user_plan_id, 
                rp.title, 
                rp.target_ranges, 
                urp.started_at,
                (SELECT MAX(completed_at) FROM public.user_reading_schedule WHERE user_plan_id = urp.id) AS completed_date,
                (SELECT COUNT(*) FROM public.user_reading_schedule WHERE user_plan_id = urp.id) AS total_days
            FROM public.user_reading_plans urp
            JOIN public.reading_plans rp ON urp.plan_id = rp.id
            WHERE urp.user_id = $1
            AND EXISTS (
                SELECT 1 FROM public.user_reading_schedule WHERE user_plan_id = urp.id
            )
            AND NOT EXISTS (
                SELECT 1 FROM public.user_reading_schedule WHERE user_plan_id = urp.id AND completed_at IS NULL
            )
            ORDER BY completed_date DESC
        `, [userId]);

        const history = [];
        const completedBooksSet = new Set();

        for (const row of (historyResult || [])) {
            let targetBooks = [];
            try {
                const tr = row.targetRanges || row.target_ranges;
                if (typeof tr === 'string') {
                    targetBooks = JSON.parse(tr);
                } else if (Array.isArray(tr)) {
                    targetBooks = tr;
                }
            } catch (e) {
                console.warn('Failed to parse target_ranges', row.targetRanges || row.target_ranges);
            }
            
            targetBooks.forEach(b => completedBooksSet.add(b));

            history.push({
                userPlanId: row.userPlanId || row.user_plan_id,
                title: row.title === '自訂讀經計畫' && targetBooks.length > 0 ? `自訂範圍 (${targetBooks.length} 卷)` : row.title,
                duration: parseInt(row.totalDays || row.total_days || 0),
                completedAt: row.completedDate || row.completed_date,
                books: targetBooks
            });
        }

        res.json({
            success: true,
            history,
            completedBooks: Array.from(completedBooksSet)
        });
    } catch (error) {
        console.error('Fetch history error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/bible/reading-plans/my-plan
 * @desc Get the current user's active reading plan with today's schedule
 */
router.get('/reading-plans/my-plan', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const today = taiwanDateKey();
        const activePlan = await ReadingPlanService.getActivePlan(userId);
        if (!activePlan) {
            return res.json({ success: true, plan: null });
        }
        const schedules = activePlan.schedules || [];
        const total = schedules.length;
        const completed = schedules.filter(item => item.completedAt).length;
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
        const incomplete = schedules.filter(item => !item.completedAt);
        const todaySchedule = incomplete[0];
        const upcoming = incomplete.slice(1, 3).map((s, i) => ({
            day: s.dayNumber,
            target: (() => {
                const refs = typeof s.scriptureReferences === 'string' ? JSON.parse(s.scriptureReferences) : s.scriptureReferences;
                try { return Array.isArray(refs) ? refs.map(r => `${r.book} ${r.chapter}章`).join('、') : refs; }
                catch { return refs; }
            })(),
            date: i === 0 ? '明天' : '後天',
        }));
        const behindDays = incomplete.filter(item => String(item.assignedDate).slice(0, 10) < today).length;

        res.json({
            success: true,
            plan: {
                id: activePlan.id,
                title: activePlan.planName || '我的讀經計畫',
                progress,
                currentDay: Math.min(completed + 1, total || 1),
                totalDays: total,
                todayTarget: todaySchedule ? (() => {
                    const refs = typeof todaySchedule.scriptureReferences === 'string' ? JSON.parse(todaySchedule.scriptureReferences) : todaySchedule.scriptureReferences;
                    try { return Array.isArray(refs) ? refs.map(r => `${r.book} ${r.chapter}章`).join('、') : refs; }
                    catch { return refs; }
                })() : '今日已完成',
                scheduleId: todaySchedule?.id ?? null,
                behindDays,
                upcoming,
                resyncNotice: activePlan.resyncNoticePending ? activePlan.lastResyncSummary : null
            }
        });
        if (activePlan.resyncNoticePending) {
            await dbOps.notesDb.run('UPDATE public.user_reading_plans SET resync_notice_pending = FALSE WHERE id = $1 AND user_id = $2', [activePlan.id, userId]);
        }
    } catch (error) {
        sendReadingPlanError(res, error, 'Fetch my-plan error:');
    }
});

/**
 * @route DELETE /api/bible/reading-plans/my-plan/:id
 * @desc Cancel an active reading plan
 */
router.delete('/reading-plans/my-plan/:id', authenticateToken, async (req, res) => {
    try {
        const result = await ReadingPlanService.abandon(req.user.userId, req.params.id);
        res.json({ success: true, status: result.status, message: '讀經計畫已放棄，歷史紀錄已保留' });
    } catch (error) {
        sendReadingPlanError(res, error, 'Abandon plan error:');
    }
});

/**
 * @route GET /api/bible/reading-plans/schedule/:id/verses
 * @desc Fetch verses for a specific schedule ID
 */
router.get('/reading-plans/schedule/:id/verses', authenticateToken, async (req, res) => {
    try {
        const scheduleId = req.params.id;
        const schedule = await ReadingPlanService.getOwnedSchedule(scheduleId, req.user.userId);
        const refs = schedule.scriptureReferences;
        if (!Array.isArray(refs) || refs.length === 0) {
            return res.json({ verses: [], references: [], chapterTitle: '未指定經文' });
        }
        const requestedIndex = Number(req.query.chapter_index ?? 0);
        const chapterIndex = Number.isInteger(requestedIndex) && requestedIndex >= 0 && requestedIndex < refs.length
            ? requestedIndex
            : 0;
        const activeRef = refs[chapterIndex];
        const book = activeRef.book;
        const chapter = activeRef.chapter;
        const englishBookName = CHINESE_TO_ENGLISH_BOOKS[book] || book;
        const resolvedVersion = resolveBibleVersion(req.query.version || 'CUV_TRAD');
        if (!resolvedVersion) {
            return res.status(400).json({ success: false, error: 'UNSUPPORTED_VERSION', message: '不支援的聖經譯本' });
        }
        const verseQuery = 'SELECT * FROM bible_verses WHERE book = $1 AND chapter = $2 AND version = $3 ORDER BY verse ASC';
        const verseResult = await dbOps.contentDb.query(verseQuery, [englishBookName, chapter, resolvedVersion.storageVersion]);
        
        const rows = verseResult.rows || verseResult || [];
        res.json({
            verses: presentBibleChapterVerses(rows),
            chapterTitle: `${book} ${chapter}章`,
            book,
            chapter,
            references: refs,
            chapterIndex,
            chapterCount: refs.length,
            version: resolvedVersion.canonicalVersion
        });
    } catch (error) {
        sendReadingPlanError(res, error, 'Fetch schedule verses error:');
    }
});

/**
 * @route POST /api/bible/reading-plans/schedule/resync
 * @desc Reschedule incomplete items
 */
router.post('/reading-plans/schedule/resync', authenticateToken, async (req, res) => {
    try {
        const { user_plan_id, strategy } = req.body;
        const summary = await ReadingPlanService.resync(req.user.userId, user_plan_id, strategy);
        res.json({ success: true, message: '讀經排程已依設定更新', summary });
    } catch (error) {
        sendReadingPlanError(res, error, 'Resync plan error:');
    }
});

/**
 * @route POST /api/bible/reading-plans/schedule/:id/complete
 * @desc Mark a scheduled day as completed and trigger devotional checkin
 */
router.post('/reading-plans/schedule/:id/complete', authenticateToken, async (req, res) => {
    try {
        const result = await ReadingPlanService.complete(req.user.userId, req.params.id);
        res.json({ success: true, message: '今日讀經已完成', ...result });
    } catch (error) {
        sendReadingPlanError(res, error, 'Complete reading error:');
    }
});

export default router;
