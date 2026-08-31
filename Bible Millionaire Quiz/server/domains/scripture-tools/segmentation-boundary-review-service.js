import { dbOps } from '../../database/index.js';
import { LogosEngine } from '../../infrastructure/ai/LogosEngine.js';
import {
    activeProtectedTerms,
    persistReviewedSegmentation
} from './segmentation-cruise-service.js';
import { segmentScriptureVerse } from './healthy-segmentation-engine.js';

const ALLOWED_DECISIONS = new Set(['KEEP', 'FORBID', 'PREFER']);
let workerPromise = null;

function jsonValue(value, fallback) {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return fallback; }
}

function promptFor(entry, candidates, protectedTerms) {
    const compactCandidates = candidates.map(boundary => ({
        id: boundary.id,
        offset: boundary.offset,
        kind: boundary.kind,
        left: entry.displayText.slice(Math.max(0, boundary.offset - 6), boundary.offset),
        right: entry.displayText.slice(boundary.offset, boundary.offset + 6)
    }));
    return [
        '你只審查既有切點，不得改寫、重排或補充經文。',
        '每個 decision 只能是 KEEP、FORBID、PREFER；boundaryId 必須來自候選清單。',
        '這是經文記憶切片，不是經文理解題；每片不必是完整句子，也允許語法關係跨片延續。',
        '切點兩側必須是可理解、可自然接續的詞彙或詞組，不得切進人物、地名、稱謂、固定詞組或單一詞彙。',
        '避免把因為、使、從等功能詞單獨留在片尾；開引號跟隨說話內容，結束標點留在前片。',
        '優先形成六至八個可見中文字的記憶片段，一般不得超過十字；短而自然的片段可以保留。',
        '在符合以上條件的切點標成 KEEP 或 PREFER；不確定時標成 FORBID。',
        JSON.stringify({
            scripture: entry.displayText,
            protectedTerms: protectedTerms.map(item => item.term).filter(term => entry.displayText.includes(term)),
            candidateBoundaries: compactCandidates
        })
    ].join('\n');
}

function normalizeAiOutput(value, candidateIds) {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    const decisions = Array.isArray(parsed?.decisions) ? parsed.decisions : [];
    const map = {};
    for (const item of decisions) {
        const boundaryId = String(item?.boundaryId || '');
        const decision = String(item?.decision || '').toUpperCase();
        if (!candidateIds.has(boundaryId)) throw new Error('AI_UNKNOWN_BOUNDARY_ID');
        if (!ALLOWED_DECISIONS.has(decision)) throw new Error('AI_INVALID_BOUNDARY_DECISION');
        map[boundaryId] = decision;
    }
    return map;
}

async function reserveFreeRequest(entryKey) {
    const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    const cap = Math.max(0, Number.parseInt(process.env.SCRIPTURE_SEGMENTATION_AI_DAILY_REQUEST_CAP || '20', 10) || 0);
    if (cap === 0) return false;
    return dbOps.gamesDb.transaction(async tx => {
        await tx.run(`
            INSERT INTO scripture_order_segmentation_ai_usage (usage_date, request_count, estimated_input_tokens)
            VALUES ($1,0,0) ON CONFLICT (usage_date) DO NOTHING
        `, [date]);
        const usage = await tx.get(`
            SELECT request_count FROM scripture_order_segmentation_ai_usage WHERE usage_date = $1 FOR UPDATE
        `, [date]);
        if (Number(usage?.requestCount || 0) >= cap) return false;
        const requestKey = `boundary-review:${entryKey}`;
        const duplicate = await tx.get(`
            SELECT idempotency_key FROM scripture_order_segmentation_ai_requests WHERE idempotency_key = $1
        `, [requestKey]);
        if (duplicate) return false;
        await tx.run(`
            UPDATE scripture_order_segmentation_ai_usage
            SET request_count = request_count + 1, updated_at = CURRENT_TIMESTAMP WHERE usage_date = $1
        `, [date]);
        await tx.run(`
            INSERT INTO scripture_order_segmentation_ai_requests
                (idempotency_key, usage_date, passage_id, source_hash, model_id, estimated_input_tokens)
            VALUES ($1,$2,$3,$4,$5,$6)
        `, [requestKey, date, `verse:${entryKey}`, entryKey,
            process.env.SCRIPTURE_SEGMENTATION_AI_MODEL || 'gemini-3.1-flash-lite', 0]);
        return true;
    });
}

