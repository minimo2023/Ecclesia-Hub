import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import { PATHS, ensureDirectories } from './config.js';

// 模擬 parent port 通訊
const notifyProgress = (data) => {
    if (process.send) {
        process.send(data);
    } else {
        console.log('Progress:', data);
    }
};

async function run() {
    try {
        ensureDirectories();
        const sourceName = 'fhl';
        const rawDir = path.join(PATHS.RAW, sourceName);
        await fs.mkdir(rawDir, { recursive: true });

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        };

        notifyProgress({ status: 'running', message: '正在獲取書卷列表...', percentage: 0 });

        // 1. 獲取書卷列表 (從 FHL 網站或硬編碼)
        // 為了穩定性，我們先使用標準的 FHL 書卷縮寫列表
        // 參考: http://bible.fhl.net/new/listall.html
        const books = [
            { id: 'Gen', name: '創世記', chapters: 50 },
            { id: 'Exod', name: '出埃及記', chapters: 40 },
            { id: 'Lev', name: '利未記', chapters: 27 },
            { id: 'Num', name: '民數記', chapters: 36 },
            { id: 'Deut', name: '申命記', chapters: 34 },
            { id: 'Josh', name: '約書亞記', chapters: 24 },
            { id: 'Judg', name: '士師記', chapters: 21 },
            { id: 'Ruth', name: '路得記', chapters: 4 },
            { id: '1Sam', name: '撒母耳記上', chapters: 31 },
            { id: '2Sam', name: '撒母耳記下', chapters: 24 },
            { id: '1Kgs', name: '列王紀上', chapters: 22 },
            { id: '2Kgs', name: '列王紀下', chapters: 25 },
            { id: '1Chr', name: '歷代志上', chapters: 29 },
            { id: '2Chr', name: '歷代志下', chapters: 36 },
            { id: 'Ezra', name: '以斯拉記', chapters: 10 },
            { id: 'Neh', name: '尼希米記', chapters: 13 },
            { id: 'Esth', name: '以斯帖記', chapters: 10 },
            { id: 'Job', name: '約伯記', chapters: 42 },
            { id: 'Ps', name: '詩篇', chapters: 150 },
            { id: 'Prov', name: '箴言', chapters: 31 },
            { id: 'Eccl', name: '傳道書', chapters: 12 },
            { id: 'Song', name: '雅歌', chapters: 8 },
            { id: 'Isa', name: '以賽亞書', chapters: 66 },
            { id: 'Jer', name: '耶利米書', chapters: 52 },
            { id: 'Lam', name: '耶利米哀歌', chapters: 5 },
            { id: 'Ezek', name: '以西結書', chapters: 48 },
            { id: 'Dan', name: '但以理書', chapters: 12 },
            { id: 'Hos', name: '何西阿書', chapters: 14 },
            { id: 'Joel', name: '約珥書', chapters: 3 },
            { id: 'Amos', name: '阿摩司書', chapters: 9 },
            { id: 'Obad', name: '俄巴底亞書', chapters: 1 },
            { id: 'Jonah', name: '約拿書', chapters: 4 },
            { id: 'Mic', name: '彌迦書', chapters: 7 },
            { id: 'Nah', name: '那鴻書', chapters: 3 },
            { id: 'Hab', name: '哈巴谷書', chapters: 3 },
            { id: 'Zeph', name: '西番雅書', chapters: 3 },
            { id: 'Hag', name: '哈該書', chapters: 2 },
            { id: 'Zech', name: '撒迦利亞書', chapters: 14 },
            { id: 'Mal', name: '瑪拉基書', chapters: 4 },
            { id: 'Matt', name: '馬太福音', chapters: 28 },
            { id: 'Mark', name: '馬可福音', chapters: 16 },
            { id: 'Luke', name: '路加福音', chapters: 24 },
            { id: 'John', name: '約翰福音', chapters: 21 },
            { id: 'Acts', name: '使徒行傳', chapters: 28 },
            { id: 'Rom', name: '羅馬書', chapters: 16 },
            { id: '1Cor', name: '哥林多前書', chapters: 16 },
            { id: '2Cor', name: '哥林多後書', chapters: 13 },
            { id: 'Gal', name: '加拉太書', chapters: 6 },
            { id: 'Eph', name: '以弗所書', chapters: 6 },
            { id: 'Phil', name: '腓立比書', chapters: 4 },
            { id: 'Col', name: '歌羅西書', chapters: 4 },
            { id: '1Thess', name: '帖撒羅尼迦前書', chapters: 5 },
            { id: '2Thess', name: '帖撒羅尼迦後書', chapters: 3 },
            { id: '1Tim', name: '提摩太前書', chapters: 6 },
            { id: '2Tim', name: '提摩太後書', chapters: 4 },
            { id: 'Titus', name: '提多書', chapters: 3 },
            { id: 'Phlm', name: '腓利門書', chapters: 1 },
            { id: 'Heb', name: '希伯來書', chapters: 13 },
            { id: 'Jas', name: '雅各書', chapters: 5 },
            { id: '1Pet', name: '彼得前書', chapters: 5 },
            { id: '2Pet', name: '彼得後書', chapters: 3 },
            { id: '1John', name: '約翰一書', chapters: 5 },
            { id: '2John', name: '約翰二書', chapters: 1 },
            { id: '3John', name: '約翰三書', chapters: 1 },
            { id: 'Jude', name: '猶大書', chapters: 1 },
            { id: 'Rev', name: '啟示錄', chapters: 22 }
        ];

        const totalChapters = books.reduce((sum, book) => sum + book.chapters, 0);
        notifyProgress({ status: 'running', message: `準備爬取 ${books.length} 卷書，共 ${totalChapters} 章`, total: totalChapters, completed: 0, percentage: 0 });

        let completedChapters = 0;
        const version = 'unv'; // 和合本

        for (const book of books) {
            const bookDir = path.join(rawDir, book.id);
            await fs.mkdir(bookDir, { recursive: true });

            for (let chap = 1; chap <= book.chapters; chap++) {
                const url = `http://bible.fhl.net/json/qb.php?chineses=${book.id}&chap=${chap}&version=${version}`;
                const filePath = path.join(bookDir, `${chap}.json`);

                try {
                    // 檢查是否已下載
                    if (await fs.stat(filePath).catch(() => false)) {
                        // console.log(`Skipping ${book.name} ${chap} (already exists)`);
                    } else {
                        const res = await fetch(url, { headers });
                        if (res.ok) {
                            const data = await res.json();
                            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
                        } else {
                            console.warn(`Failed to download ${book.name} ${chap}: ${res.status}`);
                        }
                        // 禮貌性延遲，避免被封鎖
                        await new Promise(r => setTimeout(r, 500));
                    }
                } catch (err) {
                    console.error(`Error downloading ${book.name} ${chap}:`, err);
                }

                completedChapters++;
                const percentage = Math.round((completedChapters / totalChapters) * 100);

                if (completedChapters % 5 === 0 || completedChapters === totalChapters) {
                    notifyProgress({
                        status: 'running',
                        message: `正在下載: ${book.name} 第 ${chap} 章`,
                        total: totalChapters,
                        completed: completedChapters,
                        percentage
                    });
                }
            }
        }

        notifyProgress({ status: 'completed', message: '信望愛資料爬取完成', total: totalChapters, completed: completedChapters, percentage: 100 });

    } catch (error) {
        console.error('Crawler failed:', error);
        notifyProgress({ status: 'error', message: error.message });
        process.exit(1);
    }
}

run();
