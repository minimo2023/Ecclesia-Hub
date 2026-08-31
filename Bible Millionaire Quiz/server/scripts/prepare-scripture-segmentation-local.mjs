import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { initializeInfrastructure, dbOps } from '../database/index.js';
import { LogosEngine } from '../infrastructure/ai/LogosEngine.js';
import {
    buildSegmentationLearningPrompt,
    convertFlatCandidateToPerVerse,
    LOCAL_SEGMENTATION_OUTPUT_SCHEMA,
    SEGMENTATION_LEARNING_VERSION,
    validateSegmentationCandidate
} from '../domains/scripture-tools/segmentation-learning.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const args = new Map(process.argv.slice(2).map(argument => {
    const [key, ...rest] = argument.split('=');
    return [key, rest.join('=') || true];
}));
const limit = Math.min(20, Math.max(1, Number(args.get('--limit') || 3)));
const passageId = args.get('--passage');
const storeCandidates = args.has('--store-candidates');
const freeFallback = !args.has('--no-free-fallback');
const model = String(args.get('--model') || process.env.SCRIPTURE_SEGMENTATION_LOCAL_MODEL || 'gemma4:12b');
const ollamaBaseUrl = String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/u, '');
const localTimeoutMs = Math.min(90_000, Math.max(5_000, Number(args.get('--local-timeout-ms') || 20_000)));

function rows(value) {
    return Array.isArray(value) ? value : (Array.isArray(value?.rows) ? value.rows : []);
}

function sourceVersesForPassage(passage) {
    const value = passage.sourceVerses ?? passage.source_verses;
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return (Array.isArray(parsed) ? parsed : []).map(verse => ({
        verse: Number(verse.verse),
        text: String(verse.text || '')
    }));
}

async function callLocalModel(prompt) {
    const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
        method: 'POST',
        signal: AbortSignal.timeout(localTimeoutMs),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            model,
            stream: false,
            format: LOCAL_SEGMENTATION_OUTPUT_SCHEMA,
            keep_alive: '10m',
            options: {
                temperature: 0.1,
                num_ctx: 10240,
                num_predict: 4096
            },
            messages: [
                { role: 'system', content: '只輸出符合 JSON Schema 的經文切片候選。' },
                { role: 'user', content: prompt }
            ]
        })
    });
    if (!response.ok) throw new Error(`LOCAL_MODEL_HTTP_${response.status}`);
    const body = await response.json();
    return {
        output: JSON.parse(body?.message?.content || '{}'),
        usage: {
            inputTokens: Number(body?.prompt_eval_count || 0),
            outputTokens: Number(body?.eval_count || 0),
            totalDurationNs: Number(body?.total_duration || 0)
        }
    };
}

async function callFreeModel(passages, learningExamples) {
    const results = [];
    const failures = [];
    for (const passage of passages) {
        const sourceText = passage.verses.map(verse => verse.text).join('');
        const generated = await LogosEngine.askBrain('scripture_order_fragment_generation', {
            reference: passage.reference || passage.passageId,
            source_text: sourceText,
            verse_texts: JSON.stringify(passage.verses),
            learning_examples: JSON.stringify(learningExamples),
            target_count: passage.targetCount,
            maxTokens: 3072
        }, {
            freeOnly: true,
            compactSystemInstruction: true,
            retry: false,
            maxAttempts: 1,
            correlationId: `scripture-segmentation-free:${passage.passageId}:${passage.revision}`
        });
        const converted = convertFlatCandidateToPerVerse(passage, generated?.fragments);
        if (!converted) {
            failures.push({
                passageId: passage.passageId,
                code: generated?.error || 'FREE_CANDIDATE_VERSE_BOUNDARY_FAILED'
            });
            continue;
        }
        results.push(converted);
    }
    return { output: { results }, failures, usage: null };
}

const learningPath = path.resolve(__dirname, '../data/scripture-segmentation/learning-examples.v1.json');
const learningExamples = JSON.parse(await fs.readFile(learningPath, 'utf8'));
await initializeInfrastructure();

