import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import { PATHS, ensureDirectories } from './config.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const API_KEY = process.env.BIBLIA_API_KEY;
const API_BASE = 'https://api.biblia.com/v1/bible';

async function run() {
    try {
        if (!API_KEY) {
            throw new Error('BIBLIA_API_KEY is missing in .env');
        }

        await ensureDirectories();
        const targetDir = path.join(PATHS.RAW, 'biblia');
        await fs.mkdir(targetDir, { recursive: true });

        log('Starting Biblia crawl...');

        // 1. Get list of available Bibles
        log('Fetching available Bibles...');
        const biblesRes = await fetch(`${API_BASE}/find?key=${API_KEY}`, {
            headers: { 'User-Agent': 'BibleWisdomHub/1.0' }
        });
        if (!biblesRes.ok) throw new Error(`Failed to fetch Bibles: ${biblesRes.statusText}`);
        const biblesData = await biblesRes.json();

        await fs.writeFile(
            path.join(targetDir, 'bibles.json'),
            JSON.stringify(biblesData, null, 2)
        );
        log(`Saved ${biblesData.bibles?.length || 0} Bible versions`);

        // 2. Fetch sample content (Genesis 1 from LEB)
        const bibleVersion = 'LEB';
        log(`Fetching sample content from ${bibleVersion}...`);

        const contentRes = await fetch(`${API_BASE}/content/${bibleVersion}.json?passage=Genesis1&key=${API_KEY}`, {
            headers: { 'User-Agent': 'BibleWisdomHub/1.0' }
        });
        if (!contentRes.ok) throw new Error(`Failed to fetch content: ${contentRes.statusText}`);
        const contentData = await contentRes.json();

        await fs.writeFile(
            path.join(targetDir, 'genesis_1_sample.json'),
            JSON.stringify(contentData, null, 2)
        );
        log('Sample content saved successfully');

        log('Biblia crawl completed (Sample Mode)');
        if (process.send) {
            process.send({ status: 'completed', message: 'Biblia crawl finished', percentage: 100 });
        }

    } catch (error) {
        console.error('Biblia crawl error:', error);
        if (process.send) {
            process.send({ status: 'error', message: error.message });
        }
        process.exit(1);
    }
}

function log(message) {
    console.log(message);
    if (process.send) {
        process.send({ status: 'running', message, percentage: 50 });
    }
}

run();
