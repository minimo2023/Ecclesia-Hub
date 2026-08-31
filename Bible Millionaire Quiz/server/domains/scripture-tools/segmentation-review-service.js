import { readFileSync } from 'node:fs';
import { dbOps } from '../../database/index.js';
import { LogosEngine } from '../../infrastructure/ai/LogosEngine.js';
import {
    buildSegmentationLearningPrompt,
    validateSegmentationCandidate
} from './segmentation-learning.js';
import { sha256, splitVerseForOrder, verifyFragments } from './order-engine.js';
import {
    SCRIPTURE_SEGMENTATION_REVIEW_VERSION,
    SCRIPTURE_SEGMENTATION_RULE_VERSION,
    decideSegmentationAiReview,
    estimateSegmentationInputTokens,
    scriptureSegmentationReviewConfig,
    withSoftDeadline
} from './segmentation-review-policy.js';

const learningExamples = JSON.parse(readFileSync(
    new URL('../../data/scripture-segmentation/learning-examples.v1.json', import.meta.url),
    'utf8'
));
const inFlightReviews = new Map();

function jsonValue(value, fallback) {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return fallback; }
}

function quotaDate(now = new Date()) {
    return now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

function verseCacheKey({ version, book, chapter, verse, sourceHash }) {
    return sha256([
        version,
        book,
        chapter,
        verse,
        sourceHash,
        SCRIPTURE_SEGMENTATION_RULE_VERSION
    ].join(':'));
}

function validCachedFragments(row, sourceText) {
    const fragments = jsonValue(row?.finalFragments, []);
    const details = jsonValue(row?.reviewDetails, {});
    const reusableState = row?.reviewState === 'AI_ACCEPTED'
        || (row?.reviewState === 'RULES_ONLY' && ['VALID', 'VALID_LONG'].includes(details.healthState));
    return reusableState
        && fragments.length > 0
        && fragments.every(fragment => typeof fragment === 'string' && fragment.length > 0)
        && fragments.join('') === sourceText;
}

async function storeMachineCache(candidate) {
    await dbOps.gamesDb.run(`
        INSERT INTO scripture_order_segmentation_cache
            (cache_key, version, book, chapter, verse, source_hash, rule_version,
             machine_fragments, final_fragments, confidence, review_state, review_details)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$8::jsonb,$9,'RULES_ONLY',$10::jsonb)
        ON CONFLICT (cache_key) DO UPDATE SET
            machine_fragments = EXCLUDED.machine_fragments,
            final_fragments = EXCLUDED.final_fragments,
            confidence = EXCLUDED.confidence,
            review_details = scripture_order_segmentation_cache.review_details || EXCLUDED.review_details,
            updated_at = CURRENT_TIMESTAMP
    `, [candidate.cacheKey, candidate.version, candidate.book, candidate.chapter, candidate.verse,
        candidate.sourceHash, SCRIPTURE_SEGMENTATION_RULE_VERSION,
        JSON.stringify(candidate.machineFragments), candidate.confidence,
        JSON.stringify({ machineIssues: candidate.issues })]);
}

async function storeReviewCache(candidate, fragments, state, details, model) {
    await dbOps.gamesDb.run(`
        UPDATE scripture_order_segmentation_cache
        SET final_fragments = $1::jsonb,
            review_state = $2,
            review_model = $3,
            review_details = review_details || $4::jsonb,
            updated_at = CURRENT_TIMESTAMP
        WHERE cache_key = $5
    `, [JSON.stringify(fragments), state, model, JSON.stringify(details), candidate.cacheKey]);
}

async function dailyRequestCount(date) {
    const row = await dbOps.gamesDb.get(`
        SELECT request_count FROM scripture_order_segmentation_ai_usage WHERE usage_date = $1
    `, [date]);
    return Number(row?.requestCount || 0);
}

async function reserveReviewRequest({ idempotencyKey, date, passage, model, estimatedTokens, cap }) {
    return dbOps.gamesDb.transaction(async tx => {
        await tx.run(`
            INSERT INTO scripture_order_segmentation_ai_usage
                (usage_date, request_count, estimated_input_tokens)
            VALUES ($1, 0, 0) ON CONFLICT (usage_date) DO NOTHING
        `, [date]);
        const usage = await tx.get(`
            SELECT request_count FROM scripture_order_segmentation_ai_usage
            WHERE usage_date = $1 FOR UPDATE
        `, [date]);
        const duplicate = await tx.get(`
            SELECT status FROM scripture_order_segmentation_ai_requests WHERE idempotency_key = $1
        `, [idempotencyKey]);
        if (duplicate) return { reserved: false, reason: 'REVIEW_ALREADY_REQUESTED' };
        if (Number(usage?.requestCount || 0) >= cap) {
            return { reserved: false, reason: 'REVIEW_DAILY_QUOTA_REACHED' };
        }
        await tx.run(`
            UPDATE scripture_order_segmentation_ai_usage
            SET request_count = request_count + 1,
                estimated_input_tokens = estimated_input_tokens + $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE usage_date = $2
        `, [estimatedTokens, date]);
        await tx.run(`
            INSERT INTO scripture_order_segmentation_ai_requests
                (idempotency_key, usage_date, passage_id, source_hash, model_id, estimated_input_tokens)
            VALUES ($1,$2,$3,$4,$5,$6)
        `, [idempotencyKey, date, passage.id, passage.sourceHash, model, estimatedTokens]);
        return { reserved: true };
    });
}

async function finishReviewRequest(idempotencyKey, status, failureCode = null) {
    await dbOps.gamesDb.run(`
        UPDATE scripture_order_segmentation_ai_requests
        SET status = $1, failure_code = $2, completed_at = CURRENT_TIMESTAMP
        WHERE idempotency_key = $3
    `, [status, failureCode, idempotencyKey]);
}

function flattenCandidates(candidates) {
    return candidates.flatMap(candidate => candidate.finalFragments).map((text, index) => ({
        id: `f${index + 1}`,
        text
    }));
}

async function applyAcceptedReview({ passage, candidates, reviewedByVerse, model, validation }) {
    for (const candidate of candidates) {
        const reviewed = reviewedByVerse.get(candidate.verse);
        if (reviewed) {
            candidate.finalFragments = reviewed.fragments;
            await storeReviewCache(candidate, reviewed.fragments, 'AI_ACCEPTED', {
                reviewVersion: SCRIPTURE_SEGMENTATION_REVIEW_VERSION,
                uncertainBoundaries: reviewed.uncertainBoundaries,
                warnings: validation.warnings.filter(item => item.verse === candidate.verse)
            }, model);
        }
    }
    const fragments = flattenCandidates(candidates);
    if (!verifyFragments(passage.sourceText, fragments)) throw new Error('AI_REVIEW_FINAL_REASSEMBLY_FAILED');

    await dbOps.gamesDb.run(`
        UPDATE scripture_order_lab_passages
        SET fragments = $1::jsonb,
            fragment_count = $2,
            segmentation_method = 'rules_plus_ai_semantic_review',
            segmentation_version = $3,
            generation_model = $4,
            audit_state = 'PASS',
            audit_details = audit_details || $5::jsonb,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $6 AND source_hash = $7
    `, [JSON.stringify(fragments), fragments.length,
        `${SCRIPTURE_SEGMENTATION_RULE_VERSION}+${SCRIPTURE_SEGMENTATION_REVIEW_VERSION}`,
        model, JSON.stringify({
            runtimeAi: true,
            semanticReview: 'AI_ACCEPTED',
            reviewedVerses: [...reviewedByVerse.keys()]
        }), passage.id, passage.sourceHash]);
    return dbOps.gamesDb.get('SELECT * FROM scripture_order_lab_passages WHERE id = $1', [passage.id]);
}

async function runAiReview({ passage, candidates, reviewCandidates, prompt, config, requestKey }) {
    const reviewPassageId = `${passage.id}:low-confidence`;
    try {
        const response = await LogosEngine.askBrain('scripture_segmentation_review_generation', {
            systemInstruction: '你是經文排序遊戲的繁體中文逐節切片審查器。只輸出符合要求的 JSON。',
            rawPrompt: prompt,
            maxTokens: 2048
        }, {
            model: config.model,
            freeOnly: true,
            retry: false,
            maxAttempts: 1,
            maxQueueWaitMs: config.softDeadlineMs,
            requestTimeoutMs: config.hardTimeoutMs,
            thinkingBudget: 0,
            correlationId: requestKey
        });
        if (response?.error) throw new Error(response.error);
        const expected = [{
            passageId: reviewPassageId,
            verses: reviewCandidates.map(candidate => ({
                verse: candidate.verse,
                text: candidate.text,
                machineFragments: candidate.machineFragments
            }))
        }];
        const validation = validateSegmentationCandidate(expected, response, learningExamples);
        if (!validation.valid) {
            for (const candidate of reviewCandidates) {
                await storeReviewCache(candidate, candidate.machineFragments, 'AI_REJECTED', {
                    reviewVersion: SCRIPTURE_SEGMENTATION_REVIEW_VERSION,
                    errors: validation.errors
                }, config.model);
            }
            await finishReviewRequest(requestKey, 'FAILED', 'AI_CANDIDATE_VALIDATION_FAILED');
            return { passage, state: 'AI_REJECTED', validation };
        }
        const result = response.results.find(item => item.passageId === reviewPassageId);
        const reviewedByVerse = new Map(result.verses.map(verse => [Number(verse.verse), verse]));
        const updated = await applyAcceptedReview({ passage, candidates, reviewedByVerse, model: config.model, validation });
        await finishReviewRequest(requestKey, 'COMPLETED');
        return { passage: updated, state: 'AI_ACCEPTED', validation };
    } catch (error) {
        const timedOut = /timed out|timeout/iu.test(error?.message || '');
        for (const candidate of reviewCandidates) {
            await storeReviewCache(candidate, candidate.machineFragments, 'AI_FAILED', {
                reviewVersion: SCRIPTURE_SEGMENTATION_REVIEW_VERSION,
                failureCode: timedOut ? 'AI_REVIEW_TIMEOUT' : 'AI_REVIEW_FAILED'
            }, config.model);
        }
        await finishReviewRequest(requestKey, timedOut ? 'TIMED_OUT' : 'FAILED',
            timedOut ? 'AI_REVIEW_TIMEOUT' : 'AI_REVIEW_FAILED');
        return { passage, state: timedOut ? 'AI_TIMEOUT_FALLBACK' : 'AI_ERROR_FALLBACK' };
    }
}

async function prepareCandidates(passage) {
    const version = String(passage.version || 'CUV_TRAD');
    const verses = jsonValue(passage.sourceVerses, []);
    const candidates = [];
    for (const verse of verses) {
        const text = String(verse.text || '');
        const machine = splitVerseForOrder(text);
        const sourceHash = sha256(text);
        const candidate = {
            version,
            book: passage.book,
            chapter: Number(passage.chapter),
            verse: Number(verse.verse),
            text,
            sourceHash,
            machineFragments: machine.fragments,
            finalFragments: machine.fragments,
            // The legacy preview cache accepts HIGH/LOW only. A VALID_LONG
            // machine result still needs semantic review, so route MEDIUM
            // through the existing LOW-confidence review path.
            confidence: machine.confidence === 'HIGH' ? 'HIGH' : 'LOW',
            issues: machine.issues
        };
        candidate.cacheKey = verseCacheKey(candidate);
        const cached = await dbOps.gamesDb.get(`
            SELECT * FROM scripture_order_segmentation_cache WHERE cache_key = $1
        `, [candidate.cacheKey]);
        if (validCachedFragments(cached, text)) {
            candidate.finalFragments = jsonValue(cached.finalFragments, machine.fragments);
            candidate.aiCacheHit = true;
        } else {
            await storeMachineCache(candidate);
        }
        candidates.push(candidate);
    }
    return candidates;
}

export async function reviewCustomPassageSegmentation(passage, env = process.env) {
    const config = scriptureSegmentationReviewConfig(env);
    const candidates = await prepareCandidates(passage);
    const cachedFragments = flattenCandidates(candidates);
    const cacheHitCount = candidates.filter(candidate => candidate.aiCacheHit).length;
    if (cacheHitCount > 0 && verifyFragments(passage.sourceText, cachedFragments)) {
        await dbOps.gamesDb.run(`
            UPDATE scripture_order_lab_passages
            SET fragments = $1::jsonb, fragment_count = $2,
                segmentation_method = 'rules_plus_ai_semantic_review',
                segmentation_version = $3, audit_state = 'PASS',
                audit_details = audit_details || $4::jsonb,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $5 AND source_hash = $6
        `, [JSON.stringify(cachedFragments), cachedFragments.length,
            `${SCRIPTURE_SEGMENTATION_RULE_VERSION}+${SCRIPTURE_SEGMENTATION_REVIEW_VERSION}`,
            JSON.stringify({ semanticReview: 'CACHE_APPLIED' }), passage.id, passage.sourceHash]);
        passage = await dbOps.gamesDb.get('SELECT * FROM scripture_order_lab_passages WHERE id = $1', [passage.id]);
    }

    const reviewCandidates = candidates.filter(candidate => candidate.confidence === 'LOW' && !candidate.aiCacheHit);
    const reviewPassageId = `${passage.id}:low-confidence`;
    const prompt = buildSegmentationLearningPrompt([{
        passageId: reviewPassageId,
        verses: reviewCandidates.map(candidate => ({
            verse: candidate.verse,
            text: candidate.text,
            machineFragments: candidate.machineFragments
        }))
    }], learningExamples);
    const estimatedTokens = estimateSegmentationInputTokens(prompt);
    const date = quotaDate();
    const used = await dailyRequestCount(date);
    const decision = decideSegmentationAiReview({
        lowConfidenceVerses: reviewCandidates,
        estimatedInputTokens: estimatedTokens,
        dailyRequestCount: used,
        config
    });
    if (!decision.allowed) {
        return {
            passage,
            review: {
                state: cacheHitCount > 0 ? 'AI_CACHE_APPLIED' : 'RULES_ONLY',
                reason: decision.reason,
                cacheHitCount,
                estimatedTokens
            }
        };
    }

    const requestKey = `scripture-segmentation:${sha256([
        date,
        passage.id,
        passage.sourceHash,
        SCRIPTURE_SEGMENTATION_REVIEW_VERSION,
        reviewCandidates.map(candidate => candidate.cacheKey).join(',')
    ].join(':'))}`;
    const reservation = await reserveReviewRequest({
        idempotencyKey: requestKey,
        date,
        passage,
        model: config.model,
        estimatedTokens,
        cap: config.dailyRequestCap
    });
    if (!reservation.reserved) {
        return { passage, review: { state: 'RULES_ONLY', reason: reservation.reason, estimatedTokens } };
    }

    let reviewPromise = inFlightReviews.get(requestKey);
    if (!reviewPromise) {
        reviewPromise = runAiReview({ passage, candidates, reviewCandidates, prompt, config, requestKey })
            .catch(async error => {
                await finishReviewRequest(requestKey, 'FAILED', 'AI_REVIEW_INTERNAL_FAILURE').catch(() => {});
                return { passage, state: 'AI_ERROR_FALLBACK', internalError: error?.message || String(error) };
            })
            .finally(() => inFlightReviews.delete(requestKey));
        inFlightReviews.set(requestKey, reviewPromise);
    }
    const immediate = await withSoftDeadline(reviewPromise, config.softDeadlineMs);
    if (!immediate.completed) {
        return {
            passage,
            review: {
                state: 'RULES_ONLY',
                reason: 'SOFT_DEADLINE_REACHED',
                backgroundReview: true,
                estimatedTokens
            }
        };
    }
    return {
        passage: immediate.value.passage,
        review: { state: immediate.value.state, estimatedTokens }
    };
}

export default reviewCustomPassageSegmentation;
