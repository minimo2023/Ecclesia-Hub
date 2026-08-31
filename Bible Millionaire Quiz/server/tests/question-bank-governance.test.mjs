import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    ACTIVE_QUESTION_BANKS,
    DEFAULT_QUESTION_BANK_POLICY,
    getPolicyTargetAtStage
} from '../domains/game/governance/QuestionBankGovernanceService.js';
import { bibleTranslator, compareBibleBooks } from '../utils/bibleTranslator.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..');
const read = relative => fs.readFileSync(path.join(serverRoot, relative), 'utf8');

test('active question banks contain only the four approved complete-corpus identities', () => {
    assert.deepEqual(ACTIVE_QUESTION_BANKS.map(item => item.id), [
        'CUV_TRAD', 'LCC_TRAD', 'CNV_TRAD', 'TCV2019_TRAD'
    ]);
    assert.equal(ACTIVE_QUESTION_BANKS.some(item => /1995/i.test(item.id)), false);
    assert.equal(ACTIVE_QUESTION_BANKS.find(item => item.id === 'TCV2019_TRAD').storageVersion, 'TCV2010_TRAD');
});

test('policy stages follow 15, 30, 50, 100, then add 50 without a ceiling', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5].map(stage => getPolicyTargetAtStage(DEFAULT_QUESTION_BANK_POLICY, stage)), [
        15, 30, 50, 100, 150, 200
    ]);
    assert.equal(getPolicyTargetAtStage({ milestones: [20, 40], milestoneIncrement: 25 }, 4), 115);
});

test('question-bank books follow canonical Bible order from Genesis to Revelation', () => {
    assert.equal(bibleTranslator.allBooks.length, 66);
    assert.deepEqual(bibleTranslator.allBooks.slice(0, 5), ['創世記', '出埃及記', '利未記', '民數記', '申命記']);
    assert.equal(bibleTranslator.allBooks.at(-1), '啟示錄');
    assert.deepEqual(['啟示錄', '民數記', '創世記', '利未記'].sort(compareBibleBooks), ['創世記', '利未記', '民數記', '啟示錄']);

    const replenishment = read('domains/game/replenishment/QuestionReplenishmentService.js');
    const admin = read('public/question-bank-admin.js');
    assert.match(replenishment, /bibleTranslator\.compareBooks\(a\.book, b\.book\)/);
    assert.match(admin, /全站巡航依創世記至啟示錄順序推進/);
});

test('runtime inventory supports the four-version mixed game and requires published questions', () => {
    const source = read('database/games.js');
    const routes = read('domains/game/quiz.routes.js');
    const desktop = read('public/index.html');
    const mobile = read('public-mobile/index.html');
    assert.match(source, /publication_state = 'PUBLISHED'/);
    assert.match(source, /MIXED_TRADITIONAL_VERSIONS = \['CUV_TRAD', 'LCC_TRAD', 'CNV_TRAD', 'TCV2019_TRAD'\]/);
    assert.match(source, /canonical_version = ANY\(\$6\)/);
    assert.match(source, /canonical_version = ANY\(\$\$?\{paramIdx\+\+\}\)/);
    assert.match(source, /canonical_version AS version/);
    assert.match(routes, /GAME_QUESTION_VERSION = 'MIXED_TRAD'/);
    assert.match(routes, /safe\.question = stripVersionPrefix\(q\.question \|\| ''\)/);
    assert.doesNotMatch(routes, /safe\.question = `【\$\{versionLabel\}】/);
    assert.match(read('..\\src\\features\\game\\components\\QuestionDisplay.jsx'), /currentQuestion\.versionLabel/);
    assert.match(read('..\\src\\features\\game\\components\\mobile\\MobileQuestionDisplay.jsx'), /currentQuestion\?\.versionLabel/);
    assert.match(desktop, /mixed-translation-ui\.js/);
    assert.match(mobile, /mixed-translation-ui\.js/);
});

test('TCV1995 is archived on migration and retirement has verified backup plus restore tooling', () => {
    const schema = read('database/schemas/question_bank.js');
    const archive = read('scripts/archive-retire-tcv1995.mjs');
    const restore = read('scripts/restore-tcv1995-archive.mjs');
    assert.match(schema, /TCV1995_TRAD/);
    assert.match(schema, /THEN 'ARCHIVED'/);
    assert.match(archive, /ARCHIVE_WRITE_VERIFICATION_FAILED/);
    assert.match(archive, /await client\.query\('BEGIN'\)/);
    assert.match(restore, /ARCHIVE_CHECKSUM_MISMATCH/);
    assert.match(restore, /mode: apply \? 'apply' : 'verify-only'/);
});

test('new management center is protected by admin roles and supports preview, history and rollback', () => {
    const routes = read('admin/question-bank.routes.js');
    const index = read('index.js');
    const html = read('public/index.html');
    assert.match(routes, /requireRole\(\['admin_content', 'admin_ops'\]\)/);
    assert.match(routes, /\/policies\/preview/);
    assert.match(routes, /\/policies\/history/);
    assert.match(routes, /\/policies\/:id\/rollback/);
    assert.match(index, /\/api\/admin\/question-bank/);
    assert.match(html, /question-bank-admin\.css/);
    assert.match(html, /question-bank-admin\.js/);
    assert.doesNotMatch(html, /targeted-replenishment-admin\.js/);
});
