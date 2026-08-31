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
        const sourceName = 'wldeh';
        const rawDir = path.join(PATHS.RAW, sourceName);
        await fs.mkdir(rawDir, { recursive: true });

        notifyProgress({ status: 'running', message: '正在獲取版本列表...', percentage: 0 });

        // 1. 獲取版本列表
        const listUrl = 'https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles/bibles.json';
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        };

        const listRes = await fetch(listUrl, { headers });
        if (!listRes.ok) throw new Error(`Failed to fetch list: ${listRes.statusText}`);

        const bibles = await listRes.json();
        const validBibles = Object.values(bibles).flat().filter(b => b.id);

        const total = validBibles.length;
        notifyProgress({ status: 'running', message: `找到 ${total} 個版本`, total, completed: 0, percentage: 0 });

        // 2. 下載每個版本
        let completed = 0;
        for (const bible of validBibles) {
            const versionId = bible.id;
            const lang = bible.lang || 'unknown';

            const downloadUrl = `https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles/${lang}/${versionId}.json`;
            const filePath = path.join(rawDir, `${versionId}.json`);

            try {
                const res = await fetch(downloadUrl, { headers });
                if (res.ok) {
                    const data = await res.json();
                    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
                } else {
                    console.warn(`Failed to download ${versionId}: ${res.status}`);
                }
            } catch (err) {
                console.error(`Error downloading ${versionId}:`, err);
            }

            completed++;
            const percentage = Math.round((completed / total) * 100);

            if (completed % 5 === 0 || completed === total) {
                notifyProgress({
                    status: 'running',
                    message: `正在下載: ${versionId}`,
                    total,
                    completed,
                    percentage
                });
            }

            await new Promise(r => setTimeout(r, 100));
        }

        notifyProgress({ status: 'completed', message: '爬取完成', total, completed, percentage: 100 });

    } catch (error) {
        console.error('Crawler failed:', error);
        notifyProgress({ status: 'error', message: error.message });
        process.exit(1);
    }
}

run();
