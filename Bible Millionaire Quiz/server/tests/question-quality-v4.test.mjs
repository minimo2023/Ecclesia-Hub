import assert from 'node:assert/strict';
import test from 'node:test';

import {
    FHL_FIXED_VERSION_MAP,
    FhlBibleSyncService,
    normalizeFhlText,
    validateFhlChapterPayload
} from '../domains/content/bible/FhlBibleSyncService.js';
import {
    OFFLINE_VERSION_MANIFEST,
    applyLiveApiCorrections
} from '../../scripts/fhl_import_offline_bible.js';
import { getFhlBook } from '../domains/content/bible/fhlCatalog.js';
import {
    getPlayableQualitySql,
    isQuestionAllowedByQuality,
    validateDistractorSet,
    validateQuestionOptions
} from '../domains/game/quality/QuestionQualityPolicy.js';
import {
    assembleVerifiedQuestion,
    getQuestionPlayability
} from '../domains/game/quality/QuestionOptionAssembler.js';
import { STAGE_OPTION_COUNT } from '../socket/expedition/constants.js';
import { isModelUnavailableError } from '../infrastructure/ai/gemini-client.js';
import {
    assessAutoApprovalAudits,
    assessAutoRetirementAudits,
    normalizeStructuredAuditResult
} from '../domains/game/quality/QuestionQualityService.js';
import {
    applyDifficultyConsensus,
    assessDifficultyConsensus,
    normalizeDedicatedDifficultyAudit
} from '../domains/game/difficulty/QuestionDifficultyConsensus.js';
import {
    buildGeneratedDistractorCandidate,
    hasOnlyGeneratedDistractorChanges,
    validateGeneratedDistractorSets
} from '../domains/game/quality/QuestionDistractorRepair.js';
import { buildQuestionRevisionCandidate } from '../domains/game/quality/QuestionRevisionPayload.js';
import {
    hasOnlyLocationChanges,
    parseLegacyVerseReference,
    proposeQuestionLocationRepair
} from '../domains/game/quality/QuestionLocationRepair.js';
import {
    assessLocationFixConsensus,
    normalizeLocationFixResult
} from '../domains/game/quality/QuestionLocationAIRepair.js';
import {
    buildSemanticDuplicateCases,
    buildSemanticGroupKey,
    isDuplicateAuditResolved,
    normalizeDuplicateAuditResult,
    normalizeSemanticText,
    rankSemanticDuplicateCandidates
} from '../domains/game/quality/QuestionSemanticDuplicate.js';
import { QuizEngine } from '../domains/game/engine/QuizEngine.js';
import { QuestionBodyAuditor } from '../domains/game/engine/QuestionBodyAuditor.js';
import {
    getGenerationQualityModel,
    isGeneratedCategoryAllowed,
    normalizeGeneratedQuestionText,
    validateGeneratedDifficultyScope,
    validateGeneratedQuestionLocation
} from '../domains/game/engine/QuestionCore.js';
import { partitionVerifiedInventoryAdds } from '../domains/game/replenishment/QuestionInventoryAcceptance.js';
import { TASK_SCHEMAS } from '../infrastructure/ai/logos/schemas.js';
import { LogosAuditor } from '../infrastructure/ai/logos/LogosAuditor.js';
import { isStructuredLogosTask, LogosEngine } from '../infrastructure/ai/LogosEngine.js';
import {
    getBibleVersionAliasMap,
    resolveBibleVersion
} from '../domains/content/bible/BibleVersionRegistry.js';
import {
    getBibleCorpusPolicy,
    requireNewQuestionCorpus
} from '../domains/content/bible/BibleCorpusPolicy.js';
import { getExactQuestionEvidence } from '../domains/game/quality/QuestionEvidenceService.js';
import {
    assessCorpusReauditHistory,
    shouldPreserveInactiveQuestion
} from '../domains/game/quality/QuestionCorpusReauditPolicy.js';

test('FHL Hebrews uses 來 and the obsolete 希 alias is rejected', () => {
    assert.equal(getFhlBook('Hebrews')?.code, '來');
    assert.equal(getFhlBook('希伯來書')?.code, '來');
    assert.equal(getFhlBook('希'), null);
});

test('FHL chapter request always disables Strong numbers', () => {
    const service = new FhlBibleSyncService();
    const url = new URL(service.buildChapterUrl({
        book: 'Hebrews',
        chapter: 1,
        sourceVersion: 'unv'
    }));
    assert.equal(url.searchParams.get('chineses'), '來');
    assert.equal(url.searchParams.get('strong'), '0');
});

test('FHL zero-verse and blank-verse responses are hard failures', () => {
    assert.throws(
        () => validateFhlChapterPayload({ status: 'success', record: [] }, {
            book: 'Hebrews', chapter: 1, sourceVersion: 'unv'
        }),
        /FHL_EMPTY_CHAPTER/
    );
    assert.throws(
        () => validateFhlChapterPayload({
            status: 'success',
            record: [{ sec: 1, bible_text: '   ' }]
        }),
        /FHL_BLANK_VERSE/
    );
});

test('FHL text normalization preserves real numbers', () => {
    assert.equal(normalizeFhlText('<span>2024 年</span>&nbsp;仍然'), '2024 年 仍然');
});

test('source version cannot be substituted across internal translations', async () => {
    const service = new FhlBibleSyncService();
    await assert.rejects(
        service.downloadBook({ book: 'Hebrews', targetVersion: 'CUV_TRAD', sourceVersion: 'ncv' }),
        /SOURCE_VERSION_MISMATCH/
    );
    await assert.rejects(
        service.downloadBook({ book: 'Hebrews', targetVersion: 'TCV2010_TRAD', sourceVersion: 'tcv95' }),
        /SOURCE_VERSION_MISMATCH/
    );
});

