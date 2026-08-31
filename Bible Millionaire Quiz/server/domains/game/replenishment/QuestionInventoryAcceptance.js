import { getStoredDifficultyBand } from '../difficulty/DifficultyScorer.js';

const INVENTORY_BANDS = Object.freeze(['EASY', 'MEDIUM', 'HARD', 'VERY_HARD']);

/**
 * 新題即使未達生產目標難度，仍可補入其「實際難度」的缺口；
 * 但該難度已滿時不再收題，避免困難題生成失敗變成中等題無限堆積。
 */
export function partitionVerifiedInventoryAdds(candidates, shortages = {}) {
    const remaining = Object.fromEntries(
        INVENTORY_BANDS.map(band => [band, Math.max(0, Number(shortages?.[band] || 0))])
    );
    const accepted = [];
    const rejected = [];

    for (const question of Array.isArray(candidates) ? candidates : []) {
        const actualBand = getStoredDifficultyBand(question);
        if (!INVENTORY_BANDS.includes(actualBand)) {
            rejected.push({ question, actualBand, reason: 'UNSUPPORTED_ACTUAL_DIFFICULTY_BAND' });
            continue;
        }
        if (remaining[actualBand] < 1) {
            rejected.push({ question, actualBand, reason: 'ACTUAL_DIFFICULTY_INVENTORY_FULL' });
            continue;
        }
        remaining[actualBand] -= 1;
        accepted.push({ question, actualBand });
    }

    return { accepted, rejected, remaining };
}

export default { partitionVerifiedInventoryAdds };
