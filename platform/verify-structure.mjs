import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
    'platform/ecclesia-hub.marker',
    'Bible Millionaire Quiz/index.html',
    'Bible Millionaire Quiz/vite.config.js',
    'Bible Millionaire Quiz/src/main.jsx',
    'Bible Millionaire Quiz/server/index.js',
    'Bible Millionaire Quiz/server/package.json',
    'Bible Millionaire Quiz/server/public/index.html',
    'Bible Millionaire Quiz/dist/index.html',
    'Bible Millionaire Quiz/mobile-app/package.json',
    'Bible Millionaire Quiz/mobile-app/index.html',
    'Bible Millionaire Quiz/mobile-app/vite.config.js',
    'Bible Millionaire Quiz/mobile-app/src/main.jsx',
    'Bible Millionaire Quiz/mobile-app/dist/index.html',
    'Bible Millionaire Quiz/scripture-tools-app/package.json',
    'Bible Millionaire Quiz/scripture-tools-app/index.html',
    'Bible Millionaire Quiz/scripture-tools-app/src.jsx',
    'Bible Millionaire Quiz/server/domains/scripture-tools/routes.js',
    'steward-ops/XIT-Worker/backend/standalone-server.mjs',
    'steward-ops/XIT-Worker/schedule.db',
    'docker-compose.yml', 'docker-compose.dev-db.yml', 'Dockerfile', 'Dockerfile.nginx', 'nginx.conf'
];

const missing = required.filter(relative => !fs.existsSync(path.join(root, relative)));
if (missing.length) throw new Error(`Workspace structure is incomplete:\n${missing.join('\n')}`);

const marker = fs.readFileSync(path.join(root, 'platform/ecclesia-hub.marker'), 'utf8').trim();
if (marker !== 'Ecclesia-Hub workspace marker.') throw new Error('Workspace marker is invalid');

const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
if (!/external:\s*true/.test(compose) || !/biblemillionairequiz_postgres_data/.test(compose)) {
    throw new Error('Production compose must pin the external PostgreSQL volume');
}
console.log('Workspace structure verified.');
