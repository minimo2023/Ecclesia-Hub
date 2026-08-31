import { dbOps } from '../database/index.js';
import { generateHashExact, generateSigSemantic } from './hasher.js';

/**
 * 驗證單一題目是否符合規則
 * @param {Object} question - 待驗證的題目物件 (AI 產出)
 * @param {Object} selection - 玩家的選擇範圍 { books: ['Genesis'], chapters: { 'Genesis': [1, 50] } }
 * @returns {Object} { valid: boolean, reason: string, enrichedData: Object }
 */
export async function validateQuestion(question, selection) {
    if (!question) {
        return { valid: false, reason: '題目物件為空' };
    }
    // 1. 基本結構驗證
    if (!question.question || !question.options || !Array.isArray(question.options) || question.options.length !== 4) {
        return { valid: false, reason: '結構錯誤：選項不足 4 個或題幹為空' };
    }

    if (!['A', 'B', 'C', 'D'].includes(question.answer)) {
        // 嘗試自動修正答案 (如果 AI 給的是選項內容)
        const idx = question.options.indexOf(question.answer);
        if (idx !== -1) {
            question.answer = ['A', 'B', 'C', 'D'][idx];
        } else {
            return { valid: false, reason: '答案無效：必須是 A, B, C, D 之一' };
        }
    }

    // 1.5 選項相似度檢查 (防止「三天」vs「三個日子」這種模糊選項)
    const similarityCheck = checkOptionsSimilarity(question.options);
    if (!similarityCheck.valid) {
        return { valid: false, reason: similarityCheck.reason };
    }

    // 2. 範圍驗證 (嚴格鎖定)
    // selection.books 是陣列，例如 ['Genesis']
    // selection.chapters 是 Map 或物件，例如 { 'Genesis': { start: 1, end: 50 } } 或 { 'Genesis': [1, 50] }

    // 標準化輸入書卷名 (AI 有時會回傳中文或英文，這裡假設 AI 回傳英文 ID 或需轉換)
    // 暫時假設 AI 回傳的 book 必須在 selection.books 列表中 (字串比對)
    // 為了容錯，建議在 prompt 中強制 AI 回傳英文 ID

    // 如果 selection 為空 (全範圍模式)，則跳過範圍檢查
    if (selection && selection.books && selection.books.length > 0) {
        const isBookValid = selection.books.some(b =>
            b.toLowerCase() === question.book.toLowerCase() ||
            (question.book_zh && b.includes(question.book_zh)) // 簡單容錯
        );

        if (!isBookValid) {
            return { valid: false, reason: `書卷越界：題目在 ${question.book}，但玩家只選了 ${selection.books.join(', ')}` };
        }

        // 章節檢查
        // 優先使用新版單一 chapter 合約
        const qStart = question.chapter || 0;
        const qEnd = question.chapter || 0;

        // 取得該書卷的允許範圍
        // 支援多種 selection 格式
        let allowStart = 1, allowEnd = 150;

        // 查找對應書卷的設定
        const bookKey = selection.books.find(b => b.toLowerCase() === question.book.toLowerCase());
        if (bookKey && selection.chapters) {
            const range = selection.chapters.find ? selection.chapters.find(c => c.book === bookKey) : selection.chapters[bookKey];
            if (range) {
                // range 可能是 { start: 1, end: 50 } 或 [1, 50]
                allowStart = range.startChapter || range[0] || 1;
                allowEnd = range.endChapter || range[1] || 150;
            }
        }

        if (qStart < allowStart || qEnd > allowEnd) {
            return { valid: false, reason: `章節越界：題目在 ${qStart}-${qEnd}，但範圍限制在 ${allowStart}-${allowEnd}` };
        }
    }

    // 3. 經文對齊驗證 (Evidence Check) - 建議有經文依據但不強制
    // 注意：前端 prompt (379 lines) 沒有定義 evidence_ref/evidence_quote 欄位
    // 因此這些欄位是可選的，若缺少只記錄警告，不拒絕題目
    if (!question.evidence_ref || !question.evidence_quote) {
        console.warn(`⚠️ 題目缺少經文佐證，建議未來補充: ${(question.question || '').substring(0, 30)}...`);
        // 設置預設值以避免後續處理錯誤
        question.evidence_ref = question.evidence_ref || '';
        question.evidence_quote = question.evidence_quote || '';
    }

    // 4. 去重驗證 (Deduplication)
    const hashExact = generateHashExact(
        question.book,
        question.chapter || qStart,
        question.question,
        question.options,
        question.answer
    );

    const sigSemantic = generateSigSemantic(
        question.book,
        question.chapter || qStart,
        question.question,
        question.options,
        question.answer
    );

    // 查詢 DB 是否已存在
    // 注意：已更新為異步 dbOps.get() 以支援 Postgres
    const existingExact = await dbOps.get('questions', { hash_exact: hashExact });
    if (existingExact) {
        return { valid: false, reason: '題目重複：完全相同的題目已存在' };
    }

    // 語意重複檢查 (可選，視效能而定)
    const existingSemantic = await dbOps.get('questions', { sig_semantic: sigSemantic });
    if (existingSemantic) {
        return { valid: false, reason: '題目重複：高度相似的題目已存在' };
    }

    // 5. 擴充資料 (Enrichment - Phase 2 簡約版)
    const enrichedQuestion = {
        ...question,
        chapter: question.chapter || qStart,
        hash_exact: hashExact,
        sig_semantic: sigSemantic,
        quality: 'normal',
        status: 'PASS',
        updated_at: Math.floor(Date.now() / 1000)
    };

    return { valid: true, enrichedData: enrichedQuestion };
}