test('audited modern Chinese compatibility storage is pinned to FHL tcv2019', async () => {
    assert.equal(FHL_FIXED_VERSION_MAP.TCV2010_TRAD, 'tcv2019');
    assert.equal(FHL_FIXED_VERSION_MAP.LCC_TRAD, 'lcc');
    const service = new FhlBibleSyncService();
    assert.equal(await service.resolveSourceVersion(null, 'TCV2010_TRAD'), 'tcv2019');
});

test('canonical bible version registry resolves source and legacy aliases to one storage identity', () => {
    assert.deepEqual(resolveBibleVersion('tcv2019'), {
        requestedVersion: 'tcv2019',
        canonicalVersion: 'TCV2019_TRAD',
        storageVersion: 'TCV2010_TRAD',
        sourceVersion: 'tcv2019',
        displayName: '現代中文譯本2019'
    });
    assert.equal(resolveBibleVersion('TCV_TRAD').canonicalVersion, 'TCV2019_TRAD');
    assert.equal(resolveBibleVersion('lcc').storageVersion, 'LCC_TRAD');
    assert.equal(getBibleVersionAliasMap().lcc, 'LCC_TRAD');
});

test('tcv95 remains a private evidence-only identity and never aliases to tcv2019', () => {
    const oldTranslation = resolveBibleVersion('tcv95');
    const currentTranslation = resolveBibleVersion('tcv2019');
    assert.equal(oldTranslation.canonicalVersion, 'TCV1995_TRAD');
    assert.equal(oldTranslation.storageVersion, 'TCV1995_TRAD');
    assert.equal(oldTranslation.public, false);
    assert.notEqual(oldTranslation.canonicalVersion, currentTranslation.canonicalVersion);
});

test('corpus registry blocks new questions independently from exact-version evidence', async () => {
    const db = {
        async get() {
            return {
                version_id: 'CUV_TRAD', source_version: 'unv', coverage_status: 'COMPLETE',
                evidence_eligible: true, new_question_eligible: false,
                active_sync_run_id: 'sync-1', active_promotion_id: 'promotion-1'
            };
        }
    };
    const policy = await getBibleCorpusPolicy('unv', db);
    assert.equal(policy.evidenceEligible, true);
    assert.equal(policy.newQuestionEligible, false);
    assert.equal(policy.reason, 'NEW_QUESTION_PRODUCTION_DISABLED');
    await assert.rejects(
        requireNewQuestionCorpus('unv', db),
        /NEW_QUESTION_PRODUCTION_DISABLED:CUV_TRAD/
    );
});

test('corpus registry accepts PostgreSQL adapter camelCase fields', async () => {
    const fakeDb = {
        get: async () => ({
            versionId: 'CUV_TRAD',
            sourceVersion: 'unv',
            coverageStatus: 'COMPLETE',
            evidenceEligible: true,
            newQuestionEligible: false,
            activeSyncRunId: 'sync-current',
            activePromotionId: 'promotion-current'
        })
    };
    const policy = await getBibleCorpusPolicy('CUV_TRAD', fakeDb);
    assert.equal(policy.evidenceEligible, true);
    assert.equal(policy.newQuestionEligible, false);
    assert.equal(policy.reason, 'NEW_QUESTION_PRODUCTION_DISABLED');
    assert.equal(policy.activeSyncRunId, 'sync-current');
    assert.equal(policy.activePromotionId, 'promotion-current');
});

test('exact evidence preserves requested identity while querying canonical storage only', async () => {
    const calls = [];
    const db = {
        async get(sql, params) {
            calls.push({ sql, params });
            return {
                version_id: 'TCV2019_TRAD', source_version: 'tcv2019', coverage_status: 'COMPLETE',
                evidence_eligible: true, new_question_eligible: false,
                active_sync_run_id: 'sync-tcv', active_promotion_id: null
            };
        },
        async query(sql, params) {
            calls.push({ sql, params });
            return [{
                book: 'Hebrews', chapter: 1, verse: 1, text: '上帝在古時候，曾經多次用不同的方法，藉著先知向我們的祖先說話。',
                version: 'TCV2010_TRAD', source: 'FHL_SYNC', metadata: { source_version: 'tcv2019' }
            }];
        }
    };
    const evidence = await getExactQuestionEvidence({
        version: 'TCV2010_TRAD', book: '希伯來書', chapter: 1, verse_start: 1, verse_end: 1
    }, db);
    assert.equal(evidence.available, true);
    assert.equal(evidence.version, 'TCV2010_TRAD');
    assert.equal(evidence.canonicalVersion, 'TCV2019_TRAD');
    assert.equal(evidence.storageVersion, 'TCV2010_TRAD');
    assert.equal(calls[1].params[0], 'TCV2010_TRAD');
});

