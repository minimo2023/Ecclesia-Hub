import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dockerfile = readFileSync(new URL('../../../Dockerfile', import.meta.url), 'utf8');
const dockerignore = readFileSync(new URL('../../../.dockerignore', import.meta.url), 'utf8');
const serverIndex = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const deployScript = readFileSync(new URL('../../scripts/deploy_prod.js', import.meta.url), 'utf8');

test('production image includes the approved snapshots and preserved build artifacts', () => {
    assert.match(
        dockerfile,
        /COPY \["Bible Millionaire Quiz\/server", "\.\/Bible Millionaire Quiz\/server"\]/
    );
    assert.match(
        dockerfile,
        /COPY \["Bible Millionaire Quiz\/shared", "\.\/Bible Millionaire Quiz\/shared"\]/
    );
    assert.match(
        dockerfile,
        /COPY \["Bible Millionaire Quiz\/dist", "\.\/Bible Millionaire Quiz\/dist"\]/
    );
    assert.match(
        dockerfile,
        /COPY \["Bible Millionaire Quiz\/mobile-app\/dist", "\.\/Bible Millionaire Quiz\/mobile-app\/dist"\]/
    );
    assert.match(
        dockerfile,
        /COPY \["Bible Millionaire Quiz\/scripture-tools-app\/dist", "\.\/Bible Millionaire Quiz\/scripture-tools-app\/dist"\]/
    );
    assert.match(
        deployScript,
        /path\.join\(biblicalRoot, 'scripture-tools-app', 'dist'\)/
    );
    assert.match(deployScript, /path\.join\(biblicalRoot, 'shared'\)/);
    assert.match(dockerignore, /!Bible Millionaire Quiz\/dist\/\*\*/);
    assert.match(dockerignore, /!Bible Millionaire Quiz\/mobile-app\/dist\/\*\*/);
});

test('server prefers verified builds and keeps production snapshots as fallback', () => {
    assert.match(serverIndex, /const builtPublicPath = path\.join\(__dirname, '\.\.\/dist'\)/);
    assert.match(serverIndex, /const snapshotPublicPath = path\.join\(__dirname, 'public'\)/);
    assert.match(serverIndex, /fs\.existsSync\(path\.join\(builtPublicPath, 'index\.html'\)\)/);
    assert.match(serverIndex, /app\.use\(express\.static\(publicPath\)\)/);
    assert.match(serverIndex, /const builtMobilePublicPath = path\.join\(__dirname, '\.\.\/mobile-app\/dist'\)/);
    assert.match(serverIndex, /const snapshotMobilePublicPath = path\.join\(__dirname, 'public-mobile'\)/);
    assert.match(serverIndex, /fs\.existsSync\(path\.join\(builtMobilePublicPath, 'index\.html'\)\)/);
});
