/**
 * ChronicleAnchor (v3.2 Sovereign Sync)
 * Validates player actions against biblical canon and immutable beats.
 */
class ChronicleAnchor {
    constructor(engine) {
        this.engine = engine; // Central Logos brain reference
    }

    /**
     * [V4.0] 聖經經文定錨藍圖生成 (20 段隨機分佈)
     * 基於總經文數進行帶間距保護的高熵取樣。
     */
    async createBlueprint(book, sCap, eCap, targetCount = 20) {
        // [SOVEREIGN] 定錨前必須先獲取書卷結構
        const { ContentManager } = await import('../../../domains/content/bible/ContentManager.js');
        const { bibleTranslator } = await import('../../../utils/bibleTranslator.js');

        const stdBook = bibleTranslator.toChinese(book);
        const structure = await ContentManager.getBookStructure(stdBook);
        if (!structure) return [];

        const targetCaps = (structure.chapters || []).filter(c => c.chapter >= sCap && c.chapter <= eCap);
        if (targetCaps.length === 0) return [];

        const totalVerses = targetCaps.reduce((sum, c) => sum + (parseInt(c.verse_count) || 0), 0);
        const blueprint = [];
        const segmentSize = 5;
        const minGap = 2;

        const sampledPoints = [];
        let attempts = 0;
        // [SOVEREIGN] 增加抽樣韌性，避免過早進入確定性回補邏輯
        while (sampledPoints.length < targetCount && attempts < 500) {
            const p = Math.floor(Math.random() * totalVerses);
            const isTooClose = sampledPoints.some(existing => Math.abs(existing - p) < minGap);
            if (!isTooClose) sampledPoints.push(p);
            attempts++;
        }

        // 如果隨機性抽樣失敗，回退至等距抽樣 (但加入隨機偏移)
        if (sampledPoints.length < targetCount) {
            console.warn(`🛡️ [ChronicleAnchor] Low entropy detected (${sampledPoints.length}/${targetCount}), applying jittered spread.`);
            for (let i = 0; i < targetCount; i++) {
                const base = Math.floor((i / targetCount) * totalVerses);
                const jitter = Math.floor(Math.random() * (minGap || 1));
                sampledPoints.push(Math.min(base + jitter, totalVerses - 1));
            }
        }

        for (let i = 0; i < sampledPoints.length; i++) {
            const targetPointer = sampledPoints[i];
            let runningCount = 0;
            let foundCap = targetCaps[0];
            let vStart = 1;

            for (const cap of targetCaps) {
                const capVerses = parseInt(cap.verse_count) || 0;
                if (runningCount + capVerses > targetPointer) {
                    foundCap = cap;
                    vStart = (targetPointer - runningCount) + 1;
                    break;
                }
                runningCount += capVerses;
            }

            const capMax = parseInt(foundCap.verse_count) || 20;
            vStart = Math.min(vStart, Math.max(1, capMax - segmentSize + 1));
            const vEnd = Math.min(vStart + segmentSize - 1, capMax);

            blueprint.push({
                index: i + 1,
                chapter: foundCap.chapter,
                verseRange: { start: vStart, end: vEnd },
                isPsalm: stdBook === '詩篇'
            });
        }

        // Fisher-Yates 洗牌 (在主權中心集中處理)
        for (let i = blueprint.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [blueprint[i], blueprint[j]] = [blueprint[j], blueprint[i]];
        }

        return blueprint.map((a, i) => ({ ...a, index: i + 1 }));
    }

    /**
     * Validate player input against the current state via Sovereign Pipe
     */
    async validate(playerInput, state) {
        console.log(`🛡️ [Logos] Guard checking input via Sovereign Pipe: "${playerInput}"`);
        // ... (保持原有邏輯)
        const contextData = {
            current_verses: state.metadata.source,
            immutable_beats: state.logic.immutable_beats,
            input: playerInput,
            temperature: 0.2
        };

        try {
            const result = await this.engine.askBrain('history_validator', contextData);
            return result;
        } catch (e) {
            console.error('❌ [ChronicleAnchor] Validation failed:', e.message);
            return { validation_status: 'sync', logic_reason: 'Fallthrough due to engine error' };
        }
    }
}

export { ChronicleAnchor };