test('exact evidence resolves a merged placeholder to its verified source range', async () => {
    const db = {
        async get() {
            return {
                version_id: 'TCV2019_TRAD', source_version: 'tcv2019', coverage_status: 'COMPLETE',
                evidence_eligible: true, new_question_eligible: false,
                active_sync_run_id: 'sync-tcv', active_promotion_id: null
            };
        },
        async query(_sql, params) {
            assert.deepEqual(params, ['TCV2010_TRAD', '1 Chronicles', 4]);
            return [
                {
                    book: '1 Chronicles', chapter: 4, verse: 17, text: '第十七至十八節的合併正文',
                    version: 'TCV2010_TRAD', source: 'FHL_SYNC',
                    metadata: { source_version: 'tcv2019', verse_status: 'MERGED_RANGE_ANCHOR', merged_verse_end: 18 }
                },
                {
                    book: '1 Chronicles', chapter: 4, verse: 18, text: 'a',
                    version: 'TCV2010_TRAD', source: 'FHL_SYNC',
                    metadata: { source_version: 'tcv2019', verse_status: 'MERGED_WITH_PREVIOUS', merged_into_verse: 17 }
                }
            ];
        }
    };

    const evidence = await getExactQuestionEvidence({
        version: 'TCV2010_TRAD', book: '歷代志上', chapter: 4, verse_start: 18, verse_end: 18
    }, db);

    assert.equal(evidence.available, true);
    assert.equal(evidence.verses.length, 1);
    assert.equal(evidence.verses[0].verseLabel, '17–18');
    assert.deepEqual(evidence.verses[0].coveredVerses, [17, 18]);
    assert.equal(evidence.verses[0].text, '第十七至十八節的合併正文');
});

test('exact evidence blocks an unannotated source placeholder from AI use', async () => {
    const db = {
        async get() {
            return {
                version_id: 'TCV2019_TRAD', source_version: 'tcv2019', coverage_status: 'COMPLETE',
                evidence_eligible: true, new_question_eligible: false
            };
        },
        async query() {
            return [{
                book: '1 Chronicles', chapter: 4, verse: 18, text: 'a',
                version: 'TCV2010_TRAD', source: 'FHL_SYNC', metadata: { source_version: 'tcv2019' }
            }];
        }
    };

    const evidence = await getExactQuestionEvidence({
        version: 'TCV2010_TRAD', book: '歷代志上', chapter: 4, verse_start: 18, verse_end: 18
    }, db);

    assert.equal(evidence.available, false);
    assert.equal(evidence.reason, 'SOURCE_PLACEHOLDER_NOT_REPAIRED');
});

test('offline importer allowlist contains only the approved A1 and A2 packages', () => {
    assert.deepEqual(Object.keys(OFFLINE_VERSION_MANIFEST), ['unv', 'lcc']);
    assert.equal(OFFLINE_VERSION_MANIFEST.unv.tableName, 'nstrunv');
    assert.equal(OFFLINE_VERSION_MANIFEST.lcc.expected.verses, 31103);
});

test('audited live API corrections replace only their exact staging reference', () => {
    const download = {
        rows: [{
            book: 'Genesis', chapter: 2, verse: 25, text: '舊字',
            sourceSha256: 'old', sourceKind: 'FHL_OFFLINE_SQLITE'
        }]
    };
    const applied = applyLiveApiCorrections(download, [{
        reference: 'Genesis:2:25',
        liveText: '正字',
        liveSha256: 'new'
    }]);
    assert.equal(applied, 1);
    assert.equal(download.rows[0].text, '正字');
    assert.equal(download.rows[0].sourceSha256, 'new');
    assert.equal(download.rows[0].sourceKind, 'FHL_LIVE_API_CORRECTION');
});

test('answer must appear in options exactly once', () => {
    assert.equal(validateQuestionOptions('摩西', ['摩西', '大衛', '保羅', '彼得']).ok, true);
    assert.equal(validateQuestionOptions('摩西', ['摩西', '摩西', '保羅', '彼得']).ok, false);
    assert.equal(validateQuestionOptions('摩西', ['大衛', '約翰', '保羅', '彼得']).ok, false);
});

test('numeric distractors are valid only with matching numeric type and unit', () => {
    assert.equal(validateDistractorSet('40天', ['30天', '50天', '70天']).ok, true);
    assert.equal(validateDistractorSet('40天', ['30年', '50天', '70天']).ok, false);
    assert.equal(validateDistractorSet('摩西', ['30天', '大衛', '保羅']).ok, false);
});

test('V4.1 only allows VERIFIED quality even when an obsolete shadow mode is configured', () => {
    assert.equal(isQuestionAllowedByQuality({ quality_state: 'LEGACY' }, 'shadow'), false);
    assert.equal(isQuestionAllowedByQuality({ quality_state: 'VERIFIED' }, 'shadow'), true);
    assert.equal(isQuestionAllowedByQuality({ quality_state: 'QUARANTINED' }, 'shadow'), false);
    assert.equal(isQuestionAllowedByQuality({ quality_state: 'EVIDENCE_UNAVAILABLE' }, 'shadow'), false);
    assert.equal(getPlayableQualitySql('shadow'), "quality_state = 'VERIFIED'");
});

test('V4.1 assembles options only from a certified nested distractor pool', () => {
    const question = {
        id: 'q1',
        status: 'PASS',
        quality_state: 'VERIFIED',
        quality_standard_version: 'question_quality_v4_1',
        active_revision_id: 'r1',
        latest_audit_result: 'PASS',
        version: 'CUV_TRAD',
        verse_start: 1,
        verse_ref: '1:1',
        final_difficulty_score: 42,
        difficulty_band: 'MEDIUM',
        answer: '正解',
        options: null,
        distractors_pool: [['錯一', '錯二', '錯三'], ['錯四', '錯五', '錯六']]
    };
    const assembled = assembleVerifiedQuestion(question, { random: () => 0 });
    assert.equal(assembled.ok, true);
    assert.equal(assembled.question.options.length, 4);
    assert.equal(assembled.question.options.filter(option => option === '正解').length, 1);
    assert.equal(getQuestionPlayability({
        ...question,
        distractors_pool: null,
        options: ['正解', '舊一', '舊二', '舊三']
    }).playable, false);
});