async function freeBoundaryReview(prompt, entryKey) {
    if (!await reserveFreeRequest(entryKey)) throw new Error('FREE_REVIEW_QUOTA_UNAVAILABLE');
    const model = String(process.env.SCRIPTURE_SEGMENTATION_AI_MODEL || 'gemini-3.1-flash-lite');
    const requestKey = `boundary-review:${entryKey}`;
    try {
        const response = await LogosEngine.askBrain('scripture_segmentation_boundary_review', {
            systemInstruction: '你是繁體中文經文切點審查器，只輸出符合 schema 的 JSON。',
            rawPrompt: prompt,
            maxTokens: 1024
        }, {
            model,
            freeOnly: true,
            retry: false,
            maxAttempts: 1,
            requestTimeoutMs: 15000,
            thinkingBudget: 0,
            correlationId: `scripture-boundary:${entryKey}`
        });
        if (response?.error) throw new Error(response.error);
        await dbOps.gamesDb.run(`
            UPDATE scripture_order_segmentation_ai_requests
            SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP
            WHERE idempotency_key = $1
        `, [requestKey]);
        return { output: response, provider: 'FREE_GEMINI', modelId: model };
    } catch (error) {
        const failureCode = String(error?.message || 'FREE_BOUNDARY_REVIEW_FAILED').slice(0, 120);
        await dbOps.gamesDb.run(`
            UPDATE scripture_order_segmentation_ai_requests
            SET status = $1, failure_code = $2, completed_at = CURRENT_TIMESTAMP
            WHERE idempotency_key = $3
        `, [failureCode.includes('TIMEOUT') ? 'TIMED_OUT' : 'FAILED', failureCode, requestKey]);
        throw error;
    }
}

async function claimNext() {
    return dbOps.gamesDb.transaction(async tx => {
        const item = await tx.get(`
            SELECT q.entry_key
            FROM scripture_segmentation_ai_queue q
            WHERE q.status = 'PENDING' AND q.available_at <= CURRENT_TIMESTAMP
            ORDER BY q.created_at
            LIMIT 1 FOR UPDATE SKIP LOCKED
        `);
        if (!item) return null;
        await tx.run(`
            UPDATE scripture_segmentation_ai_queue
            SET status = 'RUNNING', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
            WHERE entry_key = $1
        `, [item.entryKey]);
        return tx.get('SELECT * FROM scripture_segmentation_entries WHERE entry_key = $1', [item.entryKey]);
    });
}

async function reviewEntry(entry) {
    const protectedTerms = await activeProtectedTerms();
    const machine = segmentScriptureVerse(entry.rawText, { protectedTerms });
    const candidateIds = new Set(machine.candidateBoundaries.map(boundary => boundary.id));
    const prompt = promptFor(entry, machine.candidateBoundaries, protectedTerms);
    const result = await freeBoundaryReview(prompt, entry.entryKey);
    const decisions = normalizeAiOutput(result.output, candidateIds);
    const reviewed = segmentScriptureVerse(entry.rawText, { protectedTerms, boundaryDecisions: decisions });
    if (reviewed.healthState !== 'VALID' || reviewed.voiceReady !== true) {
        throw new Error('AI_BOUNDARY_RESULT_NOT_MEMORY_READY');
    }
    if (reviewed.displayText !== entry.displayText) throw new Error('AI_CHANGED_SCRIPTURE_TEXT');
    await persistReviewedSegmentation({ sourceEntry: entry, segmentation: reviewed, provider: result.provider, modelId: result.modelId });
    await dbOps.gamesDb.run(`
        UPDATE scripture_segmentation_ai_queue
        SET status = 'COMPLETED', provider = $1, model_id = $2,
            completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE entry_key = $3
    `, [result.provider, result.modelId, entry.entryKey]);
}

export async function processSegmentationBoundaryReviewQueue({ limit = 20 } = {}) {
    if (workerPromise) return workerPromise;
    workerPromise = (async () => {
        const maximum = Math.min(100, Math.max(1, Number(limit) || 20));
        let completed = 0;
        let failed = 0;
        for (let index = 0; index < maximum; index += 1) {
            const entry = await claimNext();
            if (!entry) break;
            try {
                await reviewEntry(entry);
                completed += 1;
            } catch (error) {
                failed += 1;
                await dbOps.gamesDb.run(`
                    UPDATE scripture_segmentation_ai_queue
                    SET status = 'FAILED', failure_code = $1, updated_at = CURRENT_TIMESTAMP
                    WHERE entry_key = $2
                `, [String(error?.message || 'AI_BOUNDARY_REVIEW_FAILED').slice(0, 120), entry.entryKey]);
            }
        }
        return { completed, failed };
    })().finally(() => { workerPromise = null; });
    return workerPromise;
}

export default processSegmentationBoundaryReviewQueue;