try {
    const params = [];
    let where = "WHERE is_official = TRUE AND is_published = TRUE AND version = 'CUV_TRAD'";
    if (passageId && passageId !== true) {
        params.push(String(passageId));
        where += ` AND id = $${params.length}`;
    }
    params.push(limit);
    const passages = rows(await dbOps.gamesDb.query(`
        SELECT id, book, chapter, verse_start, verse_end, source_verses,
               source_hash, revision, fragment_count
        FROM scripture_order_lab_passages
        ${where}
        ORDER BY book, chapter, verse_start
        LIMIT $${params.length}
    `, params)).map(passage => ({
        passageId: String(passage.id),
        reference: `${passage.book} ${passage.chapter}:${passage.verseStart ?? passage.verse_start}-${passage.verseEnd ?? passage.verse_end}`,
        sourceHash: passage.sourceHash ?? passage.source_hash,
        revision: Number(passage.revision || 1),
        targetCount: Number(passage.fragmentCount ?? passage.fragment_count ?? 12),
        verses: sourceVersesForPassage(passage)
    }));

    if (!passages.length) throw new Error('NO_SCRIPTURE_SEGMENTATION_PASSAGES');
    const prompt = buildSegmentationLearningPrompt(passages, learningExamples);
    let route = 'local';
    let localFailure = null;
    let generated;
    try {
        generated = await callLocalModel(prompt);
        const localValidation = validateSegmentationCandidate(passages, generated.output, learningExamples);
        if (!localValidation.valid) {
            localFailure = {
                code: 'LOCAL_CANDIDATE_VALIDATION_FAILED',
                errors: localValidation.errors
            };
            generated = null;
        }
    } catch (error) {
        localFailure = {
            code: error?.name === 'TimeoutError' ? 'LOCAL_MODEL_TIMEOUT' : 'LOCAL_MODEL_FAILED',
            message: error?.message || String(error)
        };
    }
    if (!generated && freeFallback) {
        route = 'free-key-fallback';
        generated = await callFreeModel(passages, learningExamples);
    }
    if (!generated) {
        route = 'rules-only';
        generated = { output: { results: [] }, failures: [{ code: 'NO_AI_CANDIDATE' }], usage: null };
    }
    const validation = validateSegmentationCandidate(passages, generated.output, learningExamples);

    if (storeCandidates && validation.valid) {
        const byId = new Map(generated.output.results.map(result => [result.passageId, result]));
        for (const passage of passages) {
            const result = byId.get(passage.passageId);
            await dbOps.gamesDb.run(`
                UPDATE scripture_order_lab_passages
                SET audit_details = audit_details || $1::jsonb,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2 AND source_hash = $3 AND revision = $4
            `, [JSON.stringify({
                localSegmentationCandidate: {
                    version: SEGMENTATION_LEARNING_VERSION,
                    model,
                    generatedAt: new Date().toISOString(),
                    sourceHash: passage.sourceHash,
                    candidate: result,
                    warnings: validation.warnings.filter(item => item.passageId === passage.passageId),
                    qualityState: validation.warnings.some(item => item.passageId === passage.passageId)
                        ? 'NEEDS_REVIEW'
                        : 'READY_FOR_REVIEW',
                    officialFragmentsChanged: false
                }
            }), passage.passageId, passage.sourceHash, passage.revision]);
        }
    }

    console.log(JSON.stringify({
        mode: storeCandidates ? 'store-candidates' : 'dry-run',
        version: SEGMENTATION_LEARNING_VERSION,
        route,
        model,
        localTimeoutMs,
        localFailure,
        fallbackFailures: generated.failures || [],
        passages: passages.length,
        validation,
        stored: storeCandidates && validation.valid,
        officialFragmentsChanged: false,
        usage: generated.usage,
        candidate: generated.output
    }, null, 2));
    if (!validation.valid) process.exitCode = 2;
} finally {
    for (const adapter of new Set([dbOps.usersDb, dbOps.contentDb, dbOps.notesDb, dbOps.gamesDb])) {
        await adapter.close();
    }
}