test('expedition uses the same four-option contract as every other game mode', () => {
    assert.deepEqual(Object.values(STAGE_OPTION_COUNT), [4, 4, 4, 4]);
});

test('retired or account-unavailable Gemini models are classified for model failover', () => {
    assert.equal(isModelUnavailableError('404 Not Found: model is no longer available to new users'), true);
    assert.equal(isModelUnavailableError('503 Service Unavailable'), false);
});

test('double-encoded structured audit responses are normalized before verdict handling', () => {
    const encoded = JSON.stringify(JSON.stringify({ verdict: 'PASS' }));
    assert.deepEqual(normalizeStructuredAuditResult(encoded), { verdict: 'PASS' });
});

test('markdown audit reports remain unstructured and cannot be treated as verdicts', () => {
    const markdown = '### 品質稽核報告\n\n判定結果：`REJECT`\n\n證據不相符。';
    assert.equal(normalizeStructuredAuditResult(markdown), markdown);
    assert.equal(typeof normalizeStructuredAuditResult(markdown), 'string');
});

test('admin repair revisions preserve distractor pools without accepting evidence replacement', () => {
    const candidate = buildQuestionRevisionCandidate({
        question: '修訂後題目',
        answer: '正解',
        options: ['正解', '錯一', '錯二', '錯三'],
        distractors_pool: [['錯一', '錯二', '錯三']],
        category: 'verse_fill',
        evidence_quote: '不應由內容編輯器覆蓋'
    });

    assert.deepEqual(candidate.options, ['正解', '錯一', '錯二', '錯三']);
    assert.deepEqual(candidate.distractors_pool, [['錯一', '錯二', '錯三']]);
    assert.equal(candidate.category, 'verse_fill');
    assert.equal(Object.hasOwn(candidate, 'evidence_quote'), false);
});

test('automatic approval requires two structured risk-free same-version PASS audits', () => {
    const passAudit = {
        result: 'PASS',
        reason: '符合經文',
        riskFlags: [],
        evidenceSnapshot: { available: true, version: 'CUV_TRAD' },
        distractorResults: [{ set_index: 1, verdict: 'PASS' }],
        rawResult: { verdict: 'PASS' }
    };

    assert.deepEqual(
        assessAutoApprovalAudits([passAudit, structuredClone(passAudit)], { version: 'CUV_TRAD' }),
        { ok: true, reason: 'DOUBLE_AUDIT_PASS' }
    );
    assert.equal(
        assessAutoApprovalAudits([passAudit], { version: 'CUV_TRAD' }).ok,
        false
    );
    assert.equal(
        assessAutoApprovalAudits([
            passAudit,
            { ...passAudit, riskFlags: ['AMBIGUOUS'] }
        ], { version: 'CUV_TRAD' }).ok,
        false
    );
    assert.equal(
        assessAutoApprovalAudits([
            passAudit,
            { ...passAudit, evidenceSnapshot: { available: true, version: 'CNV_TRAD' } }
        ], { version: 'CUV_TRAD' }).ok,
        false
    );
});

test('generated distractor repair requires three five-item sets with no cross-set duplicate', () => {
    const validSets = [
        ['Andrew', 'James', 'John', 'Thomas', 'Philip'],
        ['Matthew', 'Bartholomew', 'Simon', 'Thaddaeus', 'Matthias'],
        ['Stephen', 'Barnabas', 'Silas', 'Timothy', 'Titus']
    ];
    assert.equal(validateGeneratedDistractorSets('Peter', validSets).ok, true);
    assert.equal(validateGeneratedDistractorSets('Peter', validSets.slice(0, 2)).ok, false);
    assert.equal(validateGeneratedDistractorSets('Peter', [
        validSets[0], validSets[1], ['Andrew', 'Barnabas', 'Silas', 'Timothy', 'Titus']
    ]).reason, 'DISTRACTOR_REPAIR_CROSS_SET_DUPLICATE');
});

test('generated distractor candidate changes only options and distractor metadata', () => {
    const question = {
        id: 'q-repair-1',
        question: 'Who answered the question?',
        answer: 'Peter',
        explanation: 'Evidence explanation',
        evidence: 'Evidence',
        evidence_ref: '1:1',
        evidence_quote: 'Peter answered.',
        category: 'person',
        book: 'Matthew',
        chapter: 1,
        verse_start: 1,
        verse_end: 1,
        verse_ref: '1:1',
        version: 'CUV_TRAD'
    };
    const candidateChanges = buildGeneratedDistractorCandidate(question, {
        status: 'REPAIRABLE',
        reason: 'All alternatives are distinct people and contradicted by the evidence.',
        answer_type: 'person',
        risk_flags: [],
        distractor_sets: [
            ['Andrew', 'James', 'John', 'Thomas', 'Philip'],
            ['Matthew', 'Bartholomew', 'Simon', 'Thaddaeus', 'Matthias'],
            ['Stephen', 'Barnabas', 'Silas', 'Timothy', 'Titus']
        ],
        generation_notes: ['set 1', 'set 2', 'set 3']
    });
    const candidate = { ...question, ...candidateChanges };
    assert.equal(hasOnlyGeneratedDistractorChanges(question, candidate), true);
    assert.equal(validateQuestionOptions(question.answer, candidate.options).ok, true);
    assert.equal(candidate.distractors_pool.length, 3);
    assert.equal(candidate.distractors_pool.every(set => set.length === 5), true);
    assert.equal(
        hasOnlyGeneratedDistractorChanges(question, { ...candidate, answer: 'John' }),
        false
    );
});

