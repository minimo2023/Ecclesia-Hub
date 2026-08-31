/**
 * Feedback API Routes
 * 用戶意見回饋 CRUD 操作
 */

import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import MailService from '../MailService.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Go up THREE directories: feedback/ -> infrastructure/ -> server/ -> app root
// Docker volume mounts to /app/data, not /app/server/data
const FEEDBACK_FILE = path.join(__dirname, '../../../data/feedback.json');

// In-memory storage with file persistence
let feedbackStore = [];

try {
    if (fs.existsSync(FEEDBACK_FILE)) {
        feedbackStore = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf-8'));
        console.log(`📬 Loaded ${feedbackStore.length} feedback items`);
    }
} catch (e) {
    console.warn('Could not load feedback file:', e.message);
}

const saveFeedback = () => {
    try {
        const dir = path.dirname(FEEDBACK_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedbackStore, null, 2));
    } catch (e) {
        console.error('Error saving feedback:', e);
    }
};

// GET /api/feedback - 獲取所有回饋
router.get('/', (req, res) => {
    res.json(feedbackStore);
});

// POST /api/feedback - 新增回饋
router.post('/', async (req, res) => {
    const { type, message, contact, userAgent } = req.body;

    if (!message || !message.trim()) {
        return res.status(400).json({ error: '訊息不能為空' });
    }

    const feedback = {
        id: crypto.randomUUID(),
        type: type || 'suggestion',
        message: message.trim(),
        contact: contact || null,
        userAgent: userAgent || null,
        createdAt: Date.now(),
        status: 'pending'
    };

    feedbackStore.unshift(feedback);
    saveFeedback();

    console.log(`📬 New feedback received: [${feedback.type}] ${feedback.message.substring(0, 50)}...`);

    // Send email notification
    try {
        const typeLabels = {
            'bug': '問題回報',
            'suggestion': '功能建議',
            'question': '使用疑問'
        };
        const label = typeLabels[feedback.type] || feedback.type;
        
        await MailService.send({
            to: 'biblewisdom.suppor@hotmail.com',
            subject: `[Bible Quiz 回饋] ${label}`,
            text: `收到新的意見回饋：

類型：${label}
時間：${new Date(feedback.createdAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
聯絡方式：${feedback.contact || '未提供'}
UserAgent: ${feedback.userAgent || '未提供'}

詳細說明：
${feedback.message}
`
        });
        console.log(`📧 Email notification sent successfully to biblewisdom.suppor@hotmail.com`);
    } catch (err) {
        console.error(`📧 Error sending email notification:`, err);
    }

    res.status(201).json(feedback);
});

// PATCH /api/feedback/:id - 更新回饋狀態
router.patch('/:id', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const index = feedbackStore.findIndex(f => f.id === id);
    if (index === -1) {
        return res.status(404).json({ error: '找不到此回饋' });
    }

    feedbackStore[index] = { ...feedbackStore[index], status };
    saveFeedback();

    res.json(feedbackStore[index]);
});

// DELETE /api/feedback/:id - 刪除回饋
router.delete('/:id', (req, res) => {
    const { id } = req.params;

    const index = feedbackStore.findIndex(f => f.id === id);
    if (index === -1) {
        return res.status(404).json({ error: '找不到此回饋' });
    }

    feedbackStore.splice(index, 1);
    saveFeedback();

    res.json({ success: true });
});

export default router;
