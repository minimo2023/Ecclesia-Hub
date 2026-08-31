/**
 * LocationSyncService
 *
 * 聖經地理座標與地點資訊的全面採集服務。
 * 核心原則：精準座標提取 (GPS Extraction)、多重映射 (Mapping)、有禮同步。
 */

import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { ContentManager } from '../bible/ContentManager.js';
import * as fsModule from 'node:fs'; // 使用別名避免冲突
import { publicRoot } from '../../../utils/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_IMAGE_DIR = path.join(publicRoot, 'images', 'bible_knowledge', 'locations');

const FHL_GEO_BASE = 'https://bible.fhl.net/object/sd.php';

class LocationSyncService {
    constructor() {
        this.fs = fsModule; // 直接掛載模組到實例
        this.stats = {
            processed: 0,
            synced: 0,
            errors: 0
        };
        this.imageDir = path.join(publicRoot, 'images', 'bible_knowledge', 'locations');
        this.legacyDir = path.join(publicRoot, 'images', 'geography');

        if (!this.fs.existsSync(this.imageDir)) {
            this.fs.mkdirSync(this.imageDir, { recursive: true });
        }
    }

    /**
     * 同步 FHL 全量聖經地點 (1,481 個)
     * @param {number} limit - 最大採集數
     */
    async syncAllLocations(limit = 1481) {
        console.log(`🚀 [GeoSync] 開始同步聖經地理數據 (預計 ${limit} 筆)...`);
        if (!ContentManager.initialized) await ContentManager.initialize();

        for (let i = 1; i <= limit; i++) {
            const url = `${FHL_GEO_BASE}?gb=0&LIMIT=${i}`;
            const success = await this._syncSingleLocation(url, i);

            if (success) this.stats.synced++;
            this.stats.processed++;

            // 頻率限制 (200ms)
            if (i % 5 === 0) {
                process.stdout.write(`.`);
                await new Promise(r => setTimeout(r, 200));
            }
        }

        console.log(`\n✅ [GeoSync] 同步完成！總處理: ${this.stats.processed}, 成功入庫: ${this.stats.synced}`);
        return this.stats;
    }

