/**
 * ObjectSyncService
 *
 * 聖經百科物件 (動植物、器物) 的採集服務。
 * 來源: FHL Mar/ Dictionary (dic_detail.php)
 */

import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ContentManager } from '../bible/ContentManager.js';
import { publicRoot } from '../../../utils/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_IMAGE_DIR = path.join(publicRoot, 'images', 'bible_knowledge', 'objects');

const FHL_DIC_BASE = 'https://bible.fhl.net/Mar/dic_detail.php';

class ObjectSyncService {
    constructor() {
        this.fs = fs;
        this.stats = { processed: 0, synced: 0, errors: 0 };
        if (!this.fs.existsSync(PUBLIC_IMAGE_DIR)) {
            this.fs.mkdirSync(PUBLIC_IMAGE_DIR, { recursive: true });
        }
    }

    /**
     * 同步百科物件
     * @param {number} sel - 分類 (0:動物, 1:植物, 2:器物)
     * @param {number} limit - 採集數量
     */
    async syncObjects(sel = 0, limit = 500) {
        console.log(`[ObjSync] Syncing Objects Category ${sel} (limit: ${limit})...`);
        if (!ContentManager.initialized) await ContentManager.initialize();

        const tocUrl = `https://bible.fhl.net/Mar/dic_show.php?sel=${sel}`;
        const fetchOptions = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
            }
        };

        try {
            const response = await fetch(tocUrl, fetchOptions);
            if (!response.ok) {
                console.error(`[ObjSync] Failed to fetch TOC for Category ${sel}, status: ${response.status}`);
                return this.stats;
            }
            const html = await response.text();

            // 提取所有 key=... 的連結
            const keyMatches = [...html.matchAll(/key=([\d.]+)/gi)].map(m => m[1]);
            const uniqueKeys = [...new Set(keyMatches)];

            console.log(`[ObjSync] Found ${uniqueKeys.length} unique keys in Category ${sel}`);

            for (let i = 0; i < Math.min(uniqueKeys.length, limit); i++) {
                const key = uniqueKeys[i];
                const detailUrl = `https://bible.fhl.net/Mar/dic_detail.php?sel=${sel}&key=${key}`;
                const success = await this._syncSingleObject(detailUrl, sel, key);
                if (success) this.stats.synced++;
                this.stats.processed++;

                // 禮貌延遲
                if (i % 5 === 0) {
                    process.stdout.write(`.`);
                    await new Promise(r => setTimeout(r, 300)); // 略長延遲
                } else {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
        } catch (e) {
            console.error(`[ObjSync] TOC Fetch failed for Category ${sel}:`, e.message);
        }
        return this.stats;
    }

    async _syncSingleObject(url, sel, key) {
        try {
            const fetchOptions = {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Referer': 'https://bible.fhl.net/Mar/dic_show.php'
                }
            };
            const response = await fetch(url, fetchOptions);
            if (!response.ok) return false;
            const html = await response.text();

            // 如果頁面太短(通常是 404) 或是標題不對，跳過
            if (html.length < 1500) {
                console.warn(`[ObjSync] Skipping suspected 404/Empty page: ${url} (length: ${html.length})`);
                return false;
            }
            console.log(`[ObjSync] Fetched ${url}, HTML length: ${html.length}`);

            // 1. 提取名稱 (優先找 <b>標題</b> 表格或 <title>)
            const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
            const tableTitleMatch = html.match(/<b>標題<\/b>[^<]*<\/td><td>([^<]+)/i);
            const boldNameMatch = html.match(/<b>(\d+\.\d+\s+)?([^<（\s|]+)/i);

            let name = tableTitleMatch ? tableTitleMatch[1].replace(/^\d+(\.\d+)?\s+/, '').replace(/\([^\)]+\)/g, '').split('/')[0].trim() :
                       (boldNameMatch ? boldNameMatch[2].trim() :
                       (titleMatch ? titleMatch[1].replace(/信望愛.+中的/, '').replace('字典內容', '').trim() : `Item_${key}`));

            // 再次清理名稱
            name = name.replace(/[\\/:*?"<>|]/g, '_').trim();
            if (!name || name.length <= 1 || name.includes('信望愛聯合聖經公會')) {
                console.warn(`[ObjSync] Invalid name extracted for ${url}: ${name}`);
                return false;
            }

            // 2. 檢查子連結 (深度採集)
            const subLinkMatches = [...html.matchAll(/href=["']?(dic_detail\.php\?sel=(\d+)&key=([\d.]+))["']/gi)];
            if (subLinkMatches.length > 0) {
                // 如果是目錄頁或包含子項，則繼續追蹤
                for (const m of subLinkMatches) {
                    const subKey = m[3];
                    // 避免重複抓取 (例如 1 -> 1.1 是 OK 的，但不要循環)
                    if (subKey !== key && subKey.startsWith(key)) {
                        const subUrl = `https://bible.fhl.net/Mar/${m[1]}`;
                        await this._syncSingleObject(subUrl, parseInt(m[2]), subKey);
                    }
                }
            }

            // 3. 提取圖片 (支援 img 標籤與 a 標籤鏈接)
            // 擴大搜索範圍，包含 Mar/img 和 photo/fauna/flora 等路徑
            const imgMatches = [
                ...html.matchAll(/<img[^>]+src=["']?((?:\.\.\/|figures\/|Mar\/img|photo\/fauna|photo\/flora)[^"'>]+\.(?:jpg|jpeg|png|gif))/gi),
                ...html.matchAll(/<a[^>]+href=["']?((?:\.\.\/|figures\/|Mar\/img|photo\/fauna|photo\/flora)[^"'>]+\.(?:jpg|jpeg|png|gif))/gi)
            ];
            console.log(`[ObjSync] Found ${imgMatches.length} images for ${name}`);

            // 3. 提取影像 (循環抓取所有匹配項)
            const allImages = [];
            let primaryImageLocalPath = null;

            if (imgMatches.length > 0) {
                for (let i = 0; i < imgMatches.length; i++) {
                    // 限制每個物件最多 5 張圖
                    if (allImages.length >= 5) break;

                    const imgRawPath = imgMatches[i][1];
                    let imageUrl;
                    if (imgRawPath.startsWith('../')) {
                        imageUrl = `https://bible.fhl.net/${imgRawPath.replace('../', '')}`;
                    } else if (imgRawPath.startsWith('figures/')) {
                        imageUrl = `https://bible.fhl.net/Mar/${imgRawPath}`;
                    } else {
                        imageUrl = `https://bible.fhl.net/${imgRawPath}`;
                    }

                    const ext = path.extname(imgRawPath) || '.jpg';
                    const safeName = name.replace(/[\\/:*?"<>|]/g, '_');
                    const filename = `FHL_OBJ_${sel}_${key}_${safeName}_${i}${ext}`;

                    const localPath = await this._downloadImage(imageUrl, filename);
                    if (localPath) {
                        allImages.push({ url: imageUrl, local: localPath });
                        if (!primaryImageLocalPath) primaryImageLocalPath = localPath;
                    }
                }
            }

            // 3. 提取描述 (排除 script 和導覽並執行深度清洗)
            let description = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                                    .replace(/<[^>]*>/g, ' ')
                                    .replace(/\s+/g, ' ')
                                    .trim();

            // 基礎清洗濾鏡
            description = description.replace(/信望愛聯合聖經公會.*中的字典內容/gi, '');
            description = description.replace(/首頁\s+字典內容/gi, '');
            description = description.replace(/標題\s+[^分\s]+/gi, '');
            description = description.replace(/分類\s+[^內\s]+/gi, '');
            description = description.replace(/\[\s*回上一層\s*\]/gi, '');
            description = description.replace(/\s+/g, ' ').trim();

            // 4. 入庫
            await this._saveObject({
                id: `FHL_OBJ_${sel}_${key}`,
                name,
                category: sel === 0 ? 'Animal' : (sel === 1 ? 'Plant' : 'Tool'),
                description,
                image_path: primaryImageLocalPath,
                metadata: {
                    sel,
                    key,
                    source_url: url,
                    all_images: allImages // 存儲多圖 Meta
                }
            });

            return true;
        } catch (error) {
            console.error(`❌ [ObjSync] Failed at sel=${sel}, key=${key}:`, error.message);
            return false;
        }
    }

    async _downloadImage(url, filename) {
        try {
            const dest = path.join(PUBLIC_IMAGE_DIR, filename);
            console.log(`[ObjSync] Downloading ${url} to ${dest}`);
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Referer': 'https://bible.fhl.net/Mar/dic_show.php'
                }
            });
            if (!res.ok) {
                console.error(`[ObjSync] Download failed for ${url}, status: ${res.status}`);
                return null;
            }
            const buffer = await res.arrayBuffer();
            this.fs.writeFileSync(dest, Buffer.from(buffer));
            console.log(`[ObjSync] Successfully saved ${filename}`);
            return `/images/bible_knowledge/objects/${filename}`;
        } catch (e) {
            console.error(`[ObjSync] Download EXCEPTION for ${url}:`, e.message);
            return null;
        }
    }

    async _saveObject(obj) {
        const db = ContentManager.getDb();
        await db.run(`
            INSERT INTO bible_objects (id, name_zh, category, description, image_path, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                name_zh = EXCLUDED.name_zh,
                description = EXCLUDED.description,
                image_path = EXCLUDED.image_path,
                metadata = EXCLUDED.metadata
        `, [obj.id, obj.name, obj.category, obj.description, obj.image_path, JSON.stringify(obj.metadata)]);
    }
}

export const objectSyncService = new ObjectSyncService();
