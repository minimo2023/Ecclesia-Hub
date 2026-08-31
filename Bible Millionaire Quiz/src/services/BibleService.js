/**
 * BibleService.js
 * 負責與信望愛聖經 API (bible.fhl.net) 進行交互
 */

const FHL_API_BASE = 'https://bible.fhl.net/json/qsb.php';

/**
 * 從信望愛 API 獲取經文
 * @param {string} reference - 經文引用，例如 "John 3:16" 或 "約3:16"
 * @returns {Promise<string>} - 返回經文文本
 */
export async function fetchScripture(reference) {
    try {
        // 構建查詢參數
        const params = new URLSearchParams({
            version: 'unv', // 和合本
            qstr: reference,
            gb: '0',        // 繁體中文
            strong: '0'     // 不含原文編號
        });

        const response = await fetch(`${FHL_API_BASE}?${params.toString()}`);

        if (!response.ok) {
            throw new Error(`FHL API Error: ${response.status}`);
        }

        const data = await response.json();

        // 信望愛 API 返回格式:
        // {
        //   status: 'success',
        //   record: [
        //     { chineses: '太', chap: 1, sec: 1, bible_text: '亞伯拉罕的後裔...' },
        //     ...
        //   ]
        // }

        if (data.status !== 'success' || !data.record) {
            throw new Error('無法獲取經文數據');
        }

        // 組合經文文本
        const scriptureText = data.record
            .map(r => `${r.sec}. ${r.bible_text}`)
            .join('\n');

        return scriptureText;

    } catch (error) {
        console.error('BibleService Error:', error);
        // 如果 API 失敗，返回 null，讓上層決定是否使用 AI 生成的備用經文
        return null;
    }
}
