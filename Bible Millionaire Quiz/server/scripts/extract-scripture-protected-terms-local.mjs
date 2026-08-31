import { createHash } from 'node:crypto';
import { initializeInfrastructure, dbOps } from '../database/index.js';
import { bibleTranslator } from '../utils/bibleTranslator.js';
import { SCRIPTURE_SEGMENTATION_LEXICON_VERSION } from '../domains/scripture-tools/healthy-segmentation-engine.js';

const apply = process.argv.includes('--apply');
const all = process.argv.includes('--all');
const limit = all ? 31103 : Number(process.argv.find(item => item.startsWith('--limit='))?.split('=')[1] || 500);
const batchSize = Math.min(100, Math.max(10, Number(process.argv.find(item => item.startsWith('--batch-size='))?.split('=')[1] || 50)));
const targetVersion = process.argv.find(item => item.startsWith('--lexicon-version='))?.split('=')[1];
const model = process.env.SCRIPTURE_SEGMENTATION_LOCAL_MODEL || 'gemma4:12b';
const ollama = String(process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/u, '');
const categories = new Set(['PERSON', 'PLACE', 'PEOPLE', 'TITLE', 'PHRASE', 'OTHER']);

if (apply && (!targetVersion || targetVersion === SCRIPTURE_SEGMENTATION_LEXICON_VERSION)) {
    throw new Error('APPLY_REQUIRES_NEW_LEXICON_VERSION');
}

function hash(value) {
    return createHash('sha256').update(String(value)).digest('hex');
}

async function extractBatch(rows) {
    const corpus = rows.map(row => `${row.book} ${row.chapter}:${row.verse} ${row.text}`).join('\n');
    const prompt = [
        '從下列和合本經文抽取不應在中間切斷的人名、地名、族名、稱謂與固定詞組。',
        'term 必須是下列文字中逐字存在的連續子字串，不得改寫或自行補字。',
        '只輸出 JSON：{"terms":[{"term":"...","category":"PERSON|PLACE|PEOPLE|TITLE|PHRASE|OTHER"}]}。',
        corpus
    ].join('\n');
    const response = await fetch(`${ollama}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            stream: false,
            format: 'json',
            options: { temperature: 0, num_ctx: 10240 },
            messages: [{ role: 'user', content: prompt }]
        }),
        signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`LOCAL_MODEL_HTTP_${response.status}`);
    const body = await response.json();
    const parsed = JSON.parse(body?.message?.content || '{}');
    const raw = Array.isArray(parsed?.terms) ? parsed.terms : [];
    return raw.filter(item => {
        const term = String(item?.term || '').trim();
        return term.length >= 2 && term.length <= 20
            && categories.has(item?.category)
            && rows.some(row => String(row.text).includes(term));
    }).map(item => ({ term: String(item.term).trim(), category: item.category }));
}

await initializeInfrastructure();
const books = bibleTranslator.allBooks.map(book => bibleTranslator.toEnglish(book));
const rows = await dbOps.contentDb.query(`
    SELECT book, chapter, verse, text
    FROM bible_verses WHERE version = 'CUV_TRAD'
    ORDER BY array_position($1::text[], book), chapter, verse
    LIMIT $2
`, [books, Math.min(31103, Math.max(1, limit))]);

const candidates = new Map();
for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const extracted = await extractBatch(batch);
    for (const item of extracted) {
        const current = candidates.get(item.term) || { ...item, occurrences: 0 };
        current.occurrences += batch.reduce((count, row) => count + (String(row.text).includes(item.term) ? 1 : 0), 0);
        candidates.set(item.term, current);
    }
    console.log(JSON.stringify({ processed: Math.min(rows.length, offset + batch.length), candidates: candidates.size }));
}

if (apply) {
    for (const item of candidates.values()) {
        await dbOps.gamesDb.run(`
            INSERT INTO scripture_segmentation_protected_terms
                (id, term, normalized_term, category, source, lexicon_version, evidence)
            VALUES ($1,$2,$2,$3,'LOCAL_MODEL',$4,$5::jsonb)
            ON CONFLICT (lexicon_version, normalized_term) DO UPDATE SET
                category = EXCLUDED.category, source = 'LOCAL_MODEL', status = 'ACTIVE',
                evidence = EXCLUDED.evidence, updated_at = CURRENT_TIMESTAMP
        `, [hash(`${targetVersion}:${item.term}`), item.term, item.category, targetVersion,
            JSON.stringify({ model, occurrences: item.occurrences, exactCorpusSubstring: true })]);
    }
}

console.log(JSON.stringify({
    inspectedVerses: rows.length,
    model,
    candidateCount: candidates.size,
    applied: apply,
    targetVersion: apply ? targetVersion : null,
    candidates: [...candidates.values()].sort((left, right) => right.occurrences - left.occurrences).slice(0, 200)
}, null, 2));
process.exit(0);
