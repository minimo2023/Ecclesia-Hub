#!/usr/bin/env node

import 'dotenv/config';
import { initializeInfrastructure, dbOps } from '../database/index.js';
import { proposeQuestionLocationRepair } from '../domains/game/quality/QuestionLocationRepair.js';
import { questionQualityService } from '../domains/game/quality/QuestionQualityService.js';
import { resolveBibleVersion } from '../domains/content/bible/BibleVersionRegistry.js';

const args = process.argv.slice(2);
const getArg = name => (args.find(arg => arg.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=') || null;
const writeEnabled = args.includes('--write');
const corpusRunId = getArg('corpus-run');
const includeFormatOnly = args.includes('--include-format-only');
const verbose = args.includes('--verbose');
const limit = Math.max(1, Math.min(10000, Number.parseInt(getArg('limit') || '10000', 10)));
const requestedStates = new Set(
    String(getArg('states') || '')
        .split(',')
        .map(value => value.trim().toUpperCase())
        .filter(Boolean)
);

function readField(object, camel, snake) {
    return object?.[camel] ?? object?.[snake];
}

function evidenceKey(version, book, chapter, verse) {
    return `${version}|${book}|${chapter}|${verse}`;
}

await initializeInfrastructure();

const [questions, verses] = await Promise.all([
    dbOps.gamesDb.query(`
        SELECT q.*
        FROM questions q
        WHERE ($1::text IS NULL OR EXISTS (
            SELECT 1 FROM question_corpus_reaudit_items i
            WHERE i.run_id = $1 AND i.question_id = q.id
              AND i.final_result = 'EVIDENCE_UNAVAILABLE'
        ))
          AND NOT EXISTS (
            SELECT 1 FROM question_revisions r
            WHERE r.question_id = q.id AND r.state = 'CANDIDATE'
        )
        ORDER BY
            CASE q.quality_state
                WHEN 'LEGACY' THEN 1
                WHEN 'NEEDS_REPAIR' THEN 2
                WHEN 'EVIDENCE_UNAVAILABLE' THEN 3
                WHEN 'QUARANTINED' THEN 4
                WHEN 'RETIRED' THEN 5
                ELSE 6
            END,
            q.updated_at,
            q.id
    `, [corpusRunId]),
    dbOps.contentDb.query(`
        SELECT version, book, chapter, verse, text, source, metadata
        FROM bible_verses
        WHERE version IN ('CUV_TRAD', 'CNV_TRAD', 'TCV2010_TRAD', 'TCV1995_TRAD')
    `)
]);

const questionRows = Array.isArray(questions) ? questions : (questions?.rows || []);
const verseRows = Array.isArray(verses) ? verses : (verses?.rows || []);
const evidenceIndex = new Map();
for (const verse of verseRows) {
    evidenceIndex.set(
        evidenceKey(verse.version, verse.book, Number(verse.chapter), Number(verse.verse)),
        verse
    );
}

function getEvidence(location) {
    const resolved = resolveBibleVersion(location.version);
    if (!resolved) return null;
    const found = [];
    for (let verse = location.verseStart; verse <= location.verseEnd; verse += 1) {
        const item = evidenceIndex.get(evidenceKey(resolved.storageVersion, location.book, location.chapter, verse));
        if (!item || !String(item.text || '').trim()) return null;
        found.push({
            verse: Number(item.verse),
            text: item.text,
            version: item.version,
            source: item.source,
            sourceVersion: item.metadata?.source_version || resolved.sourceVersion
        });
    }
    return found;
}

const reasonCounts = new Map();
const candidates = [];
const formatOnlyCandidates = [];
for (const question of questionRows) {
    const state = String(readField(question, 'qualityState', 'quality_state') || '').toUpperCase();
    if (requestedStates.size > 0 && !requestedStates.has(state)) continue;

    const proposal = proposeQuestionLocationRepair(question, {
        evidenceExists: location => Boolean(getEvidence(location))
    });
    const reason = proposal.reason || 'UNKNOWN';
    reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
    if (proposal.repairable) {
        const changedFields = Object.keys(proposal.changes || {});
        const isFormatOnly = changedFields.length === 1
            && changedFields[0] === 'verse_ref'
            && ['PREFIXED_REFERENCE', 'EXPLICIT_REFERENCE'].includes(proposal.reason);
        const item = { question, proposal };
        if (isFormatOnly) formatOnlyCandidates.push(item);
        else candidates.push(item);
    }
}

const actionableCandidates = includeFormatOnly
    ? [...candidates, ...formatOnlyCandidates]
    : candidates;
const selected = actionableCandidates.slice(0, limit);
const report = {
    mode: writeEnabled ? 'WRITE' : 'DRY_RUN',
    scannedQuestions: questionRows.length,
    requestedStates: [...requestedStates],
    corpusRunId,
    repairableCount: actionableCandidates.length,
    substantiveRepairCount: candidates.length,
    formatOnlyCount: formatOnlyCandidates.length,
    includeFormatOnly,
    selectedCount: selected.length,
    classification: Object.fromEntries([...reasonCounts.entries()].sort((a, b) => b[1] - a[1])),
    samples: selected.slice(0, 20).map(({ question, proposal }) => ({
        id: question.id,
        book: question.book,
        qualityState: readField(question, 'qualityState', 'quality_state'),
        status: question.status,
        source: question.source,
        reason: proposal.reason,
        changes: proposal.changes,
        reference: proposal.target.verse_ref
    })),
    repaired: [],
    failed: []
};

if (!writeEnabled) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
}

for (let index = 0; index < selected.length; index += 1) {
    const { question, proposal } = selected[index];
    let revision = null;
    try {
        const versesForAudit = getEvidence({
            ...proposal.evidence,
            verseStart: proposal.target.verse_start,
            verseEnd: proposal.target.verse_end
        });
        if (!versesForAudit) throw new Error('LOCATION_EVIDENCE_DISAPPEARED');

        revision = await questionQualityService.createRevision(question.id, proposal.target, {
            source: 'LOCATION_REPAIR_V4',
            createdBy: 'system:location-repair'
        });
        const evidenceSnapshot = {
            ...proposal.evidence,
            verses: versesForAudit
        };
        await questionQualityService.recordAudit(question.id, {
            result: 'PASS',
            reason: `LOCATION_REPAIRED:${proposal.reason}`,
            riskFlags: [],
            distractorResults: [],
            evidenceSnapshot,
            rawResult: {
                auditType: 'QUESTION_LOCATION',
                verdict: 'PASS',
                repairType: proposal.reason,
                changes: proposal.changes
            }
        }, { revisionId: revision.id });
        const approval = await questionQualityService.approveLocationRevision(
            revision.id,
            'system:location-repair'
        );
        report.repaired.push({
            id: question.id,
            revisionId: revision.id,
            reason: proposal.reason,
            changes: proposal.changes,
            approval
        });
        if (verbose || (index + 1) % 25 === 0 || index + 1 === selected.length) {
            console.log(`[${index + 1}/${selected.length}] LOCATION_PASS ${question.id} ${question.book} ${proposal.target.verse_ref}`);
        }
    } catch (error) {
        if (revision?.id) {
            try {
                await questionQualityService.rejectLocationRevision(
                    revision.id,
                    'system:location-repair',
                    String(error.message || error).slice(0, 220)
                );
            } catch {}
        }
        report.failed.push({ id: question.id, error: String(error.message || error) });
        console.warn(`[${index + 1}/${selected.length}] LOCATION_FAILED ${question.id}: ${error.message}`);
    }
}

const repairedByReason = {};
const repairedByState = {};
for (const item of report.repaired) {
    repairedByReason[item.reason] = (repairedByReason[item.reason] || 0) + 1;
    const source = selected.find(candidate => candidate.question.id === item.id)?.question;
    const state = String(readField(source, 'qualityState', 'quality_state') || 'UNKNOWN');
    repairedByState[state] = (repairedByState[state] || 0) + 1;
}
console.log(`LOCATION_REPAIR_REPORT=${JSON.stringify({
    mode: report.mode,
    scannedQuestions: report.scannedQuestions,
    requestedStates: report.requestedStates,
    repairableCount: report.repairableCount,
    substantiveRepairCount: report.substantiveRepairCount,
    formatOnlyCount: report.formatOnlyCount,
    selectedCount: report.selectedCount,
    repairedCount: report.repaired.length,
    failedCount: report.failed.length,
    repairedByReason,
    repairedByState,
    failed: report.failed
})}`);
process.exit(report.failed.length > 0 ? 2 : 0);
