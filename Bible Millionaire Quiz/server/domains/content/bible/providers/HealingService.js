import { bibleTranslator } from './bibleTranslator.js';
import logger from './logger.js';
import { externalBibleService } from '../ExternalBibleAPIs.js';

/**
 * HealingService - 專職資料缺失修補與熔斷控制 (V38.6 修正版)
 * 🚀 [Sovereign Implementation]
 */
export default class HealingService {
    constructor(db, ops, manager) {
        this.db = db;
        this.ops = ops;
        this.manager = manager;
        this._healingFailures = {};
    }

    /**
     * 修復缺失的單節經文
     */
    async _healVerse(book, chapter, verse, version = 'unv') {
        const key = `heal:v:${book}:${chapter}:${verse}:${version}`;
        if (this._isHealingRateLimited(key)) return null;

        logger.info(`🩹 [HealingService] Verse missing: ${book} ${chapter}:${verse}, attempting repair...`);
        try {
            const externalData = await externalBibleService.getVerse(book, chapter, verse, version);
            if (externalData) {
                await this.ops.saveVerse({
                    book: externalData.book,
                    chapter: externalData.chapter,
                    verse: externalData.verse,
                    text: externalData.text,
                    version: externalData.version || version
                });
                logger.info(`✅ [HealingService] Repaired ${book} ${chapter}:${verse}`);
                const dbVersion = this.manager._resolveVersion(version);
                return await this.ops.getVerse(dbVersion, book, chapter, verse);
            }
        } catch (e) {
            logger.error(`❌ [HealingService] Repair failed for ${book} ${chapter}:${verse}: ${e.message}`);
            this._markHealingFailed(key);
        }
        return null;
    }

    /**
     * 修復缺失的整章經文 (背景修復)
     */
    async _healChapter(book, chapter, version = 'unv') {
        const key = `heal:c:${book}:${chapter}:${version}`;
        if (this._isHealingRateLimited(key)) return [];

        logger.info(`🩹 [HealingService] Chapter missing: ${book} ${chapter} (${version}), attempting background repair...`);
        try {
            const verses = await externalBibleService.getChapter(book, chapter, version);
            if (verses && verses.length > 0) {
                const savePromises = verses.map(v => this.ops.saveVerse({
                    book: v.book,
                    chapter: v.chapter,
                    verse: v.verse,
                    text: v.text,
                    version: v.version || version
                }));
                await Promise.all(savePromises);
                logger.info(`✅ [HealingService] Repaired Chapter ${book} ${chapter} (${verses.length} verses)`);
                return verses;
            }
        } catch (e) {
            logger.error(`❌ [HealingService] Chapter repair failed: ${e.message}`);
            this._markHealingFailed(key);
        }
        return [];
    }

    /**
     * 修復缺失的地點座標 (同名拷貝策略)
     */
    async _healLocationCoordinates(location) {
        if (!location || !location.name_zh) return location;
        const key = `heal:geo:${location.id || location.name_zh}`;
        if (this._isHealingRateLimited(key)) return location;

        logger.info(`🩹 [HealingService] Geography missing coordinates for "${location.name_zh}". Attempting sibling repair...`);
        try {
            const existing = await this.db.get(`
                SELECT lat, lon FROM locations
                WHERE (name_zh = $1 OR name_en = $2)
                AND lat IS NOT NULL AND lon IS NOT NULL
                AND id != $3
                LIMIT 1
            `, [location.name_zh, location.name_en, location.id]);

            if (existing) {
                await this.db.run(`UPDATE locations SET lat = $1, lon = $2 WHERE id = $3`, [existing.lat, existing.lon, location.id]);
                logger.info(`✅ [HealingService] Repaired coordinates for "${location.name_zh}" from sibling record.`);
                return { ...location, lat: existing.lat, lon: existing.lon };
            }
            this._markHealingFailed(key);
        } catch (e) {
            logger.error(`❌ [HealingService] Geo repair failed: ${e.message}`);
            this._markHealingFailed(key);
        }
        return location;
    }

    /**
     * 熔斷/速率限制檢查 (避免重複無效修復)
     */
    _isHealingRateLimited(key) {
        const failure = this._healingFailures[key];
        if (!failure) return false;
        // 1 小時冷卻期 (Cooldown)
        if (Date.now() - failure.timestamp < 3600 * 1000) {
            return true;
        }
        delete this._healingFailures[key];
        return false;
    }

    _markHealingFailed(key) {
        this._healingFailures[key] = { timestamp: Date.now() };
    }
}