test('automatic retirement requires two structured same-version content failures', () => {
    const failureAudit = {
        result: 'RETRY_DISTRACTORS',
        reason: 'One alternative can also be correct.',
        riskFlags: ['MULTIPLE_CORRECT'],
        evidenceSnapshot: { available: true, version: 'CUV_TRAD' },
        distractorResults: [{ set_index: 1, verdict: 'REJECT' }],
        rawResult: { verdict: 'RETRY_DISTRACTORS' }
    };
    assert.deepEqual(
        assessAutoRetirementAudits([failureAudit, structuredClone(failureAudit)], {
            version: 'CUV_TRAD'
        }),
        { ok: true, reason: 'DOUBLE_CONTENT_FAILURE' }
    );
    assert.equal(assessAutoRetirementAudits([failureAudit], { version: 'CUV_TRAD' }).ok, false);
    assert.equal(assessAutoRetirementAudits([
        failureAudit,
        { ...failureAudit, result: 'PASS', rawResult: { verdict: 'PASS' } }
    ], { version: 'CUV_TRAD' }).ok, false);
    assert.equal(assessAutoRetirementAudits([
        failureAudit,
        { ...failureAudit, evidenceSnapshot: { available: true, version: 'CNV_TRAD' } }
    ], { version: 'CUV_TRAD' }).ok, false);
});

test('legacy location references normalize only when the book and range are unambiguous', () => {
    assert.deepEqual(
        parseLegacyVerseReference('出埃及記 3：8-9', '出埃及記'),
        {
            ok: true,
            source: 'PREFIXED_REFERENCE',
            chapter: 3,
            verseStart: 8,
            verseEnd: 9,
            verseRef: '3:8-9',
            normalized: '出埃及記 3:8-9'
        }
    );
    assert.equal(parseLegacyVerseReference('賽 30:30', '以賽亞書').ok, true);
    assert.equal(parseLegacyVerseReference('出埃及記 3:8', '創世記').reason, 'REFERENCE_BOOK_MISMATCH');
    assert.equal(parseLegacyVerseReference('N/A', '創世記').reason, 'REFERENCE_MISSING');
});

test('location repair trusts a matching verse reference and exact-version evidence without changing content', () => {
    const question = {
        book: '以弗所書',
        chapter: 1,
        verse_start: 21,
        verse_end: 21,
        verse_ref: '6:21',
        version: 'TCV2010_TRAD',
        question: '誰是忠心侍奉主的使者？',
        answer: '推基古'
    };
    const proposal = proposeQuestionLocationRepair(question, { evidenceExists: () => true });
    assert.equal(proposal.repairable, true);
    assert.equal(proposal.target.chapter, 6);
    assert.equal(proposal.target.verse_ref, '6:21');
    assert.deepEqual(Object.keys(proposal.changes), ['chapter']);
    assert.equal(
        proposeQuestionLocationRepair(question, { evidenceExists: () => false }).reason,
        'EXACT_VERSION_EVIDENCE_MISSING'
    );
});

test('location-only approval guard rejects content mutations', () => {
    const previous = {
        question: '原題', answer: '答案', options: ['答案', '甲', '乙', '丙'],
        chapter: 1, verse_start: 3, verse_end: 3, verse_ref: '1:3'
    };
    assert.equal(hasOnlyLocationChanges(previous, { ...previous, chapter: 2, verse_ref: '2:3' }), true);
    assert.equal(hasOnlyLocationChanges(previous, { ...previous, answer: '改過答案', chapter: 2 }), false);
});

test('semantic normalization detects punctuation-only duplicates', () => {
    assert.equal(
        normalizeSemanticText('耶穌降生時，當時的王是誰？'),
        normalizeSemanticText('耶穌降生時 當時的王是誰')
    );
    const cases = buildSemanticDuplicateCases([
        {
            id: 'new-1', book: '馬太福音', chapter: 2, version: 'CUV_TRAD',
            verse_start: 1, verse_end: 1, question: '耶穌降生時，當時的王是誰？', answer: '希律王'
        }
    ], [
        {
            id: 'old-1', book: '馬太福音', chapter: 2, version: 'CUV_TRAD',
            verse_start: 1, verse_end: 1, question: '耶穌降生時 當時的王是誰', answer: '希律王'
        }
    ]);
    assert.equal(cases.exactDuplicates.length, 1);
    assert.equal(cases.exactDuplicates[0].duplicateQuestionId, 'old-1');
});

test('same-location same-answer paraphrases enter semantic audit and share a stable group key', () => {
    const first = {
        id: 'q1', book: '出埃及記', chapter: 3, version: 'CUV_TRAD',
        verse_start: 1, verse_end: 1, question: '摩西看見荊棘燃燒是在何處？', answer: '何烈山'
    };
    const second = {
        id: 'q2', book: '出埃及記', chapter: 3, version: 'CUV_TRAD',
        verse_start: 1, verse_end: 1, question: '上帝在哪座山呼召摩西？', answer: '何烈山'
    };
    const ranked = rankSemanticDuplicateCandidates(second, [first]);
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].sameAnswer, true);
    assert.equal(ranked[0].sameVerse, true);
    assert.equal(buildSemanticGroupKey(first), buildSemanticGroupKey(second));
});

