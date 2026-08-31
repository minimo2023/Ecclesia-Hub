import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 預設資料儲存路徑 (NAS 路徑或本地開發路徑)
const DATA_ROOT = process.env.NAS_DATA_PATH || path.join(process.cwd(), 'bible_data');

export const PATHS = {
    RAW: path.join(DATA_ROOT, 'raw'),
    PROCESSED: path.join(DATA_ROOT, 'processed'),
    LOGS: path.join(DATA_ROOT, 'logs')
};

// 確保目錄存在
export function ensureDirectories() {
    Object.values(PATHS).forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
}
