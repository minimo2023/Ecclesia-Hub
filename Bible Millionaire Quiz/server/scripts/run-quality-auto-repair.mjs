#!/usr/bin/env node

import 'dotenv/config';
import { initializeInfrastructure, dbOps } from '../database/index.js';
import {
    assessAutoApprovalAudits,
    questionQualityService
} from '../domains/game/quality/QuestionQualityService.js';
import {
    normalizeAnswerText,
    validateDistractorSet,
    validateQuestionOptions
} from '../domains/game/quality/QuestionQualityPolicy.js';

const args = process.argv.slice(2);
const getArg = name => (args.find(arg => arg.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=') || null;
const writeEnabled = args.includes('--write');
const questionId = getArg('id');
const requiredPasses = Math.max(2, Math.min(3, Number.parseInt(getArg('passes') || '2', 10)));
const limit = questionId ? 1 : Math.max(1, Math.min(100, Number.parseInt(getArg('limit') || '1', 10)));
const verbose = args.includes('--verbose');

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

function getDistractors(question) {
    const pool = asArray(question.distractorsPool ?? question.distractors_pool);
    const source = Array.isArray(pool[0]) ? pool[0] : pool;
    const answer = normalizeAnswerText(question.answer);
    const seen = new Set();
    return source.filter(value => {
        const normalized = normalizeAnswerText(value);
        if (!normalized || normalized === answer || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    }).slice(0, 3);
}

function buildStructuralCandidate(question) {
    const distractors = getDistractors(question);
    const distractorCheck = validateDistractorSet(question.answer, distractors, 3);
    if (!distractorCheck.ok) throw new Error(`AUTO_REPAIR_DISTRACTORS_INVALID:${distractorCheck.reason}`);

    const checksum = String(question.id).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const correctIndex = checksum % 4;
    const options = [...distractors];
    options.splice(correctIndex, 0, question.answer);
    const optionCheck = validateQuestionOptions(question.answer, options);
    if (!optionCheck.ok) throw new Error(`AUTO_REPAIR_OPTIONS_INVALID:${optionCheck.reason}`);

    return {
        options,
        correct_index: correctIndex,
        distractors_pool: [distractors]
    };
}

function assertReferenceConsistency(question) {
    const reference = String(question.verseRef ?? question.verse_ref ?? '');
    const referenceChapter = Number.parseInt(reference.match(/^(\d+):/)?.[1] || '', 10);
    if (!Number.isInteger(referenceChapter) || referenceChapter !== Number(question.chapter)) {
        throw new Error('AUTO_REPAIR_REFERENCE_CHAPTER_MISMATCH');
    }
}

await initializeInfrastructure();

let questions;
if (questionId) {
    const question = await dbOps.gamesDb.get('SELECT * FROM questions WHERE id = $1', [questionId]);
    questions = question ? [question] : [];
} else {
    questions = await dbOps.gamesDb.query(`
        SELECT q.*
        FROM questions q
        WHERE q.quality_state = 'NEEDS_REPAIR'
          AND q.verse_start IS NOT NULL
          AND q.verse_ref IS NOT NULL
          AND split_part(q.verse_ref, ':', 1) ~ '^[0-9]+$'
          AND split_part(q.verse_ref, ':', 1)::integer = q.chapter
          AND q.version IN ('CUV_TRAD', 'CNV_TRAD', 'TCV2010_TRAD')
          AND (q.options IS NULL OR jsonb_typeof(q.options) <> 'array' OR jsonb_array_length(q.options) < 4)
          AND jsonb_typeof(q.distractors_pool) = 'array'
          AND (
              jsonb_array_length(q.distractors_pool) >= 3
              OR (
                  jsonb_typeof(q.distractors_pool -> 0) = 'array'
                  AND jsonb_array_length(q.distractors_pool -> 0) >= 3
              )
          )
          AND NOT EXISTS (
              SELECT 1 FROM question_revisions r
              WHERE r.question_id = q.id
                AND (
                    r.state = 'CANDIDATE'
                    OR r.source = 'AUTO_REPAIR_STRUCTURAL_V4'
                )
          )
        ORDER BY q.updated_at, q.id
        LIMIT $1
    `, [limit]);
}

const questionRows = Array.isArray(questions) ? questions : (questions?.rows || []);
if (questionRows.length === 0) {
    console.log(JSON.stringify({
        mode: writeEnabled ? 'WRITE' : 'DRY_RUN',
        selectedCount: 0,
        message: 'AUTO_REPAIR_CANDIDATE_NOT_FOUND'
    }, null, 2));
    process.exit(0);
}

function buildPreview(question, candidate) {
    return {
    mode: writeEnabled ? 'WRITE' : 'DRY_RUN',
    questionId: question.id,
    reference: `${question.book} ${question.verseRef ?? question.verse_ref}`,
    version: question.version,
    question: question.question,
    answer: question.answer,
    candidate
    };
}

if (!writeEnabled) {
    const previews = questionRows.map(question => {
        assertReferenceConsistency(question);
        return buildPreview(question, buildStructuralCandidate(question));
    });
    console.log(JSON.stringify({ mode: 'DRY_RUN', selectedCount: previews.length, previews }, null, 2));
    process.exit(0);
}

const report = { selectedCount: questionRows.length, approved: [], rejected: [], errors: [] };
for (let questionIndex = 0; questionIndex < questionRows.length; questionIndex += 1) {
    const question = questionRows[questionIndex];
    let revision = null;
    try {
        if (String(question.qualityState ?? question.quality_state) !== 'NEEDS_REPAIR') {
            throw new Error('AUTO_REPAIR_REQUIRES_NEEDS_REPAIR_STATE');
        }
        assertReferenceConsistency(question);
        const candidate = buildStructuralCandidate(question);
        revision = await questionQualityService.createRevision(question.id, candidate, {
            source: 'AUTO_REPAIR_STRUCTURAL_V4',
            createdBy: 'system:auto-repair'
        });

        const audits = [];
        for (let auditIndex = 0; auditIndex < requiredPasses; auditIndex += 1) {
            const audit = await questionQualityService.auditRevision(revision.id);
            audits.push(audit);
            if (String(audit.result).toUpperCase() !== 'PASS') break;
        }

        const gate = assessAutoApprovalAudits(audits, {
            requiredPasses,
            version: question.version
        });
        if (!gate.ok) {
            await questionQualityService.rejectRevision(
                revision.id,
                'system:auto-repair',
                `AUTO_REPAIR_GATE_FAILED:${gate.reason}`
            );
            report.rejected.push({
                questionId: question.id,
                revisionId: revision.id,
                reason: gate.reason,
                auditResults: audits.map(audit => audit.result)
            });
        } else {
            const approval = await questionQualityService.approveRevision(revision.id, 'system:auto-repair');
            report.approved.push({
                questionId: question.id,
                revisionId: revision.id,
                reference: `${question.book} ${question.verseRef ?? question.verse_ref}`,
                version: question.version,
                approval
            });
        }
        if (verbose || (questionIndex + 1) % 5 === 0 || questionIndex + 1 === questionRows.length) {
            console.log(
                `[${questionIndex + 1}/${questionRows.length}] approved=${report.approved.length} `
                + `rejected=${report.rejected.length} errors=${report.errors.length}`
            );
        }
    } catch (error) {
        if (revision?.id) {
            try {
                await questionQualityService.rejectRevision(
                    revision.id,
                    'system:auto-repair',
                    `AUTO_REPAIR_ERROR:${String(error.message || error).slice(0, 180)}`
                );
            } catch {}
        }
        report.errors.push({ questionId: question.id, error: String(error.message || error) });
    }
}

console.log(`AUTO_REPAIR_REPORT=${JSON.stringify({
    selectedCount: report.selectedCount,
    approvedCount: report.approved.length,
    rejectedCount: report.rejected.length,
    errorCount: report.errors.length,
    approved: report.approved,
    rejected: report.rejected,
    errors: report.errors
})}`);
process.exit(0);