/**
 * 檢查選項之間的相似度
 * 防止出現「三天」vs「三個日子」、「摩西」vs「摩西的」這類模糊選項
 */
function checkOptionsSimilarity(options) {
    // 正規化函式：移除空白、標點、統一數字表示
    const normalize = (str) => {
        return str
            .replace(/\s+/g, '')
            .replace(/[，。、！？：；「」『』（）\[\]【】]/g, '')
            .replace(/一/g, '1').replace(/二|兩/g, '2').replace(/三/g, '3')
            .replace(/四/g, '4').replace(/五/g, '5').replace(/六/g, '6')
            .replace(/七/g, '7').replace(/八/g, '8').replace(/九/g, '9')
            .replace(/十/g, '10').replace(/百/g, '00').replace(/千/g, '000')
            .replace(/個|位|隻|條|座|次|年|月|日|天|歲/g, '') // 移除量詞
            .toLowerCase();
    };

    // 計算相似度 (Jaccard-like)
    const similarity = (a, b) => {
        const setA = new Set(a.split(''));
        const setB = new Set(b.split(''));
        const intersection = [...setA].filter(x => setB.has(x)).length;
        const union = new Set([...setA, ...setB]).size;
        return union === 0 ? 0 : intersection / union;
    };

    const normalized = options.map(normalize);

    // 檢查每對選項
    for (let i = 0; i < normalized.length; i++) {
        for (let j = i + 1; j < normalized.length; j++) {
            // 完全相同 (正規化後)
            if (normalized[i] === normalized[j]) {
                return { valid: false, reason: `選項重複或過於相似：「${options[i]}」與「${options[j]}」` };
            }

            // 高相似度 (>0.8)
            const sim = similarity(normalized[i], normalized[j]);
            if (sim > 0.8) {
                return { valid: false, reason: `選項過於相似 (${Math.round(sim * 100)}%)：「${options[i]}」與「${options[j]}」` };
            }

            // 其中一個是另一個的子集
            if (normalized[i].includes(normalized[j]) || normalized[j].includes(normalized[i])) {
                // 只有當長度差異小時才算相似
                if (Math.abs(normalized[i].length - normalized[j].length) <= 2) {
                    return { valid: false, reason: `選項過於相似（包含關係）：「${options[i]}」與「${options[j]}」` };
                }
            }
        }
    }

    return { valid: true };
}