    /**
     * 下載影像至本地
     */
    async _downloadImage(url, filename) {
        try {
            if (!url) return null;
            if (!this.fs.existsSync(PUBLIC_IMAGE_DIR)) {
                this.fs.mkdirSync(PUBLIC_IMAGE_DIR, { recursive: true });
            }

            const targetPath = path.join(PUBLIC_IMAGE_DIR, filename);
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Referer': 'https://bible.fhl.net/object/sd.php'
                }
            });
            if (!response.ok) return null;

            const buffer = await response.arrayBuffer();
            this.fs.writeFileSync(targetPath, Buffer.from(buffer));

            return `/images/bible_knowledge/locations/${filename}`;
        } catch (error) {
            console.error(`[GeoSync] Image download failed: ${url}`, error.message);
            return null;
        }
    }

    /**
     * 同步單筆地點
     */
    async _syncSingleLocation(url, index) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Referer': 'https://bible.fhl.net/object/sd.php'
                }
            });
            if (!response.ok) return false;
            const html = await response.text();

            // 1. 提取地名 (優先找和合本，若無則找第一個 <b>)
            const nameMatch = html.match(/<td>和合本<\/td><td>([^<]+)<\/td>/i) ||
                              html.match(/<td>新標點和合本<\/td><td>([^<]+)<\/td>/i) ||
                              html.match(/<font[^>]*color=["']?#000080["']?[^>]*><b>([^<]+)<\/b>/i) ||
                              html.match(/<b>([^<]{1,50})<\/b>/i);

            let nameZh = nameMatch ? nameMatch[1].trim() : `Unknown_${index}`;

            // 1.1 深度名稱補丁 (若為 Unknown，嘗試從內文中提取)
            if (nameZh.startsWith('Unknown_')) {
                const textBody = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
                const deepMatch = textBody.match(/英文名\s+([^型\s]+)/i) ||
                                  textBody.match(/中譯名\s+([^現\s]+)/i);
                if (deepMatch) nameZh = deepMatch[1].trim();
            }

            // 2. 提取現代地名 (現代名 欄位)
            const modernMatch = html.match(/<td>現代名<\/td><td>([^<]+)<\/td>/i) ||
                                html.match(/現代地名：([^<）\s]+)/i);
            const modernName = modernMatch ? modernMatch[1].trim() : null;

            // 3. 提取 GPS 座標 (從 showmap.php 連結中)
            const gpsMatch = html.match(/showmap\.php\?x=([\d.-]+)&amp;y=([\d.-]+)/i) ||
                             html.match(/q=([\d.-]+),([\d.-]+)/);
            const lat = gpsMatch ? parseFloat(gpsMatch[1]) : null;
            const lon = gpsMatch ? parseFloat(gpsMatch[2]) : null;

            // 4. 提取地圖編號與 SNH
            const mapNoMatch = html.match(/<td>梁天樞編號<\/td><td><a[^>]+>([^<]+)<\/a>/i) ||
                               html.match(/梁天樞編號：(\d+)/i);
            const mapNo = mapNoMatch ? mapNoMatch[1].trim() : null;

            const snHMatch = html.match(/<td>希伯來文編號<\/td><td><a[^>]+>(\d{4,5})<\/a>/i);
            const snGMatch = html.match(/<td>希臘文編號<\/td><td><a[^>]+>(\d{4,5})<\/a>/i);
            const snCode = snHMatch ? `H${snHMatch[1]}` : (snGMatch ? `G${snGMatch[1]}` : null);

            // 5. 提取影像 (先行檢查 legacy 目錄)
            const allImages = [];
            let primaryImageUrl = null;
            let primaryImageLocalPath = null;

            // --- 檢查 Legacy Assets (public/images/geography) ---
            const legacyPrefix = index.toString().padStart(4, '0');
            if (this.fs.existsSync(this.legacyDir)) {
                const legacyFiles = this.fs.readdirSync(this.legacyDir).filter(f => f.startsWith(legacyPrefix));
                const safeName = nameZh.replace(/[\\/:*?"<>|]/g, '_');

                for (let i = 0; i < legacyFiles.length; i++) {
                    const file = legacyFiles[i];
                    const srcPath = path.join(this.legacyDir, file);
                    const ext = path.extname(file) || '.gif';

                    // 提取原始序號 (如 0001_0.GIF -> 0)
                    const subIdxMatch = file.match(/_(\d+)\./);
                    const subIdx = subIdxMatch ? subIdxMatch[1] : i;

                    const destFilename = `FHL_GEO_${index}_${safeName}_Legacy_${subIdx}${ext.toLowerCase()}`;
                    const destPath = path.join(this.imageDir, destFilename);

                    if (!this.fs.existsSync(destPath)) {
                        this.fs.copyFileSync(srcPath, destPath);
                    }

                    const localRef = `/images/bible_knowledge/locations/${destFilename}`;
                    allImages.push({ url: `local://legacy/${file}`, local: localRef });
                    if (!primaryImageLocalPath) {
                        primaryImageLocalPath = localRef;
                    }
                }
            }

            // --- 遠端抓取預計下載影像 ---
            const mediaPart = html.split(/Collected Data/i)[1] || "";
            const imgMatches = [...mediaPart.matchAll(/<a href=["']?(\.\.\/photo\/[^"'>]+\.(jpg|jpeg|png|gif))/gi)] || [];

            for (let i = 0; i < imgMatches.length; i++) {
                // 如果已經有 10 張圖了，就不再抓遠端的 (除非一張都沒有)
                if (allImages.length >= 10) break;

                const imgMatch = imgMatches[i];
                let imgRawPath = imgMatch[1];
                let imageUrl = imgRawPath.startsWith('../') ? `https://bible.fhl.net/${imgRawPath.replace('../', '')}` : `https://bible.fhl.net/object/${imgRawPath}`;

                const ext = path.extname(imgRawPath) || '.jpg';
                const safeName = nameZh.replace(/[\\/:*?"<>|]/g, '_');
                const filename = `FHL_GEO_${index}_${safeName}_${i}${ext}`;

                const localPath = await this._downloadImage(imageUrl, filename);
                if (localPath) {
                    allImages.push({ url: imageUrl, local: localPath });
                    if (!primaryImageLocalPath) {
                        primaryImageUrl = imageUrl;
                        primaryImageLocalPath = localPath;
                    }
                }
            }

            // 6. 提取描述並執行深度清洗
            const bodyContent = html.split('</head>')[1] || html;
            let description = bodyContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

            // 基礎清洗濾鏡
            description = description.replace(/回查詢頁\s+同聖經查詢\s+編號\s+\d+/gi, '');
            description = description.replace(/首頁\s+字典內容/gi, '');
            description = description.replace(/英文名\s+[^型\s]+/gi, '');
            description = description.replace(/中譯名\s+[^現\s]+/gi, '');
            description = description.replace(/現代名\s+/gi, '現代名: ');
            description = description.replace(/梁天樞編號\s+\d+/gi, '');
            description = description.replace(/\s+/g, ' ').trim();

            // 7. 入庫
            await this._saveLocation({
                id: `FHL_GEO_${index}`,
                name_ch: nameZh,
                modern_name: modernName,
                lat,
                lon,
                description: description,
                image_url: primaryImageUrl,
                image_path: primaryImageLocalPath,
                map_no: mapNo,
                metadata: {
                    fhl_index: index,
                    sn_code: snCode,
                    source_url: url,
                    all_images: allImages
                }
            });

            return true;
        } catch (error) {
            console.error(`❌ [GeoSync] Failed at index ${index}:`, error.message);
            this.stats.errors++;
            return false;
        }
    }

    async _saveLocation(loc) {
        const db = ContentManager.getDb();
        await db.run(`
            INSERT INTO locations (
                id, name_zh, modern_name, lat, lon, description,
                type, verse_refs, metadata, source, processed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                name_zh = EXCLUDED.name_zh,
                modern_name = EXCLUDED.modern_name,
                lat = EXCLUDED.lat,
                lon = EXCLUDED.lon,
                description = EXCLUDED.description,
                type = EXCLUDED.type,
                verse_refs = EXCLUDED.verse_refs,
                metadata = EXCLUDED.metadata,
                processed = EXCLUDED.processed
        `, [
            loc.id, loc.name_zh, loc.modern_name, loc.lat, loc.lon, loc.description,
            loc.type, loc.verse_refs, JSON.stringify(loc.metadata), 'FHL_SmartMap', true
        ]);
    }
}

export const locationSyncService = new LocationSyncService();
