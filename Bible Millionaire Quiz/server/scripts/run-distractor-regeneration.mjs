#!/usr/bin/env node

import 'dotenv/config';
import { initializeInfrastructure, dbOps } from '../database/index.js';
import { LogosEngine } from '../infrastructure/ai/LogosEngine.js';
import { getExactQuestionEvidence } from '../domains/game/quality/QuestionEvidenceService.js';
import {
    assessAutoApprovalAudits,
    assessAutoRetirementAudits,
    questionQualityService
} from '../domains/game/quality/QuestionQualityService.js';
import {
    GENERATED_DISTRACTOR_REPAIR_SOURCE,
    buildGeneratedDistractorCandidate,
    normalizeDistractorRepairResult
} from '../domains/game/quality/QuestionDistractorRepair.js';
import { assessDifficultyConsensus } from '../domains/game/difficulty/QuestionDifficultyConsensus.js';

const args = process.argv.slice(2);
const getArg = name => (args.find(arg => arg.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=') || null;
const writeEnabled = args.includes('--write');
const questionId = getArg('id');
const requiredPasses = Math.max(2, Math.min(3, Number.parseInt(getArg('passes') || '2', 10)));
const limit = questionId ? 1 : Math.max(1, Math.min(2000, Number.parseInt(getArg('limit') || '10', 10)));
const verbose = args.includes('--verbose');
const includeInactive = args.includes('--include-inactive');
const includeLocationFollowup = args.includes('--include-location-followup');
const retryUnresolved = args.includes('--retry-unresolved');
const corpusRunId = getArg('corpus-run');
const shardParts = String(getArg('shard') || '0/1').split('/').map(Number);
const shardIndex = shardParts[0];
const shardCount = shardParts[1];
const generationAttempts = 2;
const auditAttempts = 3;

if (!Number.isInteger(shardIndex) || !Number.isInteger(shardCount)
    || shardCount < 1 || shardIndex < 0 || shardIndex >= shardCount) {
    throw new Error('INVALID_SHARD_EXPECTED_INDEX_SLASH_COUNT');
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

function assertReferenceConsistency(question) {
    const chapter = Number(question.chapter);
    const verseStart = Number(question.verseStart ?? question.verse_start);
    const rawEnd = question.verseEnd ?? question.verse_end;
    const verseEnd = rawEnd == null ? verseStart : Number(rawEnd);
    if (!Number.isInteger(chapter) || chapter < 1
        || !Number.isInteger(verseStart) || verseStart < 1
        || !Number.isInteger(verseEnd) || verseEnd < verseStart) {
        throw new Error('DISTRACTOR_REPAIR_INVALID_EVIDENCE_RANGE');
    }
}

function collectExistingDistractors(question) {
    return asArray(question.distractorsPool ?? question.distractors_pool)
        .flat(Infinity)
        .map(value => String(value ?? '').trim())
        .filter(Boolean);
}

function buildGenerationContext(question, evidence) {
    return {
        book: question.book,
        chapter: question.chapter,
        reference: `${question.chapter}:${question.verseStart ?? question.verse_start}`
            + `${Number(question.verseEnd ?? question.verse_end) > Number(question.verseStart ?? question.verse_start)
                ? `-${question.verseEnd ?? question.verse_end}`
                : ''}`,
        version: question.version,
        evidence_text: evidence.verses.map(item => `${item.verse}. ${item.text}`).join('\n'),
        question: question.question,
        answer: question.answer,
        category: question.category || 'verse_fact',
        existing_distractors: collectExistingDistractors(question).join('、') || '無'
    };
}

async function selectQuestions() {
    if (questionId) {
        const question = await dbOps.gamesDb.get('SELECT * FROM questions WHERE id = $1', [questionId]);
        return question ? [question] : [];
    }
    const rows = await dbOps.gamesDb.query(`
        WITH selected_run AS (
            SELECT id
            FROM question_corpus_reaudit_runs
            WHERE ($4::text IS NOT NULL AND id = $4)
               OR ($4::text IS NULL AND status = 'COMPLETED')
            ORDER BY completed_at DESC NULLS LAST
            LIMIT 1
        ), candidates AS (
            SELECT q.*,
                   i.original_status AS corpus_original_status,
                   i.original_quality_state AS corpus_original_quality_state,
                   COALESCE(
                       NULLIF(i.audit_history -> 0 -> 'rawResult' ->> 'estimated_difficulty_score', '')::numeric,
                       q.final_difficulty_score,
                       q.rule_difficulty_score,
                       q.ai_difficulty_score,
                       48
                   ) AS repair_estimated_score,
                   CASE
                       WHEN q.version = 'unv' THEN 'CUV_TRAD'
                       WHEN q.version IN ('TCV2019_TRAD', 'tcv2019') THEN 'TCV2010_TRAD'
                       ELSE q.version
                   END AS inventory_version
            FROM questions q
            JOIN question_corpus_reaudit_items i ON i.question_id = q.id
            JOIN selected_run sr ON sr.id = i.run_id
            WHERE i.final_result = 'RETRY_DISTRACTORS'
               OR (
                   $7::boolean
                   AND i.final_result = 'EVIDENCE_UNAVAILABLE'
                   AND q.quality_state = 'NEEDS_REPAIR'
                   AND EXISTS (
                       SELECT 1 FROM question_revisions location_validation
                       WHERE location_validation.question_id = q.id
                         AND location_validation.source = 'LOCATION_REPAIR_VALIDATION_V4'
                         AND location_validation.state = 'REJECTED'
                   )
               )
        ), verified_stock AS (
            SELECT CASE
                       WHEN version = 'unv' THEN 'CUV_TRAD'
                       WHEN version IN ('TCV2019_TRAD', 'tcv2019') THEN 'TCV2010_TRAD'
                       ELSE version
                   END AS inventory_version,
                   book,
                   CASE
                       WHEN COALESCE(final_difficulty_score, rule_difficulty_score, ai_difficulty_score, 48) <= 30 THEN 'EASY'
                       WHEN COALESCE(final_difficulty_score, rule_difficulty_score, ai_difficulty_score, 48) <= 65 THEN 'MEDIUM'
                       WHEN COALESCE(final_difficulty_score, rule_difficulty_score, ai_difficulty_score, 48) <= 85 THEN 'HARD'
                       ELSE 'VERY_HARD'
                   END AS band,
                   COUNT(*) AS available
            FROM questions
            WHERE quality_state = 'VERIFIED' AND status = 'PASS'
            GROUP BY 1, 2, 3
        )
        SELECT q.*
        FROM candidates q
        LEFT JOIN verified_stock stock
          ON stock.inventory_version = q.inventory_version
         AND stock.book = q.book
         AND stock.band = CASE
             WHEN q.repair_estimated_score <= 30 THEN 'EASY'
             WHEN q.repair_estimated_score <= 65 THEN 'MEDIUM'
             WHEN q.repair_estimated_score <= 85 THEN 'HARD'
             ELSE 'VERY_HARD'
         END
        WHERE ($5::boolean OR q.quality_state = 'NEEDS_REPAIR')
          AND q.quality_state <> 'VERIFIED'
          AND MOD(ABS(HASHTEXT(q.id)::bigint), $6) = $3
          AND q.version IN ('CUV_TRAD', 'unv', 'CNV_TRAD', 'TCV2010_TRAD', 'tcv2019', 'tcv95', 'TCV1995_TRAD')
          AND NULLIF(BTRIM(q.question), '') IS NOT NULL
          AND NULLIF(BTRIM(q.answer), '') IS NOT NULL
          AND q.verse_start IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM question_revisions r
              WHERE r.question_id = q.id
                AND r.state = 'CANDIDATE'
          )
          AND (
              NOT EXISTS (
                  SELECT 1 FROM question_revisions r
                  WHERE r.question_id = q.id AND r.source = $2
              )
              OR (
                  $8::boolean
                  AND q.quality_state = 'NEEDS_REPAIR'
                  AND (
                      q.audit_reason LIKE 'DISTRACTOR_REPAIR_UNRESOLVED:%'
                      OR q.audit_reason LIKE 'DISTRACTOR_REPAIR_ERROR:%'
                  )
              )
          )
        ORDER BY
          CASE
            WHEN q.inventory_version NOT IN ('CUV_TRAD', 'CNV_TRAD', 'TCV2010_TRAD') THEN 3
            WHEN COALESCE(stock.available, 0) < CASE
                WHEN q.repair_estimated_score <= 30 THEN 5
                WHEN q.repair_estimated_score <= 65 THEN 5
                WHEN q.repair_estimated_score <= 85 THEN 3
                ELSE 2
            END THEN 0
            WHEN q.distractors_pool IS NULL OR jsonb_typeof(q.distractors_pool) <> 'array'
              OR jsonb_array_length(q.distractors_pool) = 0 THEN 0
            ELSE 1
          END,
          CASE q.status WHEN 'PASS' THEN 0 WHEN 'FREEZE' THEN 1 WHEN 'flagged' THEN 2 ELSE 3 END,
          q.updated_at,
          q.id
        LIMIT $1
    `, [
        limit,
        GENERATED_DISTRACTOR_REPAIR_SOURCE,
        shardIndex,
        corpusRunId,
        includeInactive,
        shardCount,
        includeLocationFollowup,
        retryUnresolved
    ]);
    return Array.isArray(rows) ? rows : [];
}

await initializeInfrastructure();
const questions = await selectQuestions();

if (questions.length === 0) {
    console.log(JSON.stringify({
        mode: writeEnabled ? 'WRITE' : 'DRY_RUN',
        selectedCount: 0,
        message: 'DISTRACTOR_REPAIR_CANDIDATE_NOT_FOUND'
    }, null, 2));
    process.exit(0);
}

if (!writeEnabled) {
    const previews = [];
    for (const question of questions) {
        let evidence;
        try {
            assertReferenceConsistency(question);
            evidence = await getExactQuestionEvidence(question);
        } catch (error) {
            evidence = { available: false, reason: String(error.message || error) };
        }
        previews.push({
            questionId: question.id,
            reference: `${question.book} ${question.verseRef ?? question.verse_ref}`,
            version: question.version,
            question: question.question,
            answer: question.answer,
            evidenceAvailable: evidence.available,
            evidenceReason: evidence.reason
        });
    }
    console.log(JSON.stringify({ mode: 'DRY_RUN', selectedCount: previews.length, previews }, null, 2));
    process.exit(0);
}

const report = {
    selectedCount: questions.length,
    approved: [],
    retired: [],
    unresolved: [],
    errors: []
};

for (let questionIndex = 0; questionIndex < questions.length; questionIndex += 1) {
    const question = questions[questionIndex];
    let revision = null;
    try {
        const currentQualityState = String(question.qualityState ?? question.quality_state);
        if (currentQualityState !== 'NEEDS_REPAIR' && !includeInactive) {
            throw new Error('DISTRACTOR_REPAIR_REQUIRES_NEEDS_REPAIR_STATE');
        }
        assertReferenceConsistency(question);
        const evidence = await getExactQuestionEvidence(question);
        if (!evidence.available || evidence.version !== question.version) {
            throw new Error(`DISTRACTOR_REPAIR_EVIDENCE_UNAVAILABLE:${evidence.reason}`);
        }

        let candidate = null;
        const generationFailures = [];
        for (let generationIndex = 0; generationIndex < generationAttempts; generationIndex += 1) {
            const rawGeneration = await LogosEngine.askBrain(
                'question_distractor_repair',
                buildGenerationContext(question, evidence),
                {
                    temperature: 0.25,
                    priority: true,
                    freeOnly: true,
                    model: 'gemini-3.1-flash-lite',
                    allowModelFallback: false
                }
            );
            const generation = normalizeDistractorRepairResult(rawGeneration);
            if (!generation.repairable) {
                generationFailures.push({
                    reason: generation.reason,
                    riskFlags: generation.riskFlags,
                    rawResult: rawGeneration
                });
                continue;
            }
            try {
                candidate = buildGeneratedDistractorCandidate(question, rawGeneration);
                break;
            } catch (error) {
                if (!String(error.message || error).startsWith('DISTRACTOR_REPAIR_LOCAL_VALIDATION_FAILED:')) {
                    throw error;
                }
                generationFailures.push({
                    reason: String(error.message || error),
                    riskFlags: ['GENERATOR_LOCAL_VALIDATION_FAILED'],
                    rawResult: rawGeneration
                });
            }
        }

        if (!candidate) {
            if (generationFailures.length !== generationAttempts) {
                throw new Error('DISTRACTOR_REPAIR_GENERATION_ATTEMPTS_INCOMPLETE');
            }
            revision = await questionQualityService.createRevision(question.id, {
                repair_metadata: {
                    source: GENERATED_DISTRACTOR_REPAIR_SOURCE,
                    generator_status: 'UNREPAIRABLE',
                    generation_attempts: generationFailures.map((failure, index) => ({
                        attempt: index + 1,
                        reason: failure.reason,
                        risk_flags: failure.riskFlags
                    }))
                }
            }, {
                source: GENERATED_DISTRACTOR_REPAIR_SOURCE,
                createdBy: 'system:distractor-regeneration'
            });
            for (const failure of generationFailures) {
                await questionQualityService.recordAudit(question.id, {
                    result: 'RETRY_DISTRACTORS',
                    reason: failure.reason,
                    riskFlags: failure.riskFlags,
                    distractorResults: [],
                    evidenceSnapshot: evidence,
                    rawResult: {
                        verdict: 'RETRY_DISTRACTORS',
                        reason: failure.reason,
                        generator_result: failure.rawResult
                    }
                }, { revisionId: revision.id });
            }
            const retirement = await questionQualityService.retireFailedDistractorRevision(
                revision.id,
                'system:distractor-regeneration',
                `DISTRACTOR_REPAIR_GENERATION_FAILED_TWICE:${generationFailures.map(item => item.reason).join('|')}`
            );
            report.retired.push({
                questionId: question.id,
                revisionId: revision.id,
                reference: `${question.book} ${question.verseRef ?? question.verse_ref}`,
                retirement
            });
            continue;
        }

        revision = await questionQualityService.createRevision(question.id, candidate, {
            source: GENERATED_DISTRACTOR_REPAIR_SOURCE,
            createdBy: 'system:distractor-regeneration'
        });

        const audits = [];
        for (let auditIndex = 0; auditIndex < auditAttempts; auditIndex += 1) {
            audits.push(await questionQualityService.auditRevision(revision.id));
            if (audits.length < requiredPasses) continue;
            const interimApproval = assessAutoApprovalAudits(audits, {
                requiredPasses,
                version: question.version
            });
            const interimDifficulty = assessDifficultyConsensus(audits, { requiredScores: requiredPasses });
            if (interimApproval.ok && interimDifficulty.ok) break;
            const lastResults = audits.slice(-requiredPasses)
                .map(audit => String(audit.result || '').toUpperCase());
            if (lastResults.every(result => ['FREEZE', 'REJECT'].includes(result))) break;
        }

        const approvalGate = assessAutoApprovalAudits(audits, {
            requiredPasses,
            version: question.version
        });
        const difficultyConsensus = assessDifficultyConsensus(audits, { requiredScores: requiredPasses });
        if (approvalGate.ok && difficultyConsensus.ok) {
            const approval = await questionQualityService.approveRevision(
                revision.id,
                'system:distractor-regeneration',
                { difficultyConsensus }
            );
            report.approved.push({
                questionId: question.id,
                revisionId: revision.id,
                reference: `${question.book} ${question.verseRef ?? question.verse_ref}`,
                difficulty: {
                    score: difficultyConsensus.score,
                    band: difficultyConsensus.band,
                    spread: difficultyConsensus.spread
                },
                approval
            });
        } else {
            const retirementGate = assessAutoRetirementAudits(audits, {
                requiredFailures: requiredPasses,
                version: question.version
            });
            if (retirementGate.ok) {
                const retirement = await questionQualityService.retireFailedDistractorRevision(
                    revision.id,
                    'system:distractor-regeneration',
                    `DISTRACTOR_REPAIR_DOUBLE_FAILURE:${audits.map(audit => audit.result).join(',')}`
                );
                report.retired.push({
                    questionId: question.id,
                    revisionId: revision.id,
                    reference: `${question.book} ${question.verseRef ?? question.verse_ref}`,
                    retirement
                });
            } else {
                await questionQualityService.rejectRevision(
                    revision.id,
                    'system:distractor-regeneration',
                    `DISTRACTOR_REPAIR_UNRESOLVED:${approvalGate.reason}:${retirementGate.reason}`
                );
                report.unresolved.push({
                    questionId: question.id,
                    revisionId: revision.id,
                    reason: `${approvalGate.reason}:${difficultyConsensus.reason}:${retirementGate.reason}`,
                    auditResults: audits.map(audit => audit.result)
                });
            }
        }
    } catch (error) {
        if (revision?.id) {
            try {
                await questionQualityService.rejectRevision(
                    revision.id,
                    'system:distractor-regeneration',
                    `DISTRACTOR_REPAIR_ERROR:${String(error.message || error).slice(0, 180)}`
                );
            } catch {}
        }
        report.errors.push({ questionId: question.id, error: String(error.message || error) });
    }

    if (verbose || (questionIndex + 1) % 5 === 0 || questionIndex + 1 === questions.length) {
        console.log(
            `[${questionIndex + 1}/${questions.length}] approved=${report.approved.length} `
            + `retired=${report.retired.length} unresolved=${report.unresolved.length} errors=${report.errors.length}`
        );
    }
}

console.log(`DISTRACTOR_REPAIR_REPORT=${JSON.stringify({
    selectedCount: report.selectedCount,
    approvedCount: report.approved.length,
    retiredCount: report.retired.length,
    unresolvedCount: report.unresolved.length,
    errorCount: report.errors.length,
    approved: report.approved,
    retired: report.retired,
    unresolved: report.unresolved,
    errors: report.errors
})}`);
process.exit(0);
