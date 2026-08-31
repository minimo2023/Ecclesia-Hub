/**
 * Reference Pipeline - Step 2: 經文識別
 * 模組化、輕便設計
 */

import crypto from 'crypto';
import { getDb, saveDb, queryAll } from './utils.js';

// 書卷名稱對照（簡化版）
const BOOKS = {
    '創': '創世記', '出': '出埃及記', '利': '利未記', '民': '民數記', '申': '申命記',
    '書': '約書亞記', '士': '士師記', '得': '路得記', '撒上': '撒母耳記上', '撒下': '撒母耳記下',
    '王上': '列王紀上', '王下': '列王紀下', '代上': '歷代志上', '代下': '歷代志下',
    '拉': '以斯拉記', '尼': '尼希米記', '斯': '以斯帖記', '伯': '約伯記',
    '詩': '詩篇', '箴': '箴言', '傳': '傳道書', '歌': '雅歌',
    '賽': '以賽亞書', '耶': '耶利米書', '哀': '耶利米哀歌', '結': '以西結書', '但': '但以理書',
    '何': '何西阿書', '珥': '約珥書', '摩': '阿摩司書', '俄': '俄巴底亞書',
    '拿': '約拿書', '彌': '彌迦書', '鴻': '那鴻書', '哈': '哈巴谷書',
    '番': '西番雅書', '該': '哈該書', '亞': '撒迦利亞書', '瑪': '瑪拉基書',
    '太': '馬太福音', '可': '馬可福音', '路': '路加福音', '約': '約翰福音',
    '徒': '使徒行傳', '羅': '羅馬書', '林前': '哥林多前書', '林後': '哥林多後書',
    '加': '加拉太書', '弗': '以弗所書', '腓': '腓立比書', '西': '歌羅西書',
    '帖前': '帖撒羅尼迦前書', '帖後': '帖撒羅尼迦後書', '提前': '提摩太前書', '提後': '提摩太後書',
    '多': '提多書', '門': '腓利門書', '來': '希伯來書', '雅': '雅各書',
    '彼前': '彼得前書', '彼後': '彼得後書', '約壹': '約翰一書', '約貳': '約翰二書',
    '約參': '約翰三書', '猶': '猶大書', '啟': '啟示錄'
};

// 全名也加入
Object.values(BOOKS).forEach(name => { BOOKS[name] = name; });

/**
 * 從文字中提取經文引用
 */
export function extractRefs(text) {
    const bookNames = Object.keys(BOOKS).sort((a, b) => b.length - a.length).join('|');
    const regex = new RegExp(`(${bookNames})\\s*(\\d+)\\s*[章:：]\\s*(\\d+)(?:\\s*[-–~至]\\s*(\\d+))?`, 'g');

    const refs = [];
    const seen = new Set();
    let match;

    while ((match = regex.exec(text)) !== null) {
        const book = BOOKS[match[1]];
        const chapter = parseInt(match[2]);
        const verseStart = parseInt(match[3]);
        const verseEnd = match[4] ? parseInt(match[4]) : verseStart;

        const key = `${book}-${chapter}:${verseStart}-${verseEnd}`;
        if (!seen.has(key)) {
            seen.add(key);
            refs.push({
                book,
                chapter_start: chapter,
                verse_start: verseStart,
                chapter_end: chapter,
                verse_end: verseEnd,
                confidence: 0.7  // 正則識別預設
            });
        }
    }

    return refs;
}

/**
 * 批次識別
 */
export async function recognizeBatch(categoryId, limit = 50) {
    const db = await getDb();

    const resources = queryAll(`
        SELECT et.resource_id, et.content, r.title
        FROM extracted_text et
        JOIN resources r ON et.resource_id = r.id
        WHERE r.category_id = ?
          AND NOT EXISTS (
              SELECT 1 FROM resource_verses rv 
              WHERE rv.resource_id = et.resource_id
          )
        LIMIT ?
    `, [categoryId, limit]);

    console.log(`📊 待識別: ${resources.length}`);

    let totalRefs = 0;

    for (const res of resources) {
        process.stdout.write(`  ${res.title.substring(0, 25)}...`);

        try {
            const data = JSON.parse(res.content);
            const text = data.paragraphs.join('\n');
            const refs = extractRefs(text);

            for (const ref of refs) {
                db.run(`
                    INSERT OR IGNORE INTO resource_verses 
                    (id, resource_id, book, chapter_start, verse_start, chapter_end, verse_end, confidence, source)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ai')
                `, [crypto.randomUUID(), res.resource_id, ref.book, ref.chapter_start, ref.verse_start, ref.chapter_end, ref.verse_end, ref.confidence]);
            }

            console.log(` ✅ ${refs.length} refs`);
            totalRefs += refs.length;
        } catch (err) {
            console.log(` ❌ ${err.message}`);
        }
    }

    saveDb();
    return { totalRefs };
}

// CLI 入口
if (process.argv[1].includes('recognize')) {
    const category = process.argv[2] || '4D';
    console.log(`\n📖 Step 2: 經文識別 [${category}]\n`);
    recognizeBatch(category, 100).then(r => {
        console.log(`\n✅ 共識別 ${r.totalRefs} 個經文引用`);
    });
}
