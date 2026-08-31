#!/usr/bin/env node

import 'dotenv/config';
import { initializeInfrastructure, dbOps } from '../database/index.js';
import { LogosEngine } from '../infrastructure/ai/LogosEngine.js';
import { bibleTranslator } from '../utils/bibleTranslator.js';
import { resolveBibleVersion } from '../domains/content/bible/BibleVersionRegistry.js';
import { getExactQuestionEvidence } from '../domains/game/quality/QuestionEvidenceService.js';
import {
    assessAutoApprovalAudits,
    questionQualityService
} from '../domains/game/quality/QuestionQualityService.js';
import { assessDifficultyConsensus } from '../domains/game/difficulty/QuestionDifficultyConsensus.js';
import {
    assessLocationFixConsensus,
    normalizeLocationFixResult
} from '../domains/game/quality/QuestionLocationAIRepair.js';

const args = process.argv.slice(2);
const getArg = name => (args.find(arg => arg.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=') || null;
const writeEnabled = args.includes('--write');
const corpusRunId = getArg('corpus-run');
const limit = Math.max(1, Math.min(1000, Number.parseInt(getArg('limit') || '20', 10)));
const shardParts = String(getArg('shard') || '0/1').split('/').map(Number);
const shardIndex = shardParts[0];
const shardCount = shardParts[1];
const verbose = args.includes('--verbose');

if (!Number.isInteger(shardIndex) || !Number.isInteger(shardCount)
    || shardCount < 1 || shardIndex < 0 || shardIndex >= shardCount) {
    throw new Error('INVALID_SHARD_EXPECTED_INDEX_SLASH_COUNT');
}

function readField(object, camel, snake) {
    return object?.[camel] ?? object?.[snake];
}

function canonicalVerseRef(chapter, verseStart, verseEnd) {
    return `${chapter}:${verseStart}${verseEnd > verseStart ? `-${verseEnd}` : ''}`;
}

async function selectQuestions() {
    return dbOps.gamesDb.query(`
        WITH selected_run AS (
            SELECT id FROM question_corpus_reaudit_runs
            WHERE ($2::text IS NOT NULL AND id = $2)
               OR ($2::text IS NULL AND status = 'COMPLETED')
            ORDER BY completed_at DESC NULLS LAST LIMIT 1
        )
        SELECT q.*, i.evidence_reason AS corpus_evidence_reason
        FROM questions q
        JOIN question_corpus_reaudit_items i ON i.question_id = q.id
        JOIN selected_run sr ON sr.id = i.run_id
        WHERE i.final_result = 'EVIDENCE_UNAVAILABLE'
          AND q.quality_state <> 'VERIFIED'
          AND MOD(ABS(HASHTEXT(q.id)::bigint), $3) = $1
          AND NOT EXISTS (
              SELECT 1 FROM question_revisions r
              WHERE r.question_id = q.id
                AND (r.state = 'CANDIDATE' OR r.created_by = 'system:ai-location-repair')
          )
          AND NOT EXISTS (
              SELECT 1 FROM question_quality_audits a
              WHERE a.question_id = q.id
                AND a.raw_result ->> 'auditType' = 'QUESTION_LOCATION_AI'
          )
        ORDER BY
          CASE i.evidence_reason WHEN 'MISSING_VERSE_RANGE' THEN 0 ELSE 1 END,
          CASE q.status WHEN 'PASS' THEN 0 WHEN 'FREEZE' THEN 1 ELSE 2 END,
          q.updated_at,
          q.id
        LIMIT $4
    `, [shardIndex, corpusRunId, shardCount, limit]);
}

async function loadChapterEvidence(question) {
    const resolved = resolveBibleVersion(question.version);
    const book = bibleTranslator.toEnglish(question.book);
    const chapter = Number(question.chapter);
    if (!resolved || !bibleTranslator.isKnownBook(question.book)
        || !Number.isInteger(chapter) || chapter < 1) {
        return { available: false, reason: 'INVALID_LOCATION_SCOPE', verses: [] };
    }
    const rows = await dbOps.contentDb.query(`
        SELECT chapter, verse, text, source, metadata
        FROM bible_verses
        WHERE version = $1 AND book = $2 AND chapter = $3
        ORDER BY verse
    `, [resolved.storageVersion, book, chapter]);
    const verses = Array.isArray(rows) ? rows : [];
    if (verses.length === 0 || verses.some(row => !String(row.text || '').trim())) {
        return { available: false, reason: 'CHAPTER_EVIDENCE_UNAVAILABLE', verses: [] };
    }
    return { available: true, resolved, book, chapter, verses };
}

async function askLocation(question, chapterEvidence) {
    let lastError = null;
    for (let formatAttempt = 1; formatAttempt <= 3; formatAttempt += 1) {
        const raw = await LogosEngine.askBrain('question_location_fix', {
            version: question.version,
            book: question.book,
            chapter: chapterEvidence.chapter,
            question: question.question,
            answer: question.answer,
            evidence_text: chapterEvidence.verses.map(row => `${row.verse}. ${row.text}`).join('\n')
        }, {
            temperature: 0.05,
            priority: true,
            freeOnly: true,
            compactSystemInstruction: true,
            model: 'gemini-3.1-flash-lite',
            allowModelFallback: false
        });
        try {
            return { raw, normalized: normalizeLocationFixResult(raw) };
        } catch (error) {
            lastError = error;
        }
    }
    throw new Error(`LOCATION_FIX_STRUCTURED_RESPONSE_INVALID_AFTER_RETRIES:${lastError?.message || 'UNKNOWN'}`);
}

function evidenceForRange(question, chapterEvidence, verseStart, verseEnd) {
    const selected = chapterEvidence.verses.filter(row =>
        Number(row.verse) >= verseStart && Number(row.verse) <= verseEnd
    );
    const numbers = new Set(selected.map(row => Number(row.verse)));
    if (!numbers.has(verseStart) || !numbers.has(verseEnd)
        || selected.length !== verseEnd - verseStart + 1) return null;
    return {
        available: true,
        reason: 'PASS',
        version: question.version,
        canonicalVersion: chapterEvidence.resolved.canonicalVersion,
        storageVersion: chapterEvidence.resolved.storageVersion,
        sourceVersion: chapterEvidence.resolved.sourceVersion,
        book: chapterEvidence.book,
        chapter: chapterEvidence.chapter,
        verseStart,
        verseEnd,
        verses: selected.map(row => ({
            verse: Number(row.verse),
            text: row.text,
            version: chapterEvidence.resolved.storageVersion,
            source: row.source,
            sourceVersion: row.metadata?.source_version || chapterEvidence.resolved.sourceVersion
        }))
    };
}

async function validateLocatedQuestion(questionId) {
    const question = await dbOps.gamesDb.get('SELECT * FROM questions WHERE id = $1', [questionId]);
    const revision = await questionQualityService.createRevision(questionId, {}, {
        source: 'LOCATION_REPAIR_VALIDATION_V4',
        createdBy: 'system:ai-location-repair'
    });
    const audits = [
        await questionQualityService.auditRevision(revision.id),
        await questionQualityService.auditRevision(revision.id)
    ];
    const approval = assessAutoApprovalAudits(audits, { requiredPasses: 2, version: question.version });
    const difficulty = assessDifficultyConsensus(audits, { requiredScores: 2 });
    if (approval.ok && difficulty.ok) {
        const result = await questionQualityService.approveRevision(
            revision.id,
            'system:ai-location-repair',
            { difficultyConsensus: difficulty }
        );
        return { result: 'VERIFIED', revisionId: revision.id, difficulty, approval: result };
    }

    await questionQualityService.rejectRevision(
        revision.id,
        'system:ai-location-repair',
        `LOCATION_VALIDATION_FAILED:${approval.reason}:${difficulty.reason}`
    );
    const verdicts = audits.map(audit => String(audit.result || '').toUpperCase());
    if (verdicts.every(verdict => ['FREEZE', 'REJECT'].includes(verdict))) {
        await dbOps.gamesDb.run(`
            UPDATE questions
            SET status = 'FREEZE', quality_state = 'QUARANTINED', quality = 'bad', verified = FALSE,
                audit_reason = $1, quality_checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `, [`LOCATION_DOUBLE_CONTENT_FAILURE:${verdicts.join(',')}`, questionId]);
        return { result: 'QUARANTINED', revisionId: revision.id, verdicts };
    }
    return { result: 'NEEDS_DISTRACTOR_REPAIR', revisionId: revision.id, verdicts };
}

await initializeInfrastructure();
const selectedRows = await selectQuestions();
const questions = Array.isArray(selectedRows) ? selectedRows : [];
const report = {
    mode: writeEnabled ? 'WRITE' : 'DRY_RUN',
    selectedCount: questions.length,
    verified: [],
    needsDistractorRepair: [],
    quarantined: [],
    unresolved: [],
    errors: []
};

for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    try {
        const existingEvidence = await getExactQuestionEvidence(question);
        if (existingEvidence.available) {
            if (!writeEnabled) {
                report.verified.push({ questionId: question.id, mode: 'EXISTING_LOCATION_READY' });
                continue;
            }
            const validation = await validateLocatedQuestion(question.id);
            if (validation.result === 'VERIFIED') report.verified.push({ questionId: question.id, validation });
            else if (validation.result === 'NEEDS_DISTRACTOR_REPAIR') report.needsDistractorRepair.push({ questionId: question.id, validation });
            else report.quarantined.push({ questionId: question.id, validation });
            continue;
        }

        const chapterEvidence = await loadChapterEvidence(question);
        if (!chapterEvidence.available) {
            report.unresolved.push({ questionId: question.id, reason: chapterEvidence.reason });
            continue;
        }
        const attempts = [await askLocation(question, chapterEvidence), await askLocation(question, chapterEvidence)];
        let consensus = assessLocationFixConsensus(attempts.map(item => item.normalized));
        if (!consensus.ok) {
            attempts.push(await askLocation(question, chapterEvidence));
            consensus = assessLocationFixConsensus(attempts.map(item => item.normalized));
        }
        if (!writeEnabled) {
            report.unresolved.push({ questionId: question.id, preview: consensus });
            continue;
        }

        for (const attempt of attempts) {
            await questionQualityService.recordAudit(question.id, {
                result: attempt.normalized.status === 'FOUND' ? 'PASS' : 'EVIDENCE_UNAVAILABLE',
                reason: attempt.normalized.reason,
                riskFlags: attempt.normalized.status === 'FOUND' ? [] : ['DIRECT_EVIDENCE_NOT_FOUND'],
                distractorResults: [],
                rawResult: {
                    auditType: 'QUESTION_LOCATION_AI',
                    verdict: attempt.normalized.status,
                    ...attempt.raw
                }
            });
        }

        if (!consensus.ok) {
            await dbOps.gamesDb.run(`
                UPDATE questions
                SET status = 'RETIRED', quality_state = 'RETIRED', quality = 'bad', verified = FALSE,
                    audit_reason = $1, quality_checked_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [`LOCATION_THREE_AUDIT_NO_CONSENSUS:${consensus.reason}`, question.id]);
            report.quarantined.push({ questionId: question.id, reason: consensus.reason });
            continue;
        }
        if (consensus.status === 'NOT_FOUND') {
            await dbOps.gamesDb.run(`
                UPDATE questions
                SET status = 'FREEZE', quality_state = 'QUARANTINED', quality = 'bad', verified = FALSE,
                    audit_reason = 'DOUBLE_LOCATION_NOT_FOUND', quality_checked_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [question.id]);
            report.quarantined.push({ questionId: question.id, reason: consensus.reason });
            continue;
        }
        if (consensus.chapter !== chapterEvidence.chapter || consensus.verseEnd - consensus.verseStart > 5) {
            report.unresolved.push({ questionId: question.id, reason: 'LOCATION_RANGE_OUTSIDE_SAFE_SCOPE' });
            continue;
        }

        const evidence = evidenceForRange(
            question,
            chapterEvidence,
            consensus.verseStart,
            consensus.verseEnd
        );
        if (!evidence) {
            report.unresolved.push({ questionId: question.id, reason: 'CONSENSUS_EVIDENCE_RANGE_MISSING' });
            continue;
        }
        const revision = await questionQualityService.createRevision(question.id, {
            chapter: consensus.chapter,
            verse_start: consensus.verseStart,
            verse_end: consensus.verseEnd,
            verse_ref: canonicalVerseRef(consensus.chapter, consensus.verseStart, consensus.verseEnd)
        }, {
            source: 'LOCATION_REPAIR_V4',
            createdBy: 'system:ai-location-repair'
        });
        await questionQualityService.recordAudit(question.id, {
            result: 'PASS',
            reason: consensus.reason,
            riskFlags: [],
            distractorResults: [],
            evidenceSnapshot: evidence,
            rawResult: {
                auditType: 'QUESTION_LOCATION',
                verdict: 'PASS',
                repairType: 'DOUBLE_AI_LOCATION_MATCH'
            }
        }, { revisionId: revision.id });
        await questionQualityService.approveLocationRevision(revision.id, 'system:ai-location-repair');
        const validation = await validateLocatedQuestion(question.id);
        if (validation.result === 'VERIFIED') report.verified.push({ questionId: question.id, validation });
        else if (validation.result === 'NEEDS_DISTRACTOR_REPAIR') report.needsDistractorRepair.push({ questionId: question.id, validation });
        else report.quarantined.push({ questionId: question.id, validation });
    } catch (error) {
        report.errors.push({ questionId: question.id, error: String(error.message || error) });
    }

    if (verbose || (index + 1) % 10 === 0 || index + 1 === questions.length) {
        console.log(
            `[${index + 1}/${questions.length}] verified=${report.verified.length} `
            + `needsDistractors=${report.needsDistractorRepair.length} quarantined=${report.quarantined.length} `
            + `unresolved=${report.unresolved.length} errors=${report.errors.length}`
        );
    }
}

console.log(`LOCATION_EVIDENCE_REPAIR_REPORT=${JSON.stringify({
    mode: report.mode,
    selectedCount: report.selectedCount,
    verifiedCount: report.verified.length,
    needsDistractorRepairCount: report.needsDistractorRepair.length,
    quarantinedCount: report.quarantined.length,
    unresolvedCount: report.unresolved.length,
    errorCount: report.errors.length,
    unresolved: report.unresolved,
    errors: report.errors
})}`);
process.exit(report.errors.length > 0 ? 2 : 0);
