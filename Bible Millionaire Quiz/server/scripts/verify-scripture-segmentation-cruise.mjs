import { initializeInfrastructure, dbOps } from '../database/index.js';
import { bibleTranslator } from '../utils/bibleTranslator.js';
import { sha256 } from '../domains/scripture-tools/order-engine.js';
import {
    activeProtectedTerms
} from '../domains/scripture-tools/segmentation-cruise-service.js';
import { validateHealthySegmentation } from '../domains/scripture-tools/healthy-segmentation-engine.js';

function jsonValue(value, fallback) {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return fallback; }
}

await initializeInfrastructure();
const requestedRunId = process.argv.find(argument => argument.startsWith('--run-id='))?.split('=')[1];
const run = requestedRunId
    ? await dbOps.gamesDb.get('SELECT * FROM scripture_segmentation_runs WHERE id = $1', [requestedRunId])
    : await dbOps.gamesDb.get(`
        SELECT * FROM scripture_segmentation_runs
        WHERE status = 'COMPLETED' ORDER BY completed_at DESC LIMIT 1
    `);
if (!run) throw new Error('NO_COMPLETED_SEGMENTATION_RUN');

const [entries, sources, terms] = await Promise.all([
    dbOps.gamesDb.query(`
        SELECT e.*
        FROM scripture_segmentation_run_entries re
        JOIN scripture_segmentation_entries e ON e.entry_key = re.entry_key
        WHERE re.run_id = $1
    `, [run.id]),
    dbOps.contentDb.query(`
        SELECT book, chapter, verse, text FROM bible_verses WHERE version = 'CUV_TRAD'
    `),
    activeProtectedTerms()
]);

const sourceMap = new Map(sources.map(item => [`${item.book}:${item.chapter}:${item.verse}`, item]));
const coordinates = new Set();
const failures = [];
let protectedTermBreaks = 0;
let exactFailures = 0;
let activeDryRunEntries = 0;

for (const entry of entries) {
    const coordinate = `${entry.book}:${entry.chapter}:${entry.verse}`;
    if (coordinates.has(coordinate)) failures.push({ coordinate, code: 'DUPLICATE_COORDINATE' });
    coordinates.add(coordinate);
    const source = sourceMap.get(coordinate);
    if (!source) {
        failures.push({ coordinate, code: 'SOURCE_VERSE_MISSING' });
        continue;
    }
    if (entry.rawHash !== sha256(source.text)) failures.push({ coordinate, code: 'RAW_HASH_MISMATCH' });
    const fragments = jsonValue(entry.fragments, []);
    const offsets = jsonValue(entry.boundaryOffsets, []);
    const omissionIssues = jsonValue(entry.issues, []);
    if (entry.displayText === '' && fragments.length === 0
        && !omissionIssues.some(issue => [
            'EDITORIAL_NOTE_ONLY_VERSE',
            'NON_SCRIPTURE_TEXT_OMITTED'
        ].includes(issue))) {
        failures.push({ coordinate, code: 'EMPTY_VERSE_REASON_MISSING' });
    }
    const validation = validateHealthySegmentation({
        text: entry.displayText,
        fragments,
        boundaryOffsets: offsets,
        protectedTerms: terms
    });
    if (!validation.valid) {
        exactFailures += validation.errors.includes('EXACT_REASSEMBLY_FAILED') ? 1 : 0;
        protectedTermBreaks += validation.brokenTerms.length;
        failures.push({ coordinate, code: validation.errors.join(','), brokenTerms: validation.brokenTerms });
    }
    if (run.dryRun && entry.active && entry.activatedAt
        && new Date(entry.activatedAt).getTime() >= new Date(run.startedAt).getTime()) {
        activeDryRunEntries += 1;
    }
}

for (const coordinate of sourceMap.keys()) {
    if (!coordinates.has(coordinate)) failures.push({ coordinate, code: 'CRUISE_RESULT_MISSING' });
}

const report = {
    runId: run.id,
    status: run.status,
    dryRun: Boolean(run.dryRun),
    sourceVerseCount: sources.length,
    resultCount: entries.length,
    distinctCoordinateCount: coordinates.size,
    exactFailures,
    protectedTermBreaks,
    activeDryRunEntries,
    failureCount: failures.length,
    failures: failures.slice(0, 20),
    canonicalStart: bibleTranslator.toEnglish(bibleTranslator.allBooks[0]),
    canonicalEnd: bibleTranslator.toEnglish(bibleTranslator.allBooks.at(-1))
};
console.log(JSON.stringify(report, null, 2));
process.exit(failures.length === 0 && sources.length === 31103 && entries.length === 31103
    && protectedTermBreaks === 0 && exactFailures === 0 && activeDryRunEntries === 0 ? 0 : 1);