test('semantic duplicate audit accepts confident classification but blocks uncertainty', () => {
    const duplicate = normalizeDuplicateAuditResult({
        verdict: 'DUPLICATE', confidence: 0.95, duplicate_question_id: 'old-1', reason: '同一事實'
    }, 'new-1');
    const uncertain = normalizeDuplicateAuditResult({
        verdict: 'UNCERTAIN', confidence: 0.7, reason: '資料不足'
    }, 'new-2');
    assert.equal(isDuplicateAuditResolved(duplicate), true);
    assert.equal(isDuplicateAuditResolved(uncertain), false);
    assert.ok(TASK_SCHEMAS.question_duplicate_audit);
});

test('layered game selection keeps at most one question from each semantic group', () => {
    const engine = new QuizEngine();
    const pool = [
        { id: 'a', question: '問法甲', semantic_group_key: 'group-1', _jitScore: 20 },
        { id: 'b', question: '問法乙', semantic_group_key: 'group-1', _jitScore: 30 },
        { id: 'c', question: '不同考點', semantic_group_key: 'group-2', _jitScore: 50 }
    ];
    const selected = engine._layeredSample(pool, 3);
    assert.equal(selected.length, 2);
    assert.equal(new Set(selected.map(question => question.semantic_group_key)).size, 2);
    const afterAskingFirstVariant = engine._layeredSample(pool, 2, new Set(['問法甲']));
    assert.deepEqual(afterAskingFirstVariant.map(question => question.id), ['c']);
});

test('confident paraphrases are retained and inherit the existing semantic group', async () => {
    const auditor = new LogosAuditor({
        askBrain: async () => ({
            results: [{
                candidate_id: 'new-variant',
                verdict: 'DUPLICATE',
                duplicate_question_id: 'existing-variant',
                confidence: 0.97,
                reason: '同一考點的不同說法',
                shared_fact: '耶穌降生時由希律王統治',
                suggested_new_angle: null
            }]
        })
    });
    const existing = {
        id: 'existing-variant', book: '馬太福音', chapter: 2, version: 'CUV_TRAD',
        verse_start: 1, verse_end: 1, question: '當時統治猶太地的王是誰？',
        answer: '希律王', semantic_group_key: 'semantic-herod'
    };
    const candidate = {
        id: 'new-variant', book: '馬太福音', chapter: 2, version: 'CUV_TRAD',
        verse_start: 1, verse_end: 1, question: '耶穌降生在伯利恆時，當時的王是誰？',
        answer: '希律王'
    };
    const accepted = await auditor.livePrune([candidate], [existing]);
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0].semantic_group_key, 'semantic-herod');
    assert.equal(accepted[0].semantic_duplicate_of, 'existing-variant');
});

test('all question audit tasks use structured JSON with their matching prompt schema', () => {
    assert.equal(isStructuredLogosTask('question_full_audit'), true);
    assert.equal(isStructuredLogosTask('question_body_audit'), true);
    assert.equal(isStructuredLogosTask('question_duplicate_audit'), true);
    assert.equal(isStructuredLogosTask('question_difficulty_audit'), true);
    assert.ok(TASK_SCHEMAS.question_difficulty_audit);
    assert.equal(isStructuredLogosTask('expert_chat'), false);
    const instruction = LogosEngine._buildSystemInstruction('question_full_audit', {});
    assert.match(instruction, /問答題完整品質稽核 V4/);
    assert.match(instruction, /"verdict"/);
    assert.match(instruction, /不可因候選池有 5 個就判定選項過多/);
    assert.equal(isStructuredLogosTask('question_distractor_repair'), true);
    assert.ok(TASK_SCHEMAS.question_distractor_repair);
    const repairInstruction = LogosEngine._buildSystemInstruction('question_distractor_repair', {});
    assert.match(repairInstruction, /"distractor_sets"/);
    assert.equal(isStructuredLogosTask('question_location_fix'), true);
    assert.ok(TASK_SCHEMAS.question_location_fix);
    const locationInstruction = LogosEngine._buildSystemInstruction('question_location_fix', {});
    assert.match(locationInstruction, /"verse_start"/);
    const difficultyInstruction = LogosEngine._buildSystemInstruction('question_difficulty_audit', {});
    assert.match(difficultyInstruction, /難度獨立評分/);
    assert.match(difficultyInstruction, /target_band_supported/);
});

test('corpus re-audit requires two independent risk-free PASS results', () => {
    const pass = {
        result: 'PASS',
        riskFlags: [],
        evidenceSnapshot: { available: true, version: 'CUV_TRAD' },
        rawResult: { verdict: 'PASS' }
    };
    assert.equal(assessCorpusReauditHistory([pass]).terminal, false);
    assert.deepEqual(assessCorpusReauditHistory([pass, pass]), {
        terminal: true,
        finalResult: 'PASS',
        qualityState: 'VERIFIED',
        passCount: 2,
        failureCount: 0
    });
    assert.equal(assessCorpusReauditHistory([
        pass,
        { ...pass, riskFlags: ['UNCERTAIN'] },
        { result: 'FREEZE', evidenceSnapshot: { available: true }, rawResult: { verdict: 'FREEZE' } }
    ]).finalResult, 'INCONCLUSIVE');
});

