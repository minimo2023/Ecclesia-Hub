/**
 * [SOVEREIGN UNIT] Configuration Manager
 * v3.6 - Resilience-First Environment Validation
 * Pursuing "Stable and Accurate" boot protocols.
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { resolveGeminiModel } from '../infrastructure/ai/model-policy.js';
import {
    biblicalProjectRoot,
    dataRoot,
    hubRoot,
    publicRoot,
    reportsRoot,
    serverRoot,
    uploadsRoot,
} from './paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 🛠️ 嘗試從多個可能位置加載 .env
const envPaths = [
    path.join(hubRoot, '.env'),
    path.join(biblicalProjectRoot, '.env'),
    path.join(serverRoot, '.env')
];

envPaths.forEach(p => {
    if (fs.existsSync(p)) {
        dotenv.config({ path: p });
    }
});

// 🛡️ 核心必填項
const MANDATORY_VARS = ['GEMINI_API_KEY'];

const firstConfiguredGeminiKey = () => [
    process.env.GEMINI_PAID_KEYS,
    process.env.GEMINI_FREE_KEYS,
    process.env.GEMINI_API_KEYS,
    process.env.GEMINI_API_KEY
]
    .flatMap(value => String(value || '').split(','))
    .map(value => value.trim())
    .find(Boolean);

const validateConfig = () => {
    // 智慧型多金鑰感應：複數或單數擇一即可
    const hasGemini = firstConfiguredGeminiKey();
    const missing = MANDATORY_VARS.filter(key => {
        if (key === 'GEMINI_API_KEY') return !hasGemini;
        return !process.env[key];
    });

    if (missing.length > 0) {
        if (process.env.NODE_ENV === 'production') {
            console.error('❌ [FATAL CONFIG] Missing essential keys:', missing.join(', '));
            process.exit(1);
        } else {
            console.warn('⚠️ [Config Warning] Missing:', missing.join(', '));
        }
    } else {
        console.log('✅ [Config] All mandatory variables present (Gemini Cluster detected).');
    }
};

validateConfig();

export const config = {
    db: {
        type: process.env.DB_TYPE || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
        name: process.env.DB_NAME || 'bible_quiz',
        maxPool: 20,
    },
    server: {
        port: parseInt(process.env.PORT, 10) || 3005,
        env: process.env.NODE_ENV || 'development',
    },
    ai: {
        apiKey: firstConfiguredGeminiKey(),
        model: resolveGeminiModel(process.env.AI_MODEL),
    },
    paths: {
        root: biblicalProjectRoot,
        hub: hubRoot,
        server: serverRoot,
        data: dataRoot,
        uploads: uploadsRoot,
        reports: reportsRoot,
        public: publicRoot,
    },
    patrol: {
        dailyBatchSize: parseInt(process.env.PATROL_DAILY_BATCH, 10) || 15,
        segmentSize: 10,
        enabled: process.env.PATROL_ENABLED === 'true' || true,
        startTime: '01:00',
        endTime: '04:00',
        throttleDelay: 60000
    }
};

export default config;
