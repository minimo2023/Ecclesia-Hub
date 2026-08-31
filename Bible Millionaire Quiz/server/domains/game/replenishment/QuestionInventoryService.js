import { dbOps } from '../../../database/index.js';
import { bibleTranslator } from '../../../utils/bibleTranslator.js';
import { getDifficultyTargets } from '../difficulty/DifficultyScorer.js';
import { getSupportedCategories } from '../question-types/QuestionTypeSpec.js';

export const DEFAULT_INVENTORY_TARGET = 15;

const BAND_CATEGORY_PREFERENCES = {
    EASY: ['verse_fill', 'verse_fact', 'person'],
    MEDIUM: ['verse_fact', 'person', 'geography', 'theology'],
    HARD: ['theology', 'geography', 'person', 'lexicon', 'verse_fact'],
    VERY_HARD: ['lexicon', 'theology', 'geography', 'verse_fact']
};

function readField(row, camelName, snakeName) {
    return row?.[camelName] ?? row?.[snakeName];
}

function createCategoryBandMatrix(categories) {
    const matrix = {};
    for (const category of categories) {
        matrix[category] = { EASY: 0, MEDIUM: 0, HARD: 0, VERY_HARD: 0 };
    }
    return matrix;
}

/**
 * 將 DB 聚合列整理成遊戲可理解的庫存快照。此函式保持純函式，供回歸測試使用。
 */
export function buildInventorySnapshot(rows = [], {
    book = null,
    version = 'CUV_TRAD',
    targetCount = DEFAULT_INVENTORY_TARGET
} = {}) {
    const targets = getDifficultyTargets(targetCount);
    const categories = getSupportedCategories();
    const byBand = { EASY: 0, MEDIUM: 0, HARD: 0, VERY_HARD: 0 };
    const byCategory = Object.fromEntries(categories.map(category => [category, 0]));
    const byCategoryAndBand = createCategoryBandMatrix(categories);
    const byChapter = {};
    let total = 0;

    for (const row of rows) {
        const band = String(readField(row, 'difficultyBand', 'difficulty_band') || '').toUpperCase();
        const category = String(row.category || 'unknown');
        const chapter = Number(row.chapter);
        const count = Number(readField(row, 'questionCount', 'question_count')) || 0;
        if (!(band in byBand) || count <= 0) continue;

        total += count;
        byBand[band] += count;
        byCategory[category] = (byCategory[category] || 0) + count;
        if (!byCategoryAndBand[category]) {
            byCategoryAndBand[category] = { EASY: 0, MEDIUM: 0, HARD: 0, VERY_HARD: 0 };
        }
        byCategoryAndBand[category][band] += count;

        if (Number.isInteger(chapter) && chapter > 0) {
            byChapter[chapter] = (byChapter[chapter] || 0) + count;
        }
    }

    const shortages = {};
    for (const band of Object.keys(byBand)) {
        shortages[band] = Math.max(0, targets[band] - byBand[band]);
    }
    const shortageTotal = Object.values(shortages).reduce((sum, value) => sum + value, 0);

    const priorityBand = Object.keys(shortages)
        .filter(band => shortages[band] > 0)
        .sort((a, b) => {
            const ratioA = shortages[a] / Math.max(1, targets[a]);
            const ratioB = shortages[b] / Math.max(1, targets[b]);
            return ratioB - ratioA || shortages[b] - shortages[a];
        })[0] || null;

    let priorityCategory = null;
    if (priorityBand) {
        const preferences = BAND_CATEGORY_PREFERENCES[priorityBand] || categories;
        priorityCategory = [...preferences].sort((a, b) =>
            (byCategoryAndBand[a]?.[priorityBand] || 0) -
            (byCategoryAndBand[b]?.[priorityBand] || 0)
        )[0] || null;
    }

    const status = shortageTotal === 0
        ? 'ready'
        : (total >= targetCount ? 'degraded' : 'insufficient');

    return {
        book,
        version,
        targetCount,
        total,
        status,
        targets,
        byBand,
        byCategory,
        byCategoryAndBand,
        byChapter,
        shortages,
        shortageTotal,
        priorityGap: priorityBand ? {
            band: priorityBand,
            category: priorityCategory,
            missing: shortages[priorityBand],
            available: byBand[priorityBand],
            target: targets[priorityBand]
        } : null
    };
}

class QuestionInventoryService {
    constructor() {
        this.demandSignals = new Map();
    }

    recordDemand({
        book,
        startChapter = 1,
        endChapter = startChapter,
        version = 'CUV_TRAD',
        required = 1,
        available = 0,
        mode = 'unknown'
    }) {
        if (!book) return null;
        const missing = Math.max(0, Number(required) - Number(available));
        const key = `${version}|${book}|${startChapter}|${endChapter}`;
        if (missing === 0) {
            this.demandSignals.delete(key);
            return null;
        }

        const previous = this.demandSignals.get(key);
        const signal = {
            key,
            book,
            startChapter,
            endChapter,
            version,
            missing: Math.max(missing, previous?.missing || 0),
            hits: (previous?.hits || 0) + 1,
            mode,
            firstSeenAt: previous?.firstSeenAt || new Date().toISOString(),
            lastSeenAt: new Date().toISOString()
        };
        this.demandSignals.set(key, signal);

        if (this.demandSignals.size > 200) {
            const oldest = [...this.demandSignals.values()]
                .sort((a, b) => a.lastSeenAt.localeCompare(b.lastSeenAt))[0];
            if (oldest) this.demandSignals.delete(oldest.key);
        }
        return signal;
    }

    getPendingDemandSignals({ limit = 20, version = null } = {}) {
        return [...this.demandSignals.values()]
            .filter(signal => !version || signal.version === version)
            .sort((a, b) => b.missing - a.missing || b.hits - a.hits || a.firstSeenAt.localeCompare(b.firstSeenAt))
            .slice(0, limit)
            .map(signal => ({ ...signal }));
    }

    resolveDemand({ book, version = null, startChapter = null, endChapter = null }) {
        for (const [key, signal] of this.demandSignals.entries()) {
            if (signal.book !== book) continue;
            if (version && signal.version !== version) continue;
            if (startChapter !== null && signal.startChapter !== startChapter) continue;
            if (endChapter !== null && signal.endChapter !== endChapter) continue;
            this.demandSignals.delete(key);
        }
    }

    async getSnapshot({
        book,
        startChapter = null,
        endChapter = null,
        version = 'CUV_TRAD',
        targetCount = DEFAULT_INVENTORY_TARGET
    }) {
        const rows = await dbOps.getPlayableQuestionInventory({
            book,
            startChapter,
            endChapter,
            version
        });
        return buildInventorySnapshot(rows, { book, version, targetCount });
    }

    async getBookCoverage({
        books,
        version = 'CUV_TRAD',
        targetCount = DEFAULT_INVENTORY_TARGET
    }) {
        const requestedBooks = Array.from(new Set((books || []).filter(Boolean)));
        if (requestedBooks.length === 0) return [];

        const rows = await dbOps.getPlayableQuestionInventory({ books: requestedBooks, version });
        const rowsByBook = new Map(requestedBooks.map(book => [book, []]));
        for (const row of rows) {
            if (!rowsByBook.has(row.book)) rowsByBook.set(row.book, []);
            rowsByBook.get(row.book).push(row);
        }

        return requestedBooks.map(book => buildInventorySnapshot(rowsByBook.get(book), {
            book,
            version,
            targetCount
        })).sort((a, b) => bibleTranslator.compareBooks(a.book, b.book));
    }
}

export const questionInventoryService = new QuestionInventoryService();
export default questionInventoryService;
