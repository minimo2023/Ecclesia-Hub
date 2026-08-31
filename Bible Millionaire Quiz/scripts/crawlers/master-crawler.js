import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureDirectories } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 支援的爬蟲列表
const CRAWLERS = {
    'wldeh': './wldeh-crawler.js',
    'fhl': './fhl-crawler.js',    // 尚未實作
    'biblia': './biblia-crawler.js' // 尚未實作
};

import fs from 'fs';

async function runCrawler(source) {
    return new Promise((resolve, reject) => {
        const scriptPath = CRAWLERS[source];
        if (!scriptPath) {
            return reject(new Error(`Unknown crawler source: ${source}`));
        }

        const fullPath = path.join(__dirname, scriptPath);

        // Debug info
        console.log(`[Debug] Looking for crawler: ${source}`);
        console.log(`[Debug] __dirname: ${__dirname}`);
        console.log(`[Debug] Target fullPath: ${fullPath}`);
        try {
            console.log(`[Debug] Directory contents:`, fs.readdirSync(__dirname));
        } catch (e) {
            console.log(`[Debug] Could not list directory: ${e.message}`);
        }

        if (!fs.existsSync(fullPath)) {
            return reject(new Error(`Crawler script not found: ${fullPath}`));
        }

        const child = fork(fullPath);

        child.on('message', (msg) => {
            if (process.send) {
                process.send({ source, ...msg });
            } else {
                console.log(`[${source}]`, msg);
            }
        });

        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Crawler ${source} failed with code ${code}`));
            }
        });
    });
}

async function runAll() {
    console.log('Starting One-Click Crawl All...');
    const sources = Object.keys(CRAWLERS);

    for (const source of sources) {
        try {
            // 簡單檢查檔案是否存在 (ESM 中 require.resolve 不直接可用，這裡簡化)
            console.log(`Starting crawler: ${source}`);
            await runCrawler(source);
            console.log(`Crawler ${source} completed.`);
        } catch (e) {
            console.warn(`Skipping ${source}: ${e.message}`);
        }
    }
    console.log('All crawlers finished.');
}

const args = process.argv.slice(2);
const source = args[0];

(async () => {
    try {
        ensureDirectories();

        if (source === 'all') {
            await runAll();
        } else if (source) {
            await runCrawler(source);
        } else {
            console.error('Please specify a source (wldeh, fhl, biblia) or "all"');
            process.exit(1);
        }
    } catch (error) {
        console.error('Master crawler failed:', error);
        process.exit(1);
    }
})();
