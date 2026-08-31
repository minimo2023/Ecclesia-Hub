/**
 * Scripture Selections API - 經文劃線和筆記
 */
import express from 'express';
import { dbOps } from '../../database/index.js';
import { authenticateToken } from '../../middleware/auth.js';

const router = express.Router();
console.log('[DEBUG] Loading scripture_selections.js routes...');

// GET /list - 獲取用戶所有的劃線和筆記
router.get('/list', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const selections = await dbOps.notesDb.prepare(`
            SELECT * FROM scripture_selections
            WHERE user_id = ?
            ORDER BY created_at DESC
        `).all(userId);

        res.json({ success: true, data: selections });
    } catch (error) {
        console.error('❌ [Selections] List Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /query - 使用 query params 獲取劃線 (解決中文編碼路徑問題)
router.get('/query', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { book, chapter } = req.query;

        if (!book || !chapter) {
            return res.status(400).json({ success: false, error: '缺少 book 或 chapter 參數' });
        }

        const selections = await dbOps.notesDb.prepare(`
            SELECT * FROM scripture_selections
            WHERE user_id = ? AND book = ? AND chapter = ?
            ORDER BY verse_start ASC
        `).all(userId, book, parseInt(chapter));

        res.json({ success: true, data: selections });
    } catch (error) {
        console.error('❌ [Selections] Query Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /chapter/:book/:chapter - 獲取特定章節的劃線和筆記 (舊版，保留兼容)
router.get('/chapter/:book/:chapter', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { book, chapter } = req.params;

        const selections = await dbOps.notesDb.prepare(`
            SELECT * FROM scripture_selections
            WHERE user_id = ? AND book = ? AND chapter = ?
            ORDER BY verse_start ASC
        `).all(userId, book, parseInt(chapter));

        res.json({ success: true, data: selections });
    } catch (error) {
        console.error('❌ [Selections] Chapter Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST / - 新增劃線或筆記
router.post('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { book, chapter, verseStart, verseEnd, type, color, noteContent, selectedText, offsetStart, offsetEnd } = req.body;

        if (!book || !chapter || !verseStart || !verseEnd || !type) {
            return res.status(400).json({ success: false, error: '缺少必要欄位' });
        }

        if (!['highlight', 'note'].includes(type)) {
            return res.status(400).json({ success: false, error: '無效的類型' });
        }

        const result = await dbOps.notesDb.prepare(`
            INSERT INTO scripture_selections (user_id, book, chapter, verse_start, verse_end, type, color, note_content, selected_text, offset_start, offset_end)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(userId, book, chapter, verseStart, verseEnd, type, color || null, noteContent || null, selectedText || null, offsetStart || null, offsetEnd || null);

        console.log(`✅ [Selections] Created ${type} for ${book} ${chapter}:${verseStart}-${verseEnd}`);
        res.json({
            success: true,
            id: result.lastInsertRowid,
            message: type === 'highlight' ? '劃線已儲存' : '筆記已儲存'
        });
    } catch (error) {
        console.error('❌ [Selections] Create Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /:id - 更新劃線或筆記
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const { color, noteContent } = req.body;

        const result = await dbOps.notesDb.prepare(`
            UPDATE scripture_selections
            SET color = COALESCE(?, color),
                note_content = COALESCE(?, note_content),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        `).run(color, noteContent, parseInt(id), userId);

        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: '找不到該記錄' });
        }

        console.log(`✅ [Selections] Updated id ${id}`);
        res.json({ success: true, message: '已更新' });
    } catch (error) {
        console.error('❌ [Selections] Update Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /:id - 刪除劃線或筆記
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        const result = await dbOps.notesDb.prepare(`
            DELETE FROM scripture_selections WHERE id = ? AND user_id = ?
        `).run(parseInt(id), userId);

        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: '找不到該記錄' });
        }

        console.log(`✅ [Selections] Deleted id ${id}`);
        res.json({ success: true, message: '已刪除' });
    } catch (error) {
        console.error('❌ [Selections] Delete Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