test('corpus re-audit can rehabilitate inactive questions but never revives retired questions', () => {
    const failure = {
        result: 'REJECT',
        evidenceSnapshot: { available: true },
        rawResult: { verdict: 'REJECT' }
    };
    assert.equal(assessCorpusReauditHistory([failure]).terminal, false);
    assert.equal(assessCorpusReauditHistory([failure, failure]).qualityState, 'QUARANTINED');
    assert.equal(shouldPreserveInactiveQuestion('FREEZE', 'QUARANTINED'), false);
    assert.equal(shouldPreserveInactiveQuestion('RETIRED', 'RETIRED'), true);
    assert.equal(shouldPreserveInactiveQuestion('PASS', 'LEGACY'), false);
});

test('two passing audits produce a stable versioned difficulty consensus', () => {
    const audits = [
        {
            result: 'PASS',
            difficultySnapshot: {
                estimatedScore: 90,
                generalBeliever: '需要跨段落辨識',
                seminaryStudent: '涉及細節辨識'
            }
        },
        {
            result: 'PASS',
            difficultySnapshot: {
                estimatedScore: 96,
                generalBeliever: '不易直接回想',
                seminaryStudent: '需精確掌握上下文'
            }
        }
    ];
    const consensus = assessDifficultyConsensus(audits);
    assert.equal(consensus.ok, true);
    assert.equal(consensus.score, 93);
    assert.equal(consensus.band, 'VERY_HARD');
    assert.deepEqual(consensus.scores, [90, 96]);

    const candidate = applyDifficultyConsensus({ difficulty: 'MEDIUM' }, consensus);
    assert.equal(candidate.difficulty, 'VERY_HARD');
    assert.equal(candidate.ai_difficulty_score, 93);
    assert.equal(candidate.difficulty_consensus.standard, 'DOUBLE_AUDIT_V4');
});

test('three difficulty audits accept the closest independent pair', () => {
    const consensus = assessDifficultyConsensus([
        { result: 'PASS', difficultySnapshot: { estimatedScore: 25 } },
        { result: 'PASS', difficultySnapshot: { estimatedScore: 80 } },
        { result: 'PASS', difficultySnapshot: { estimatedScore: 28 } }
    ]);
    assert.equal(consensus.ok, true);
    assert.deepEqual(consensus.scores, [25, 28]);
    assert.equal(consensus.spread, 3);
});

test('difficulty disagreement cannot be used to fill an inventory band', () => {
    const consensus = assessDifficultyConsensus([
        { result: 'PASS', difficultySnapshot: { estimatedScore: 25 } },
        { result: 'PASS', difficultySnapshot: { estimatedScore: 80 } }
    ]);
    assert.equal(consensus.ok, false);
    assert.equal(consensus.reason, 'DIFFICULTY_SCORE_DISAGREEMENT');
});

test('dedicated difficulty audit validates score and declared band', () => {
    const valid = normalizeDedicatedDifficultyAudit({
        estimated_difficulty_score: 72,
        difficulty_band: 'HARD',
        evidence_complexity: 'MULTI_VERSE_REASONING',
        target_band_supported: true,
        difficulty_reason_general_believer: '需整合兩處線索',
        difficulty_reason_seminary_student: '需要辨認上下文關係'
    });
    assert.equal(valid.result, 'PASS');
    assert.equal(valid.difficultySnapshot.estimatedScore, 72);
    assert.equal(valid.difficultySnapshot.evidenceComplexity, 'MULTI_VERSE_REASONING');

    const mismatch = normalizeDedicatedDifficultyAudit({
        estimated_difficulty_score: 72,
        difficulty_band: 'MEDIUM'
    });
    assert.equal(mismatch.result, 'FREEZE');
    assert.equal(mismatch.reason, 'DIFFICULTY_AUDIT_BAND_MISMATCH');
});

test('location repair requires two high-confidence audits on the same exact range', () => {
    const first = normalizeLocationFixResult({
        status: 'FOUND', chapter: 3, verse_start: 16, verse_end: 16,
        confidence: 0.96, reason: '直接陳述', evidence_quote: '神愛世人'
    });
    const second = normalizeLocationFixResult({
        status: 'FOUND', chapter: 3, verse_start: 16, verse_end: 16,
        confidence: 0.94, reason: '答案明確', evidence_quote: '神愛世人'
    });
    const consensus = assessLocationFixConsensus([first, second]);
    assert.equal(consensus.ok, true);
    assert.equal(consensus.status, 'FOUND');
    assert.equal(consensus.verseStart, 16);

    const disagreement = assessLocationFixConsensus([
        first,
        { ...second, verseStart: 17, verseEnd: 17 }
    ]);
    assert.equal(disagreement.ok, false);
    assert.equal(disagreement.reason, 'LOCATION_AUDITS_DISAGREE');

    const thirdAuditConsensus = assessLocationFixConsensus([
        first,
        { ...second, verseStart: 17, verseEnd: 17 },
        { ...second, confidence: 0.93 }
    ]);
    assert.equal(thirdAuditConsensus.ok, true);
    assert.equal(thirdAuditConsensus.verseStart, 16);

    const threeWayDisagreement = assessLocationFixConsensus([
        first,
        { ...second, verseStart: 17, verseEnd: 17 },
        { ...second, verseStart: 18, verseEnd: 18 }
    ]);
    assert.equal(threeWayDisagreement.ok, false);
    assert.equal(threeWayDisagreement.reason, 'LOCATION_THREE_AUDIT_NO_CONSENSUS');
});

