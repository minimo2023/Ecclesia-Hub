import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import { hubRoot } from '../utils/paths.js';

dotenv.config({ path: path.join(hubRoot, '.env') });
const databaseUser = process.env.DB_USER;
if (!databaseUser) throw new Error('DB_USER_REQUIRED');

function runDocker(args, { inputPath } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn('docker', args, {
            cwd: hubRoot,
            windowsHide: true,
            stdio: [inputPath ? 'pipe' : 'ignore', 'pipe', 'pipe']
        });
        const stdout = [];
        const stderr = [];
        child.stdout.on('data', chunk => stdout.push(chunk));
        child.stderr.on('data', chunk => stderr.push(chunk));
        if (inputPath) {
            child.stdin.on('error', () => {});
            fs.createReadStream(inputPath).pipe(child.stdin);
        }
        child.on('error', reject);
        child.on('close', code => {
            if (code !== 0) return reject(new Error(Buffer.concat(stderr).toString('utf8').trim() || `DOCKER_EXIT_${code}`));
            resolve(Buffer.concat(stdout).toString('utf8').trim());
        });
    });
}

async function sha256File(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

const latestPath = path.join(hubRoot, 'backups', 'manifests', 'last-success.json');
const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
const manifestPath = path.resolve(hubRoot, latest.manifest);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const dumpPath = path.resolve(hubRoot, manifest.databaseDump.relativePath);
if (!dumpPath.startsWith(`${path.resolve(hubRoot)}${path.sep}`)) throw new Error('UNSAFE_DUMP_PATH');
if (await sha256File(dumpPath) !== manifest.databaseDump.sha256) throw new Error('DUMP_SHA256_MISMATCH');

for (const asset of manifest.assets) {
    const assetPath = path.resolve(hubRoot, manifest.mediaRoot, ...String(asset.relativePath).split('/'));
    if (!assetPath.startsWith(`${path.resolve(hubRoot, manifest.mediaRoot)}${path.sep}`)) throw new Error('UNSAFE_MEDIA_PATH');
    const stat = fs.statSync(assetPath);
    if (stat.size !== Number(asset.byteSize) || await sha256File(assetPath) !== asset.sha256) {
        throw new Error(`MEDIA_INTEGRITY_MISMATCH:${asset.assetId}`);
    }
}

const tempDatabase = `ecclesia_restore_${Date.now()}`;
let created = false;
try {
    await runDocker(['compose', 'exec', '-T', 'postgres', 'createdb', '-U', databaseUser, '-T', 'template0', tempDatabase]);
    created = true;
    await runDocker([
        'compose', 'exec', '-T', 'postgres', 'pg_restore', '-U', databaseUser,
        '-d', tempDatabase, '--exit-on-error', '--no-owner', '--no-privileges'
    ], { inputPath: dumpPath });
    const assetCount = await runDocker([
        'compose', 'exec', '-T', 'postgres', 'psql', '-U', databaseUser, '-d', tempDatabase,
        '-At', '-v', 'ON_ERROR_STOP=1', '-c', "SELECT COUNT(*) FROM scripture_recording_assets WHERE state = 'READY';"
    ]);
    if (Number(assetCount) !== manifest.assets.length) throw new Error('RESTORED_ASSET_COUNT_MISMATCH');
    console.log(JSON.stringify({
        success: true,
        temporaryDatabase: tempDatabase,
        dump: latest.dump,
        manifest: latest.manifest,
        restoredAssetCount: Number(assetCount),
        productionDataChanged: false
    }, null, 2));
} finally {
    if (created) {
        await runDocker(['compose', 'exec', '-T', 'postgres', 'dropdb', '-U', databaseUser, '--if-exists', tempDatabase])
            .catch(error => console.error(`TEMP_DATABASE_CLEANUP_REQUIRED:${tempDatabase}:${error.message}`));
    }
}
