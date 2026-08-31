import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = async relative => readFile(new URL(relative, import.meta.url), 'utf8');

test('mobile auth routes return refresh tokens in JSON without changing web routes', async () => {
    const routes = await source('../domains/members/auth.routes.js');
    assert.match(routes, /router\.post\('\/mobile\/login'/u);
    assert.match(routes, /router\.post\('\/mobile\/refresh'/u);
    assert.match(routes, /router\.post\('\/mobile\/logout'/u);
    assert.match(routes, /router\.post\('\/mobile\/google'/u);
    assert.match(routes, /\.\.\.auth\.body, refreshToken: auth\.refreshToken/u);
    assert.match(routes, /router\.post\('\/login'/u);
    assert.match(routes, /setRefreshCookie\(res, auth\.refreshToken\)/u);
});

test('native sessions record device metadata and keep refresh tokens hashed', async () => {
    const service = await source('../domains/members/AuthService.js');
    const schema = await source('../database/schemas/security.js');
    assert.match(service, /refreshTokenHash/u);
    assert.match(service, /INSERT INTO user_sessions[^]*\[crypto\.randomUUID\(\), userId, refreshTokenHash, expiresAt/u);
    for (const column of ['device_id', 'device_name', 'app_platform', 'app_version', 'last_seen_at', 'ip_address', 'user_agent', 'revoked_at']) {
        assert.match(schema, new RegExp(column, 'u'));
    }
});

test('app bootstrap excludes unfinished modules and diagnostics uses an allowlist', async () => {
    const routes = await source('../domains/app/routes.js');
    assert.match(routes, /router\.get\('\/bootstrap'/u);
    assert.match(routes, /cloze: false/u);
    assert.match(routes, /stories: false/u);
    assert.match(routes, /CONTEXT_KEYS/u);
    assert.doesNotMatch(routes, /password|refreshToken|accessToken|audioContent|noteText/u);
});