test('location repair normalizes percentage confidence without weakening threshold', () => {
    const normalized = normalizeLocationFixResult({
        status: 'FOUND',
        chapter: 3,
        verse_start: 16,
        verse_end: 16,
        confidence: 95,
        reason: 'direct evidence',
        evidence_quote: 'matching text'
    });
    assert.equal(normalized.confidence, 0.95);
    assert.throws(() => normalizeLocationFixResult({
        status: 'FOUND', chapter: 3, verse_start: 16, verse_end: 16,
        confidence: 101, reason: 'invalid', evidence_quote: ''
    }), /LOCATION_FIX_CONFIDENCE_INVALID/);
});

test('two high-confidence not-found location audits quarantine instead of guessing', () => {
    const consensus = assessLocationFixConsensus([
        { status: 'NOT_FOUND', chapter: null, verse_start: null, verse_end: null, confidence: 0.97, reason: '百科題', evidence_quote: '' },
        { status: 'NOT_FOUND', chapter: null, verse_start: null, verse_end: null, confidence: 0.95, reason: '經文未陳述', evidence_quote: '' }
    ]);
    assert.equal(consensus.ok, true);
    assert.equal(consensus.status, 'NOT_FOUND');
});

test('new question generation requires an exact segment and verse range', () => {
    const segments = [{
        id: 2,
        chapter: 3,
        verseRange: { start: 10, end: 18 }
    }];
    assert.equal(validateGeneratedQuestionLocation({
        segment_id: 2,
        verseRef: '約翰福音 3:16'
    }, segments, '約翰福音').ok, true);
    assert.equal(validateGeneratedQuestionLocation({
        segment_id: 9,
        verseRef: '約翰福音 3:16'
    }, segments, '約翰福音').reason, 'UNKNOWN_SEGMENT_ID');
    assert.equal(validateGeneratedQuestionLocation({
        segment_id: 2,
        verseRef: '約翰福音 3:19'
    }, segments, '約翰福音').reason, 'VERSE_OUTSIDE_SEGMENT');
    assert.equal(validateGeneratedQuestionLocation({
        segment_id: 2,
        verseRef: '羅馬書 3:16'
    }, segments, '約翰福音').reason, 'BOOK_MISMATCH');
});

test('hard generation requires a multi-verse evidence scope before model audits', () => {
    assert.equal(validateGeneratedDifficultyScope({ verseRef: '羅馬書 8:1' }, 'HARD').ok, false);
    assert.equal(validateGeneratedDifficultyScope({ verseRef: '羅馬書 8:1-2' }, 'HARD').ok, true);
    assert.equal(validateGeneratedDifficultyScope({ verseRef: '羅馬書 8:1-2' }, 'VERY_HARD').ok, false);
    assert.equal(validateGeneratedDifficultyScope({ verseRef: '羅馬書 8:1-3' }, 'VERY_HARD').ok, true);
    assert.equal(validateGeneratedDifficultyScope({ verseRef: '羅馬書 8:1' }, 'MEDIUM').ok, true);
});

test('new generation stores only questions that fill their actual difficulty shortage', () => {
    const decision = partitionVerifiedInventoryAdds([
        { id: 'm1', final_difficulty_score: 55 },
        { id: 'm2', final_difficulty_score: 60 },
        { id: 'h1', final_difficulty_score: 72 }
    ], { EASY: 0, MEDIUM: 1, HARD: 1, VERY_HARD: 0 });
    assert.deepEqual(decision.accepted.map(item => item.question.id), ['m1', 'h1']);
    assert.equal(decision.rejected[0].question.id, 'm2');
    assert.equal(decision.rejected[0].reason, 'ACTUAL_DIFFICULTY_INVENTORY_FULL');
});

test('batch question schema requires source segment and exact verse reference', () => {
    const schema = TASK_SCHEMAS.batch_questions.properties.questions.items;
    assert.ok(schema.required.includes('segment_id'));
    assert.ok(schema.required.includes('status'));
    assert.ok(schema.required.includes('verseRef'));
    assert.deepEqual(schema.properties.status.enum, ['success', 'need_more_context']);
});

test('verse fill questions are rejected locally when the blank is missing', () => {
    const result = QuestionBodyAuditor._checkRules({
        question: '王的筵席持續多少日？',
        answer: '一百八十日',
        category: 'verse_fill',
        book: '以斯帖記',
        chapter: 1,
        verse_ref: '以斯帖記 1:4'
    });
    assert.equal(result.status, 'REJECTED');
    assert.ok(result.risk_flags.includes('VERSE_FILL_PLACEHOLDER_MISSING'));
});

test('targeted generation rejects a different category before audit', () => {
    assert.equal(isGeneratedCategoryAllowed({ category: 'verse_fill' }, 'verse_fill'), true);
    assert.equal(isGeneratedCategoryAllowed({ category: 'verse_fact' }, 'verse_fill'), false);
});

test('verse fill local rule accepts a normalized explicit blank', () => {
    assert.equal(normalizeGeneratedQuestionText('惟＿＿＿＿因信得生。'), '惟___因信得生。');
    const result = QuestionBodyAuditor._checkRules({
        question: '惟___因信得生。',
        answer: '義人',
        category: 'verse_fill',
        book: '哈巴谷書',
        chapter: 2,
        verse_ref: '哈巴谷書 2:4'
    });
    assert.equal(result.status, 'PASS');
});

test('all new question generation uses full Flash when quality is prioritized over cost', () => {
    assert.equal(getGenerationQualityModel('HARD'), 'gemini-3.5-flash');
    assert.equal(getGenerationQualityModel('VERY_HARD'), 'gemini-3.5-flash');
    assert.equal(getGenerationQualityModel('MEDIUM'), 'gemini-3.5-flash');
    assert.equal(getGenerationQualityModel('EASY'), 'gemini-3.5-flash');
});
