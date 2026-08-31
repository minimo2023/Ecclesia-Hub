import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('dangerous and AI routes enforce the stage-0 security policy', () => {
    const server = read('../index.js');
    const generateMount = "app.use('/api/generate', aiIpLimiter, generatorRoutes);";

    assert.equal(server.includes("app.get('/api/crash'"), false);
    assert.equal(server.split(generateMount).length - 1, 1);
    assert.ok(server.indexOf("app.use('/api', apiLimiter)") < server.indexOf(generateMount));

    const generators = read('../domains/game/replenishment/generators.routes.js');
    const publicExpertRoute = "router.post('/expert', optionalAuthenticateToken, aiExpertIpLimiter, aiUserLimiter";
    assert.ok(generators.includes(publicExpertRoute));
    assert.ok(generators.indexOf(publicExpertRoute) < generators.indexOf('router.use(authenticateToken, aiUserLimiter)'));
    assert.ok(generators.includes("if (!req.user && !decoded)"));

    const protectedAdminRoutes = [
        "app.get('/api/admin/scheduler/status', ...adminOpsOnly",
        "app.get('/api/admin/replenishment/status', ...adminOpsOnly",
        "app.post('/api/admin/replenishment/pulse', ...adminOpsOnly",
        "app.post('/api/admin/scheduler/generate', ...adminOpsOnly",
        "app.delete('/api/admin/scheduler/:date', ...adminOpsOnly",
        "app.post('/api/admin/scheduler/backfill', ...adminOpsOnly",
        "app.get('/api/admin/scheduler/debug-exclusions', ...adminOpsOnly",
    ];
    protectedAdminRoutes.forEach((route) => assert.ok(server.includes(route), route));
});

test('achievement seed is authorized and non-destructive', () => {
    const achievements = read('../domains/members/achievements.routes.js');

    assert.ok(achievements.includes(
        "router.post('/admin/seed', authenticateToken, requireRole(['super_admin'])"
    ));
    assert.equal(/DROP\s+TABLE/i.test(achievements), false);
});

test('targeted replenishment is admin-only, bounded, and cannot spend paid keys', () => {
    const patrol = read('../domains/game/patrol.routes.js');
    const replenishment = read('../domains/game/replenishment/QuestionReplenishmentService.js');
    const pipeline = read('../domains/game/engine/QuestionPipeline.js');
    const quality = read('../domains/game/quality/QuestionQualityService.js');
    const adminUi = read('../public/targeted-replenishment-admin.js');

    [
        "router.get('/targeted/status', authenticateToken, requireRole(['admin_ops', 'admin_content'])",
        "router.post('/targeted/start', authenticateToken, requireRole(['admin_ops', 'admin_content'])",
        "router.post('/targeted/cancel', authenticateToken, requireRole(['admin_ops', 'admin_content'])"
    ].forEach(route => assert.ok(patrol.includes(route), route));
    assert.ok(patrol.includes('FREE_ONLY_CONFIRMATION_REQUIRED'));
    assert.ok(replenishment.includes('Math.min(12, Math.max(1'));
    assert.ok(replenishment.includes('freeOnly: true'));
    assert.ok(replenishment.includes("version: 'CUV_TRAD'"));
    assert.ok(replenishment.includes('books: bibleTranslator.allBooks'));
    assert.ok(replenishment.includes('managedCorpusValidation: true'));
    assert.ok(pipeline.includes("{ paidOnly: false, freeOnly: true }"));
    assert.ok(quality.includes('...aiPolicy'));
    assert.ok(adminUi.includes('freeOnly: true'));
    assert.equal(adminUi.includes('paidOnly: true'), false);
});

test('new generated questions are not marked verified before their revision exists', () => {
    const games = read('../database/games.js');
    assert.ok(games.includes("'SCANNING',"));
    assert.ok(games.includes('SET active_revision_id = $1'));
});

test('expedition pre-generation is admin-only and bounded', () => {
    const expedition = read('../domains/game/expedition/routes.js');

    assert.ok(expedition.includes(
        "router.post('/pre-generate', authenticateToken, requireRole(['admin_ops', 'admin_expedition'])"
    ));
    assert.ok(expedition.includes('count < 1 || count > 20'));
});

test('authentication accepts bearer tokens only and has no fixed fallback secret', () => {
    const auth = read('../middleware/auth.js');
    const authRoutes = read('../domains/members/auth.routes.js');
    const authService = read('../domains/members/AuthService.js');
    const answerTokens = read('../utils/tokenHandler.js');

    assert.equal(auth.includes('req.query.token'), false);
    [auth, authRoutes, authService, answerTokens].forEach((source) => {
        assert.equal(source.includes('dev-only'), false);
        assert.equal(source.includes('fallback_secret'), false);
    });
});

test('production refuses to create a JWT secret implicitly', () => {
    const moduleUrl = new URL('../utils/secrets.js', import.meta.url).href;
    const result = spawnSync(
        process.execPath,
        ['--input-type=module', '--eval', `import { getJwtSecret } from ${JSON.stringify(moduleUrl)}; getJwtSecret();`],
        {
            encoding: 'utf8',
            env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: '' },
        },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /JWT_SECRET must be configured in production/);
});

test('production refuses to create an answer token secret implicitly', () => {
    const moduleUrl = new URL('../utils/secrets.js', import.meta.url).href;
    const result = spawnSync(
        process.execPath,
        ['--input-type=module', '--eval', `import { getAnswerTokenSecret } from ${JSON.stringify(moduleUrl)}; getAnswerTokenSecret();`],
        {
            encoding: 'utf8',
            env: { ...process.env, NODE_ENV: 'production', ANSWER_TOKEN_SECRET: '' },
        },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ANSWER_TOKEN_SECRET must be configured in production/);
});

test('deployment artifacts never package the production environment file', () => {
    const deployScript = read('../../scripts/deploy_prod.js');
    const rootPackage = JSON.parse(read('../../../package.json'));

    assert.equal(
        deployScript.includes("archive.file(path.join(hubRoot, '.env.production')"),
        false,
    );
    assert.ok(deployScript.includes("pg_isready -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\""));
    assert.match(rootPackage.scripts['backup:now'], /server\/infrastructure\/dbBackup\.js/);
    assert.match(rootPackage.scripts['backup:list'], /server\/infrastructure\/dbBackup\.js/);
});
