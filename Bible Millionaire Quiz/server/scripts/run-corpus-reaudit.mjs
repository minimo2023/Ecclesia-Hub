#!/usr/bin/env node

import 'dotenv/config';
import crypto from 'node:crypto';
import { initializeInfrastructure, dbOps } from '../database/index.js';
import { resolveBibleVersion } from '../domains/content/bible/BibleVersionRegistry.js';
import {
    auditQuestionCandidate,
    extractDistractorSets,
    questionQualityService
} from '../domains/game/quality/QuestionQualityService.js';
import {
    QUESTION_QUALITY_STANDARD_VERSION,
    normalizeAnswerText,
    validateDistractorSet
} from '../domains/game/quality/QuestionQualityPolicy.js';
import { getExactQuestionEvidence } from '../domains/game/quality/QuestionEvidenceService.js';
import {
    assessCorpusReauditHistory,
    shouldPreserveInactiveQuestion
} from '../domains/game/quality/QuestionCorpusReauditPolicy.js';
import { assessDifficultyConsensus } from '../domains/game/difficulty/QuestionDifficultyConsensus.js';

const args = process.argv.slice(2);
const hasFlag = name => args.includes(`--${name}`);
const getArg = name => (args.find(arg => arg.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=') || null;
const writeEnabled = hasFlag('write');
const prepareMode = hasFlag('prepare');
const processMode = hasFlag('process');
const statusMode = hasFlag('status');
const verbose = hasFlag('verbose');
const waitForFreeQuota = hasFlag('wait-for-free-quota');
const requestedRunId = getArg('run');
const processLimit = Math.max(1, Math.min(50000, Number.parseInt(getArg('limit') || '1', 10)));
const delayMs = Math.max(0, Math.min(60000, Number.parseInt(getArg('delay-ms') || '0', 10)));

if ([prepareMode, processMode, statusMode].filter(Boolean).length !== 1) {
    console.error('Usage: --prepare|--process|--status [--run=<id>] [--write] [--limit=N] [--delay-ms=N] [--wait-for-free-quota]');
    process.exit(2);
}

function readField(object, camel, snake) {
    return object?.[camel] ?? object?.[snake];
}

function asArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function normalizeRows(result) {
    if (Array.isArray(result)) return result;
    return result?.rows || [];
}

function readFreeQuotaRetryAt(error) {
    const message = String(error?.message || error || '');
    const match = message.match(/FREE_ONLY_QUOTA_EXHAUSTED:retryAt=(\d{10,})/);
    if (!match) return null;
    const retryAt = Number(match[1]);
    return Number.isFinite(retryAt) && retryAt > Date.now() ? retryAt : Date.now() + 60_000;
}

function priorityForQuestion(question) {
    const status = String(question.status || '').toUpperCase();
    const state = String(readField(question, 'qualityState', 'quality_state') || 'LEGACY').toUpperCase();
    if (status === 'PASS' && state === 'VERIFIED') return 5;
    if (status === 'PASS' && state === 'LEGACY') return 10;
    if (status === 'PASS') return 20;
    if (status === 'FLAGGED') return 100;
    if (status === 'FREEZE') return 200;
    return 300;
}

function assessStructure(question) {
    const rawPool = asArray(readField(question, 'distractorsPool', 'distractors_pool'));
    if (rawPool.length === 0 || rawPool.some(set => !Array.isArray(set))) {
        return { ok: false, reason: 'NON_STANDARD_DISTRACTOR_POOL', sets: [] };
    }
    const sets = extractDistractorSets(question);
    if (sets.length === 0) return { ok: false, reason: 'NO_DISTRACTOR_SET', sets: [] };

    const setResults = sets.map((set, index) => ({
        setIndex: index + 1,
        ...validateDistractorSet(question.answer, set, 3)
    }));
    const failedSet = setResults.find(result => !result.ok);
    if (failedSet) return { ok: false, reason: failedSet.reason, sets: setResults };

    return { ok: true, reason: 'PASS', sets: setResults };
}

function answerAppearsLiterally(answer, evidence) {
    const normalizedAnswer = normalizeAnswerText(answer);
    if (!normalizedAnswer || !evidence?.available) return null;
    const normalizedEvidence = normalizeAnswerText(
        (evidence.verses || []).map(verse => verse.text).join(' ')
    );
    return normalizedEvidence.includes(normalizedAnswer);
}

function evidenceIdentity(question, evidence) {
    const resolved = resolveBibleVersion(question.version);
    return {
        requestedVersion: question.version,
        canonicalVersion: evidence?.canonicalVersion || resolved?.canonicalVersion || null,
        storageVersion: evidence?.storageVersion || resolved?.storageVersion || null,
        sourceVersion: evidence?.sourceVersion || resolved?.sourceVersion || null,
        activeSyncRunId: evidence?.activeSyncRunId || null,
        activePromotionId: evidence?.activePromotionId || null
    };
}

async function getCorpusFingerprint() {
    const rows = normalizeRows(await dbOps.contentDb.query(`
        SELECT version_id, source_version, legacy_storage_version, coverage_status,
               actual_books, actual_chapters, actual_verses, blank_verses,
               evidence_eligible, active_sync_run_id, active_promotion_id
        FROM bible_translation_versions
        ORDER BY version_id
    `));
    return { capturedAt: new Date().toISOString(), translations: rows };
}

async function loadRun(runId = null) {
    if (runId) {
        return dbOps.gamesDb.get('SELECT * FROM question_corpus_reaudit_runs WHERE id = $1', [runId]);
    }
    return dbOps.gamesDb.get(`
        SELECT * FROM question_corpus_reaudit_runs
        ORDER BY started_at DESC LIMIT 1
    `);
}

async function refreshRunSummary(runId, { allowComplete = true } = {}) {
    const counts = await dbOps.gamesDb.get(`
        SELECT COUNT(*)::INTEGER AS total,
               COUNT(*) FILTER (WHERE evidence_status = 'PASS')::INTEGER AS evidence_ready,
               COUNT(*) FILTER (WHERE evidence_status <> 'PASS')::INTEGER AS evidence_unavailable,
               COUNT(*) FILTER (WHERE structural_status <> 'PASS')::INTEGER AS structural_failure,
               COUNT(*) FILTER (WHERE ai_status IN ('PENDING', 'RUNNING'))::INTEGER AS ai_pending,
               COUNT(*) FILTER (WHERE ai_status IN ('COMPLETED', 'ERROR'))::INTEGER AS ai_completed,
               COUNT(*) FILTER (WHERE final_result = 'PASS')::INTEGER AS verified,
               COUNT(*) FILTER (WHERE final_result = 'CONTENT_FAILURE')::INTEGER AS content_failure,
               COUNT(*) FILTER (WHERE final_result = 'INCONCLUSIVE')::INTEGER AS inconclusive,
               COUNT(*) FILTER (WHERE final_result = 'RETRY_DISTRACTORS')::INTEGER AS distractor_failure,
               COUNT(*) FILTER (WHERE final_result = 'EVIDENCE_UNAVAILABLE')::INTEGER AS evidence_final,
               COUNT(*) FILTER (WHERE ai_status = 'ERROR')::INTEGER AS errors
        FROM question_corpus_reaudit_items WHERE run_id = $1
    `, [runId]);
    const pending = Number(readField(counts, 'aiPending', 'ai_pending') || 0);
    const total = Number(counts?.total || 0);
    const completed = total > 0 && pending === 0;
    const report = {
        total,
        evidenceReady: Number(readField(counts, 'evidenceReady', 'evidence_ready') || 0),
        evidenceUnavailable: Number(readField(counts, 'evidenceUnavailable', 'evidence_unavailable') || 0),
        structuralFailure: Number(readField(counts, 'structuralFailure', 'structural_failure') || 0),
        aiPending: pending,
        aiCompleted: Number(readField(counts, 'aiCompleted', 'ai_completed') || 0),
        verified: Number(counts?.verified || 0),
        contentFailure: Number(readField(counts, 'contentFailure', 'content_failure') || 0),
        inconclusive: Number(counts?.inconclusive || 0),
        distractorFailure: Number(readField(counts, 'distractorFailure', 'distractor_failure') || 0),
        evidenceFinal: Number(readField(counts, 'evidenceFinal', 'evidence_final') || 0),
        errors: Number(counts?.errors || 0)
    };
    await dbOps.gamesDb.run(`
        UPDATE question_corpus_reaudit_runs
        SET total_questions = $1,
            evidence_ready_count = $2,
            evidence_unavailable_count = $3,
            structural_failure_count = $4,
            ai_pending_count = $5,
            ai_completed_count = $6,
            report = $7::jsonb,
            status = CASE WHEN $8 AND status = 'RUNNING' THEN 'COMPLETED' ELSE status END,
            completed_at = CASE WHEN $8 AND status = 'RUNNING' THEN CURRENT_TIMESTAMP ELSE completed_at END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $9
    `, [
        report.total,
        report.evidenceReady,
        report.evidenceUnavailable,
        report.structuralFailure,
        report.aiPending,
        report.aiCompleted,
        JSON.stringify(report),
        allowComplete && completed,
        runId
    ]);
    return report;
}

async function prepareRun() {
    const existing = await dbOps.gamesDb.get(`
        SELECT id, status FROM question_corpus_reaudit_runs
        WHERE status IN ('PREPARING', 'RUNNING')
        ORDER BY started_at DESC LIMIT 1
    `);
    if (existing && !requestedRunId) {
        throw new Error(`ACTIVE_CORPUS_REAUDIT_EXISTS:${existing.id}:${existing.status}`);
    }

    const runId = requestedRunId || crypto.randomUUID();
    const fingerprint = await getCorpusFingerprint();
    const questions = normalizeRows(await dbOps.gamesDb.query('SELECT * FROM questions ORDER BY id'));
    const counts = { total: questions.length, evidenceReady: 0, evidenceUnavailable: 0, structuralFailure: 0, aiPending: 0 };

    if (writeEnabled) {
        await dbOps.gamesDb.run(`
            INSERT INTO question_corpus_reaudit_runs
                (id, standard_version, status, corpus_fingerprint, total_questions)
            VALUES ($1,$2,'PREPARING',$3::jsonb,$4)
            ON CONFLICT (id) DO UPDATE SET
                corpus_fingerprint = EXCLUDED.corpus_fingerprint,
                total_questions = EXCLUDED.total_questions,
                status = 'PREPARING', updated_at = CURRENT_TIMESTAMP
        `, [runId, QUESTION_QUALITY_STANDARD_VERSION, JSON.stringify(fingerprint), questions.length]);
    }

    for (let index = 0; index < questions.length; index += 1) {
        const question = questions[index];
        const evidence = await getExactQuestionEvidence(question, dbOps.contentDb);
        const structure = assessStructure(question);
        const evidenceStatus = evidence.available ? 'PASS' : 'UNAVAILABLE';
        const structuralStatus = structure.ok ? 'PASS' : 'FAIL';
        const auditReady = evidence.available && structure.ok;
        counts.evidenceReady += evidence.available ? 1 : 0;
        counts.evidenceUnavailable += evidence.available ? 0 : 1;
        counts.structuralFailure += structure.ok ? 0 : 1;
        counts.aiPending += auditReady ? 1 : 0;

        if (writeEnabled) {
            const finalResult = !evidence.available
                ? 'EVIDENCE_UNAVAILABLE'
                : (!structure.ok ? 'RETRY_DISTRACTORS' : null);
            await dbOps.gamesDb.run(`
                INSERT INTO question_corpus_reaudit_items
                    (run_id, question_id, original_status, original_quality_state,
                     version_identity, evidence_status, evidence_reason, evidence_snapshot,
                     structural_status, structural_reason, answer_literal_in_evidence,
                     ai_status, priority, final_result)
                VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14)
                ON CONFLICT (run_id, question_id) DO UPDATE SET
                    version_identity = EXCLUDED.version_identity,
                    evidence_status = EXCLUDED.evidence_status,
                    evidence_reason = EXCLUDED.evidence_reason,
                    evidence_snapshot = EXCLUDED.evidence_snapshot,
                    structural_status = EXCLUDED.structural_status,
                    structural_reason = EXCLUDED.structural_reason,
                    answer_literal_in_evidence = EXCLUDED.answer_literal_in_evidence,
                    ai_status = CASE
                        WHEN question_corpus_reaudit_items.ai_status IN ('COMPLETED', 'ERROR')
                        THEN question_corpus_reaudit_items.ai_status
                        ELSE EXCLUDED.ai_status
                    END,
                    priority = EXCLUDED.priority,
                    final_result = CASE
                        WHEN question_corpus_reaudit_items.ai_status IN ('COMPLETED', 'ERROR')
                        THEN question_corpus_reaudit_items.final_result
                        ELSE EXCLUDED.final_result
                    END,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                runId,
                question.id,
                question.status,
                readField(question, 'qualityState', 'quality_state') || 'LEGACY',
                JSON.stringify(evidenceIdentity(question, evidence)),
                evidenceStatus,
                evidence.reason,
                JSON.stringify(evidence),
                structuralStatus,
                structure.reason,
                answerAppearsLiterally(question.answer, evidence),
                auditReady ? 'PENDING' : 'NOT_REQUIRED',
                priorityForQuestion(question),
                finalResult
            ]);
        }

        if (verbose && ((index + 1) % 250 === 0 || index + 1 === questions.length)) {
            console.log(`[prepare ${index + 1}/${questions.length}] evidence=${counts.evidenceReady} ready=${counts.aiPending}`);
        }
    }

    if (writeEnabled) {
        await dbOps.gamesDb.transaction(async tx => {
            await tx.run(`
                UPDATE question_quality_jobs
                SET status = 'CANCELLED', last_error = $1, updated_at = CURRENT_TIMESTAMP
                WHERE status = 'PENDING' AND job_type = 'LEGACY_AUDIT'
            `, [`SUPERSEDED_BY_CORPUS_REAUDIT:${runId}`]);
            await tx.run(`
                UPDATE questions q
                SET quality_state = CASE
                        WHEN q.quality_state IN ('QUARANTINED', 'RETIRED') THEN q.quality_state
                        WHEN item.evidence_status <> 'PASS' THEN 'EVIDENCE_UNAVAILABLE'
                        WHEN item.structural_status <> 'PASS' THEN 'NEEDS_REPAIR'
                        ELSE q.quality_state
                    END,
                    quality_standard_version = $1,
                    quality_checked_at = CASE
                        WHEN item.evidence_status <> 'PASS' OR item.structural_status <> 'PASS'
                        THEN CURRENT_TIMESTAMP ELSE q.quality_checked_at END,
                    audit_reason = CASE
                        WHEN item.evidence_status <> 'PASS' THEN 'CORPUS_REAUDIT:' || item.evidence_reason
                        WHEN item.structural_status <> 'PASS' THEN 'CORPUS_REAUDIT:' || item.structural_reason
                        ELSE q.audit_reason END,
                    verified = CASE
                        WHEN item.evidence_status <> 'PASS' OR item.structural_status <> 'PASS'
                        THEN FALSE ELSE q.verified END,
                    updated_at = CURRENT_TIMESTAMP
                FROM question_corpus_reaudit_items item
                WHERE item.run_id = $2 AND item.question_id = q.id AND q.status = 'PASS'
            `, [QUESTION_QUALITY_STANDARD_VERSION, runId]);
            await tx.run(`
                UPDATE question_corpus_reaudit_runs
                SET status = 'RUNNING', prepared_at = CURRENT_TIMESTAMP,
                    evidence_ready_count = $1, evidence_unavailable_count = $2,
                    structural_failure_count = $3, ai_pending_count = $4,
                    report = $5::jsonb, updated_at = CURRENT_TIMESTAMP
                WHERE id = $6
            `, [
                counts.evidenceReady,
                counts.evidenceUnavailable,
                counts.structuralFailure,
                counts.aiPending,
                JSON.stringify(counts),
                runId
            ]);
        });
    }

    return { mode: writeEnabled ? 'WRITE' : 'DRY_RUN', runId, counts, fingerprint };
}

function compactAudit(auditId, audit) {
    return {
        auditId,
        at: new Date().toISOString(),
        result: audit.result,
        reason: audit.reason,
        riskFlags: audit.riskFlags || [],
        evidenceSnapshot: audit.evidenceSnapshot,
        difficultySnapshot: audit.difficultySnapshot,
        rawResult: audit.rawResult
    };
}

async function updateQuestionFromDecision(item, decision, reason, difficultyConsensus = null) {
    if (shouldPreserveInactiveQuestion(item.originalStatus, item.originalQualityState)) return;
    const quality = decision.qualityState === 'VERIFIED'
        ? 'good'
        : (decision.qualityState === 'NEEDS_REPAIR' ? 'flagged' : 'bad');
    await dbOps.gamesDb.run(`
        UPDATE questions
        SET quality_state = $1,
            status = CASE WHEN $1 = 'VERIFIED' THEN 'PASS' ELSE status END,
            quality_standard_version = $2,
            quality_checked_at = CURRENT_TIMESTAMP,
            audit_reason = $3,
            quality = $4,
            verified = $5,
            final_difficulty_score = CASE WHEN $5 THEN COALESCE($6, final_difficulty_score) ELSE final_difficulty_score END,
            ai_difficulty_score = CASE WHEN $5 THEN COALESCE($6, ai_difficulty_score) ELSE ai_difficulty_score END,
            difficulty_band = CASE WHEN $5 THEN COALESCE($7, difficulty_band) ELSE difficulty_band END,
            difficulty = CASE WHEN $5 THEN COALESCE($7, difficulty) ELSE difficulty END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
    `, [
        decision.qualityState,
        QUESTION_QUALITY_STANDARD_VERSION,
        `CORPUS_REAUDIT:${reason}`,
        quality,
        decision.qualityState === 'VERIFIED',
        difficultyConsensus?.score ?? null,
        difficultyConsensus?.band ?? null,
        item.questionId
    ]);
}

async function getOrCreateCorpusRevision(question) {
    const activeRevisionId = readField(question, 'activeRevisionId', 'active_revision_id');
    if (activeRevisionId) return { id: activeRevisionId, created: false };
    const existing = await dbOps.gamesDb.get(`
        SELECT id FROM question_revisions
        WHERE question_id = $1 AND state = 'CANDIDATE' AND source = 'CORPUS_REAUDIT_V4_1'
        ORDER BY revision_number DESC LIMIT 1
    `, [question.id]);
    if (existing?.id) return { id: existing.id, created: true };
    const revision = await questionQualityService.createRevision(question.id, {}, {
        source: 'CORPUS_REAUDIT_V4_1',
        createdBy: 'system:corpus-reaudit'
    });
    return { id: revision.id, created: true };
}

async function claimNextItem(runId) {
    return dbOps.gamesDb.transaction(async tx => {
        const item = await tx.get(`
            SELECT * FROM question_corpus_reaudit_items
            WHERE run_id = $1 AND ai_status = 'PENDING' AND available_at <= CURRENT_TIMESTAMP
            ORDER BY priority, created_at, question_id
            FOR UPDATE SKIP LOCKED LIMIT 1
        `, [runId]);
        if (!item) return null;
        await tx.run(`
            UPDATE question_corpus_reaudit_items
            SET ai_status = 'RUNNING', attempt_count = attempt_count + 1,
                started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
            WHERE run_id = $1 AND question_id = $2
        `, [runId, item.questionId]);
        return { ...item, attemptCount: Number(readField(item, 'attemptCount', 'attempt_count') || 0) + 1 };
    });
}

async function processRun(runId) {
    if (!writeEnabled) throw new Error('PROCESS_REQUIRES_WRITE');
    const run = await loadRun(runId);
    if (!run) throw new Error('CORPUS_REAUDIT_RUN_NOT_FOUND');
    if (!['RUNNING', 'PREPARING'].includes(String(run.status))) {
        return { runId: run.id, status: run.status, processedAttempts: 0, summary: await refreshRunSummary(run.id) };
    }

    let processedAttempts = 0;
    let errors = 0;
    while (processedAttempts < processLimit) {
        const item = await claimNextItem(run.id);
        if (!item) break;
        processedAttempts += 1;
        try {
            const question = await dbOps.gamesDb.get('SELECT * FROM questions WHERE id = $1', [item.questionId]);
            if (!question) throw new Error('QUESTION_NOT_FOUND');
            const corpusRevision = await getOrCreateCorpusRevision(question);
            const audit = await auditQuestionCandidate(question, { db: dbOps.contentDb });
            const auditId = await questionQualityService.recordAudit(question.id, audit, {
                revisionId: corpusRevision.id
            });
            const history = [...asArray(readField(item, 'auditHistory', 'audit_history')), compactAudit(auditId, audit)];
            let decision = assessCorpusReauditHistory(history);
            let difficultyConsensus = null;
            if (decision.terminal && decision.finalResult === 'PASS') {
                difficultyConsensus = assessDifficultyConsensus(history, { requiredScores: 2 });
                if (!difficultyConsensus.ok) {
                    decision = history.length >= 3
                        ? {
                            terminal: true,
                            finalResult: 'INCONCLUSIVE',
                            qualityState: 'QUARANTINED',
                            passCount: decision.passCount,
                            failureCount: decision.failureCount
                        }
                        : { ...decision, terminal: false, finalResult: null, qualityState: null };
                }
            }

            // 原本 VERIFIED 題在首次發現實質內容問題時立即停止供題；後續形成 PASS 共識可再恢復。
            if (!decision.terminal && ['RETRY_DISTRACTORS', 'FREEZE', 'REJECT', 'EVIDENCE_UNAVAILABLE'].includes(String(audit.result).toUpperCase())) {
                const immediateState = audit.result === 'RETRY_DISTRACTORS'
                    ? 'NEEDS_REPAIR'
                    : (audit.result === 'EVIDENCE_UNAVAILABLE' ? 'EVIDENCE_UNAVAILABLE' : 'QUARANTINED');
                await dbOps.gamesDb.run(`
                    UPDATE questions
                    SET quality_state = $1, verified = FALSE,
                        quality_checked_at = CURRENT_TIMESTAMP,
                        audit_reason = $2, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3 AND status = 'PASS'
                `, [immediateState, `CORPUS_REAUDIT_FIRST_FAILURE:${audit.reason || audit.result}`, question.id]);
            }

            await dbOps.gamesDb.run(`
                UPDATE question_corpus_reaudit_items
                SET ai_status = $1,
                    audit_history = $2::jsonb,
                    pass_count = $3,
                    failure_count = $4,
                    final_result = $5,
                    last_error = NULL,
                    available_at = CURRENT_TIMESTAMP,
                    completed_at = CASE WHEN $6 THEN CURRENT_TIMESTAMP ELSE NULL END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE run_id = $7 AND question_id = $8
            `, [
                decision.terminal ? 'COMPLETED' : 'PENDING',
                JSON.stringify(history),
                decision.passCount || 0,
                decision.failureCount || 0,
                decision.finalResult,
                decision.terminal,
                run.id,
                item.questionId
            ]);
            if (decision.terminal) {
                if (decision.finalResult === 'PASS' && corpusRevision.created) {
                    await questionQualityService.approveRevision(
                        corpusRevision.id,
                        'system:corpus-reaudit',
                        { difficultyConsensus }
                    );
                } else {
                    if (corpusRevision.created) {
                        await questionQualityService.rejectRevision(
                            corpusRevision.id,
                            'system:corpus-reaudit',
                            `CORPUS_REAUDIT:${decision.finalResult}:${audit.reason || audit.result}`
                        );
                    }
                    await updateQuestionFromDecision(
                        item,
                        decision,
                        `${decision.finalResult}:${audit.reason || audit.result}`,
                        difficultyConsensus
                    );
                }
            }
            if (verbose || processedAttempts % 10 === 0) {
                console.log(`[audit ${processedAttempts}/${processLimit}] ${item.questionId} ${audit.result} ${decision.terminal ? decision.finalResult : 'PENDING'}`);
            }
        } catch (error) {
            const freeQuotaRetryAt = readFreeQuotaRetryAt(error);
            if (freeQuotaRetryAt) {
                const message = String(error.message || error).slice(0, 500);
                const availableAt = new Date(freeQuotaRetryAt).toISOString();
                await dbOps.gamesDb.run(`
                    UPDATE question_corpus_reaudit_items
                    SET ai_status = 'PENDING',
                        attempt_count = GREATEST(attempt_count - 1, 0),
                        last_error = $1,
                        available_at = $2::timestamptz,
                        completed_at = NULL,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE run_id = $3 AND question_id = $4
                `, [message, availableAt, run.id, item.questionId]);
                console.warn(`[audit quota] All free projects exhausted; resume at ${availableAt}`);
                if (!waitForFreeQuota) break;
                await new Promise(resolve => setTimeout(resolve, Math.max(1000, freeQuotaRetryAt - Date.now())));
                console.log('[audit quota] Free quota reset reached; resuming corpus audit.');
                continue;
            }

            errors += 1;
            const message = String(error.message || error).slice(0, 500);
            const terminal = item.attemptCount >= Number(readField(item, 'maxAttempts', 'max_attempts') || 5);
            await dbOps.gamesDb.run(`
                UPDATE question_corpus_reaudit_items
                SET ai_status = $1,
                    final_result = CASE WHEN $2 THEN 'INFRASTRUCTURE_ERROR' ELSE final_result END,
                    last_error = $3,
                    available_at = CURRENT_TIMESTAMP + INTERVAL '2 minutes',
                    completed_at = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE completed_at END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE run_id = $4 AND question_id = $5
            `, [terminal ? 'ERROR' : 'PENDING', terminal, message, run.id, item.questionId]);
            console.warn(`[audit error] ${item.questionId}: ${message}`);
        }
        if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    const summary = await refreshRunSummary(run.id);
    return { runId: run.id, processedAttempts, errors, summary };
}

await initializeInfrastructure();

try {
    if (prepareMode) {
        console.log(`CORPUS_REAUDIT_PREPARE=${JSON.stringify(await prepareRun())}`);
    } else if (processMode) {
        const run = await loadRun(requestedRunId);
        if (!run) throw new Error('CORPUS_REAUDIT_RUN_NOT_FOUND');
        console.log(`CORPUS_REAUDIT_PROCESS=${JSON.stringify(await processRun(run.id))}`);
    } else {
        const run = await loadRun(requestedRunId);
        if (!run) throw new Error('CORPUS_REAUDIT_RUN_NOT_FOUND');
        const summary = await refreshRunSummary(run.id, { allowComplete: false });
        console.log(`CORPUS_REAUDIT_STATUS=${JSON.stringify({ run, summary })}`);
    }
    process.exit(0);
} catch (error) {
    console.error(`CORPUS_REAUDIT_ERROR=${String(error.message || error)}`);
    process.exit(1);
}
