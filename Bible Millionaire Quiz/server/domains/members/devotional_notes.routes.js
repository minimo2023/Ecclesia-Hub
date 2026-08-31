import express from 'express';
import { dbOps } from '../../database/index.js';
import { authenticateToken } from '../../middleware/auth.js';
import { applyCoinDeltaTx } from '../economy/AssetLedgerService.js';

const router = express.Router();

// ==== STATIC ROUTES FIRST ====

// POST /merge - Merge guest notes to user account
router.post('/merge', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { notes } = req.body;

        if (!notes || typeof notes !== 'object') {
            return res.status(400).json({ success: false, error: '無效的筆記資料' });
        }

        let mergedCount = 0;
        for (const [date, noteText] of Object.entries(notes)) {
            if (!noteText || typeof noteText !== 'string') continue;

            const exists = await dbOps.notesDb.get('SELECT id FROM devotional_notes WHERE user_id = $1 AND date = $2', [userId, date]);

            if (!exists) {
                await dbOps.notesDb.run('INSERT INTO devotional_notes (user_id, date, note) VALUES ($1, $2, $3)', [userId, date, noteText]);
                mergedCount++;
            }
        }

        console.log(`✅ [Notes] Merged ${mergedCount} guest notes for user ${userId}`);
        res.json({ success: true, mergedCount, message: `已合併 ${mergedCount} 則筆記` });
    } catch (error) {
        console.error('❌ [Notes] Merge Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /list - Get all notes for current user
router.get('/list', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        console.log(`📋 [Notes] List request for user ${userId}`);

        const notes = await dbOps.notesDb.query(
            "SELECT TO_CHAR(date, 'YYYY-MM-DD') as date, note, updated_at, false as is_draft FROM devotional_notes WHERE user_id = $1",
            [userId]
        );
        
        const drafts = await dbOps.notesDb.query(
            "SELECT TO_CHAR(date, 'YYYY-MM-DD') as date, content as note, updated_at, true as is_draft FROM public.note_drafts WHERE user_id = $1",
            [userId]
        );

        // Merge notes and drafts. If both exist for a date, prefer the draft (as it's newer/unsaved edits).
        const mergedNotesMap = new Map();
        if (notes) {
            notes.forEach(n => mergedNotesMap.set(n.date, n));
        }
        if (drafts) {
            drafts.forEach(d => {
                const existing = mergedNotesMap.get(d.date);
                if (!existing || new Date(d.updated_at || 0) > new Date(existing.updated_at || 0)) {
                    // Only override if the draft actually has content
                    if (d.note && d.note.trim()) {
                        mergedNotesMap.set(d.date, d);
                    }
                }
            });
        }
        
        const finalNotes = Array.from(mergedNotesMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date));

        const checkins = await dbOps.notesDb.query(
            "SELECT TO_CHAR(date, 'YYYY-MM-DD') as date, read_at, wrote_note_at, scripture_read_at FROM devotional_checkins WHERE user_id = $1 ORDER BY date DESC",
            [userId]
        );
        
        res.json({ success: true, notes: finalNotes || [], checkins: checkins || [] });
    } catch (error) {
        console.error('❌ [Notes] List Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Helper: Get Taiwan date string (YYYY-MM-DD)
function getTaiwanDate() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
}

function isValidDateKey(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return false;
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function validateNote(note) {
    if (typeof note !== 'string') throw new TypeError('筆記必須是文字');
    const normalized = note.trim();
    if (!normalized) throw new TypeError('筆記不可空白');
    if (normalized.length > 10000) throw new RangeError('筆記不可超過 10,000 字');
    return normalized;
}

// Helper: Calculate consecutive streak
async function calculateStreak(userId, type = 'read') {
    const column = type === 'read' ? 'read_at' : 'wrote_note_at';
    const today = getTaiwanDate();

    // Get all check-in dates with the specified action, ordered by date DESC
    // Get all check-in dates with the specified action, ordered by date DESC
    const rows = await dbOps.notesDb.query(`
        SELECT date FROM devotional_checkins
        WHERE user_id = $1 AND ${column} IS NOT NULL
        ORDER BY date DESC
    `, [userId]);

    if (rows.length === 0) return 0;

    let streak = 0;
    let expectedDate = new Date(today);

    for (const row of rows) {
        const rowDate = new Date(row.date);
        const diff = Math.round((expectedDate - rowDate) / (1000 * 60 * 60 * 24));

        if (diff === 0 || diff === 1) {
            streak++;
            expectedDate = new Date(row.date);
            expectedDate.setDate(expectedDate.getDate() - 1);
        } else {
            break; // Streak broken
        }
    }

    return streak;
}

// POST /checkin - Daily devotional check-in (+1 coin)
router.post('/checkin', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const today = getTaiwanDate();
        const coinsToAward = 1;

        // [V4.2 SOVEREIGN] 原子化簽到：嘗試插入或更新，僅當 read_at 為 NULL 時才算成功領取
        // 使用 WHERE 條件結合 ON CONFLICT，確保只有「第一次」更新會回傳 rowCount > 0
        const result = await dbOps.notesDb.run(`
            INSERT INTO public.devotional_checkins (user_id, date, read_at, read_coins_awarded)
            VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
            ON CONFLICT(user_id, date) DO UPDATE SET
                read_at = CURRENT_TIMESTAMP,
                read_coins_awarded = EXCLUDED.read_coins_awarded
            WHERE devotional_checkins.read_at IS NULL
        `, [userId, today, coinsToAward]);

        if (result.changes > 0) {
            // [SOVEREIGN v3] 原子化獎勵
            const { newBalance } = await dbOps.adjustCoins(userId, coinsToAward, 'devotion_daily_checkin');
            const readStreak = await calculateStreak(userId, 'read');
            console.log(`✅ [Checkin] User ${userId} checked in. +${coinsToAward} coin. Streak: ${readStreak} → newBalance=${newBalance}`);

            return res.json({
                success: true,
                alreadyCheckedIn: false,
                coinsAwarded: coinsToAward,
                readStreak,
                message: `簽到成功！+${coinsToAward} 金幣`
            });
        } else {
            // 已經領過獎勵
            const readStreak = await calculateStreak(userId, 'read');
            return res.json({
                success: true,
                alreadyCheckedIn: true,
                coinsAwarded: 0,
                readStreak,
                message: '今日已簽到'
            });
        }
    } catch (error) {
        console.error('❌ [Checkin] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /scripture-checkin - Daily scripture reading check-in (+1 coin)
router.post('/scripture-checkin', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const today = getTaiwanDate();
        const coinsToAward = 1;

        // [V4.2 SOVEREIGN] 原子化經文簽到：使用獨立欄位 scripture_read_at 與靈修獎勵解耦
        const result = await dbOps.notesDb.run(`
            INSERT INTO public.devotional_checkins (user_id, date, scripture_read_at, scripture_coins_awarded)
            VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
            ON CONFLICT(user_id, date) DO UPDATE SET
                scripture_read_at = CURRENT_TIMESTAMP,
                scripture_coins_awarded = EXCLUDED.scripture_coins_awarded
            WHERE devotional_checkins.scripture_read_at IS NULL
        `, [userId, today, coinsToAward]);

        if (result.changes > 0) {
            // [SOVEREIGN v3] 原子化獎勵
            const { newBalance } = await dbOps.adjustCoins(userId, coinsToAward, 'devotion_scripture_checkin');
            console.log(`✅ [Scripture] User ${userId} scripture check-in. +${coinsToAward} coin → newBalance=${newBalance}`);
            return res.json({
                success: true,
                alreadyCheckedIn: false,
                coinsAwarded: coinsToAward,
                message: `閱讀經文！+${coinsToAward} 金幣`
            });
        } else {
            return res.json({
                success: true,
                alreadyCheckedIn: true,
                coinsAwarded: 0,
                message: '今日已閱讀'
            });
        }
    } catch (error) {
        console.error('❌ [Scripture Checkin] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==== DRAFT ROUTES ====
// ⚠️ 重要：草稿路由必須在通配路由 /:date 之前定義，
// 否則 Express 會將 'draft' 誤識別為日期參數值。

// GET /draft/:date - Get draft for a specific date
router.get('/draft/:date', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { date } = req.params;

        const draft = await dbOps.getDraft(userId, date);
        res.json({ success: true, draft: draft ? draft.content : null, updatedAt: draft ? draft.updated_at : null });
    } catch (error) {
        console.error('❌ [Draft] Get Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /draft/:date - Save draft for a specific date (used by web app)
router.put('/draft/:date', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { date } = req.params;
        const { note } = req.body;

        const success = await dbOps.saveDraft(userId, date, note);
        if (success) {
            res.json({ success: true, message: '草稿已暫存' });
        } else {
            res.status(500).json({ success: false, error: '草稿儲存失敗' });
        }
    } catch (error) {
        console.error('❌ [Draft] Save Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /draft/:date - Save draft for a specific date (used by sendBeacon on mobile)
router.post('/draft/:date', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { date } = req.params;
        const { note } = req.body;

        const success = await dbOps.saveDraft(userId, date, note);
        if (success) {
            res.json({ success: true, message: '草稿已暫存' });
        } else {
            res.status(500).json({ success: false, error: '草稿儲存失敗' });
        }
    } catch (error) {
        console.error('❌ [Draft] Save Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /draft/:date - Delete draft for a specific date
router.delete('/draft/:date', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { date } = req.params;

        const success = await dbOps.deleteDraft(userId, date);
        if (success) {
            res.json({ success: true, message: '草稿已刪除' });
        } else {
            res.status(500).json({ success: false, error: '草稿刪除失敗' });
        }
    } catch (error) {
        console.error('❌ [Draft] Delete Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /:date/complete - 原子完成靈修、筆記、獎勵與草稿清理
router.post('/:date/complete', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { date } = req.params;
        if (!isValidDateKey(date)) {
            return res.status(400).json({ success: false, error: 'INVALID_DATE', message: '日期格式不正確' });
        }
        let note;
        try {
            note = validateNote(req.body?.note);
        } catch (validationError) {
            return res.status(400).json({ success: false, error: 'INVALID_NOTE', message: validationError.message });
        }

        const today = getTaiwanDate();
        const result = await dbOps.notesDb.transaction(async tx => {
            await tx.run(`
                INSERT INTO public.devotional_notes (user_id, date, note, updated_at)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, date) DO UPDATE SET
                    note = EXCLUDED.note,
                    updated_at = CURRENT_TIMESTAMP
            `, [userId, date, note]);
            await tx.run(`
                INSERT INTO public.devotional_checkins (user_id, date)
                VALUES ($1, $2)
                ON CONFLICT (user_id, date) DO NOTHING
            `, [userId, date]);
            const checkin = await tx.get(`
                SELECT read_at, wrote_note_at, read_coins_awarded, note_coins_awarded
                FROM public.devotional_checkins
                WHERE user_id = $1 AND date = $2
                FOR UPDATE
            `, [userId, date]);
            const firstRead = !checkin.readAt;
            const firstNote = !checkin.wroteNoteAt;
            await tx.run(`
                UPDATE public.devotional_checkins
                SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP),
                    wrote_note_at = COALESCE(wrote_note_at, CURRENT_TIMESTAMP)
                WHERE user_id = $1 AND date = $2
            `, [userId, date]);

            let coinsAwarded = 0;
            let balance;
            if (date === today && firstNote) {
                const reward = await applyCoinDeltaTx(tx, {
                    userId,
                    delta: 2,
                    reasonCode: 'devotion_daily_note',
                    sourceId: date,
                    idempotencyKey: `devotional:${userId}:${date}:note`
                });
                if (!reward.duplicate) coinsAwarded += 2;
                balance = reward.balance;
                await tx.run(`
                    UPDATE public.devotional_checkins SET note_coins_awarded = 2
                    WHERE user_id = $1 AND date = $2
                `, [userId, date]);
            }
            if (date === today && firstRead) {
                const reward = await applyCoinDeltaTx(tx, {
                    userId,
                    delta: 1,
                    reasonCode: 'devotion_daily_complete',
                    sourceId: date,
                    idempotencyKey: `devotional:${userId}:${date}:complete`
                });
                if (!reward.duplicate) coinsAwarded += 1;
                balance = reward.balance;
                await tx.run(`
                    UPDATE public.devotional_checkins SET read_coins_awarded = 1
                    WHERE user_id = $1 AND date = $2
                `, [userId, date]);
            }
            await tx.run('DELETE FROM public.note_drafts WHERE user_id = $1 AND date = $2', [userId, date]);
            return { firstRead, firstNote, coinsAwarded, balance };
        });

        const [readStreak, noteStreak] = await Promise.all([
            calculateStreak(userId, 'read'),
            calculateStreak(userId, 'note')
        ]);
        return res.json({
            success: true,
            date,
            note,
            coinsAwarded: result.coinsAwarded,
            alreadyCompleted: !result.firstRead && !result.firstNote,
            balance: result.balance,
            readStreak,
            noteStreak,
            message: result.coinsAwarded ? `今日靈修已完成，獲得 ${result.coinsAwarded} 金幣` : '今日靈修已完成'
        });
    } catch (error) {
        console.error('❌ [Devotional Complete] Error:', error);
        return res.status(500).json({ success: false, error: 'COMPLETE_FAILED', message: '完成靈修失敗，原資料未被部分寫入' });
    }
});

// ==== PARAMETERIZED ROUTES ====

// GET /:date - Get user's note and checkin status for a specific date
router.get('/:date', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { date } = req.params;

        console.log(`📖 [Notes] Get note for user ${userId}, date ${date}`);

        const [noteRow, checkinRow] = await Promise.all([
            dbOps.notesDb.get('SELECT note FROM devotional_notes WHERE user_id = $1 AND date = $2', [userId, date]),
            dbOps.notesDb.get('SELECT read_at FROM public.devotional_checkins WHERE user_id = $1 AND date = $2', [userId, date])
        ]);

        const note = noteRow ? noteRow.note : '';
        const hasCheckedIn = checkinRow ? checkinRow.read_at !== null : false;

        res.json({ success: true, note, date, hasCheckedIn });
    } catch (error) {
        console.error('❌ [Notes] Get Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /:date - Save user's note for a specific date
router.post('/:date', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { date } = req.params;
        const { note } = req.body;
        const today = getTaiwanDate();

        console.log(`📝 [Notes] Saving note for user ${userId}, date ${date}, length ${note?.length || 0}`);

        // Save the note
        await dbOps.notesDb.run(`
            INSERT INTO devotional_notes (user_id, date, note, updated_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, date) DO UPDATE SET
                note = EXCLUDED.note,
                updated_at = CURRENT_TIMESTAMP
        `, [userId, date, note]);

        // Check for coin reward (only for today's note, first time)
        let coinsAwarded = 0;
        let noteStreak = 0;

        if (date === today) {
            const potentialReward = 2;

            // [V4.2 SOVEREIGN] 原子化筆記獎勵：嘗試插入或更新紀錄，僅當 wrote_note_at 為空時觸發受影響行數
            const result = await dbOps.notesDb.run(`
                INSERT INTO public.devotional_checkins (user_id, date, wrote_note_at, note_coins_awarded)
                VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
                ON CONFLICT(user_id, date) DO UPDATE SET
                    wrote_note_at = CURRENT_TIMESTAMP,
                    note_coins_awarded = EXCLUDED.note_coins_awarded
                WHERE devotional_checkins.wrote_note_at IS NULL
            `, [userId, today, potentialReward]);

            if (result.changes > 0) {
                coinsAwarded = potentialReward;
                // [SOVEREIGN v3] 原子化獎勵
                const { newBalance } = await dbOps.adjustCoins(userId, coinsAwarded, 'devotion_daily_note');
                console.log(`✅ [Notes] First note of day for user ${userId}. +${coinsAwarded} coins → newBalance=${newBalance}`);
            }

            noteStreak = await calculateStreak(userId, 'note');
        }

        console.log(`✅ [Notes] Saved note for user ${userId}, date ${date}`);
        res.json({
            success: true,
            message: coinsAwarded > 0 ? `筆記已儲存！+${coinsAwarded} 金幣` : '筆記已儲存',
            date,
            coinsAwarded,
            noteStreak
        });
    } catch (error) {
        console.error('❌ [Notes] Save Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /:date - Delete user's note for a specific date
router.delete('/:date', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { date } = req.params;

        console.log(`🗑️ [Notes] Deleting note for user ${userId}, date ${date}`);

        await dbOps.notesDb.run('DELETE FROM devotional_notes WHERE user_id = $1 AND date = $2', [userId, date]);

        console.log(`✅ [Notes] Deleted note for user ${userId}, date ${date}`);
        res.json({ success: true, message: '筆記已刪除' });
    } catch (error) {
        console.error('❌ [Notes] Delete Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
