import dotenv from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import {
    protectedCoreTerms,
    segmentScriptureVerse
} from '../domains/scripture-tools/healthy-segmentation-engine.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const { Pool } = pg;
const requestedVersions = String(
    process.argv.find(argument => argument.startsWith('--versions='))?.split('=')[1]
        || 'CUV_TRAD,LCC_TRAD,TCV2010_TRAD,CNV_TRAD'
).split(',').map(value => value.trim().toUpperCase()).filter(Boolean);
const sampleLimit = Math.min(50, Math.max(1, Number.parseInt(
    process.argv.find(argument => argument.startsWith('--sample-limit='))?.split('=')[1] || '10',
    10
) || 10));

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number.parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'bible_quiz_v3',
    max: 2
});

function increment(target, key) {
    target[key] = Number(target[key] || 0) + 1;
}

function visible(value) {
    return String(value || '').replace(/[\p{P}\p{S}\s]/gu, '');
}

function sample(list, item) {
    if (list.length < sampleLimit) list.push(item);
}

const wordSegmenter = new Intl.Segmenter('zh-Hant', { granularity: 'word' });

function finalWord(value) {
    return String([...wordSegmenter.segment(value)].filter(item => item.isWordLike).at(-1)?.segment || '');
}

try {
    const { rows } = await pool.query(`
        SELECT version, book, chapter, verse, text
        FROM bible_verses
        WHERE version = ANY($1::text[])
        ORDER BY version, book, chapter, verse
    `, [requestedVersions]);
    const protectedTerms = protectedCoreTerms();
    const reports = Object.fromEntries(requestedVersions.map(version => [version, {
        sourceVerses: 0,
        exactFailures: 0,
        aspectParticleCuts: 0,
        genitiveTailCuts: 0,
        causativeTailCuts: 0,
        memoryReady: 0,
        voiceReady: 0,
        sourceStates: {},
        boundaryStates: {},
        lengthStates: {},
        healthStates: {},
        confidence: {},
        samples: {
            exactFailures: [],
            omitted: [],
            sourceReview: [],
            boundaryReview: [],
            longExceptions: [],
            aspectParticleCuts: [],
            genitiveTailCuts: [],
            causativeTailCuts: []
        }
    }]));

    for (const row of rows) {
        const report = reports[row.version];
        if (!report) continue;
        report.sourceVerses += 1;
        const result = segmentScriptureVerse(row.text, {
            protectedTerms,
            version: row.version
        });
        increment(report.sourceStates, result.sourceState);
        increment(report.boundaryStates, result.boundaryState);
        increment(report.lengthStates, result.lengthState);
        increment(report.healthStates, result.healthState);
        increment(report.confidence, result.confidence);
        if (result.memoryReady) report.memoryReady += 1;
        if (result.voiceReady) report.voiceReady += 1;
        const reference = `${row.book} ${row.chapter}:${row.verse}`;
        if (result.fragments.join('') !== result.displayText) {
            report.exactFailures += 1;
            sample(report.samples.exactFailures, {
                reference,
                rawText: row.text,
                displayText: result.displayText,
                issues: result.issues,
                candidateBoundaryCount: result.candidateBoundaries.length
            });
        }
        if (!result.displayText) {
            sample(report.samples.omitted, { reference, rawText: row.text, issues: result.issues });
        }
        if (result.sourceState === 'REVIEW_REQUIRED') {
            sample(report.samples.sourceReview, {
                reference,
                rawText: row.text,
                displayText: result.displayText,
                issues: result.normalizationIssues
            });
        }
        if (result.boundaryState === 'REVIEW_REQUIRED') {
            sample(report.samples.boundaryReview, {
                reference,
                fragments: result.fragments,
                maximumVisibleLength: result.maximumVisibleLength
            });
        }
        if (result.lengthState === 'LONG_EXCEPTION') {
            sample(report.samples.longExceptions, {
                reference,
                fragments: result.fragments,
                maximumVisibleLength: result.maximumVisibleLength
            });
        }
        for (let index = 0; index < result.fragments.length - 1; index += 1) {
            const left = visible(result.fragments[index]);
            const right = visible(result.fragments[index + 1]);
            const boundary = result.selectedBoundaries[index];
            const semanticPunctuation = boundary?.kind === 'SENTENCE'
                || boundary?.kind === 'PHRASE'
                || (boundary?.kind === 'CLAUSE' && /[；;]/u.test(boundary?.punctuation || ''));
            if (!semanticPunctuation && /^(?:了|著|過)/u.test(right)) {
                report.aspectParticleCuts += 1;
                sample(report.samples.aspectParticleCuts, {
                    reference,
                    boundary: `${result.fragments[index]}|${result.fragments[index + 1]}`,
                    kind: boundary?.kind,
                    status: boundary?.status
                });
            }
            if (!semanticPunctuation && /的$/u.test(left)) {
                report.genitiveTailCuts += 1;
                sample(report.samples.genitiveTailCuts, {
                    reference,
                    boundary: `${result.fragments[index]}|${result.fragments[index + 1]}`,
                    kind: boundary?.kind,
                    status: boundary?.status
                });
            }
            if (!semanticPunctuation
                && /^(?:不|未|要|能|可|會|勿|別|莫|必)?(?:使|叫|讓)$/u.test(finalWord(left))) {
                report.causativeTailCuts += 1;
                sample(report.samples.causativeTailCuts, {
                    reference,
                    boundary: `${result.fragments[index]}|${result.fragments[index + 1]}`,
                    kind: boundary?.kind,
                    status: boundary?.status
                });
            }
        }
    }

    const summary = {
        rule: 'v14-boundary-graph',
        requestedVersions,
        totalSourceVerses: rows.length,
        reports
    };
    console.log(JSON.stringify(summary, null, 2));
    const failed = Object.values(reports).some(report => (
        report.sourceVerses === 0
        || report.exactFailures > 0
        || report.aspectParticleCuts > 0
        || report.genitiveTailCuts > 0
        || report.causativeTailCuts > 0
        || Number(report.sourceStates.REVIEW_REQUIRED || 0) > 0
    ));
    process.exitCode = failed ? 1 : 0;
} finally {
    await pool.end();
}
