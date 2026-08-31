import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { finished } from 'stream/promises';
import dotenv from 'dotenv';
import { hubRoot, privateMediaRoot } from '../utils/paths.js';

dotenv.config({ path: path.join(hubRoot, '.env') });

const backupRoot = path.join(hubRoot, 'backups');
const dailyRoot = path.join(backupRoot, 'postgres', 'daily');
const weeklyRoot = path.join(backupRoot, 'postgres', 'weekly');
const manifestDailyRoot = path.join(backupRoot, 'manifests', 'daily');
const manifestWeeklyRoot = path.join(backupRoot, 'manifests', 'weekly');
const latestSuccessPath = path.join(backupRoot, 'manifests', 'last-success.json');
const recordingsRoot = path.join(privateMediaRoot, 'scripture-recordings');

const databaseUser = process.env.DB_USER;
const databaseName = process.env.DB_NAME;
if (!databaseUser || !databaseName) throw new Error('DB_USER_AND_DB_NAME_REQUIRED');

for (const target of [dailyRoot, weeklyRoot, manifestDailyRoot, manifestWeeklyRoot]) {
    fs.mkdirSync(target, { recursive: true });
}

function compactTaipeiTimestamp(date = new Date()) {
    const parts = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
    return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}${parts.minute}${parts.second}`;
}

function taipeiParts(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
    }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
}

function safeInside(root, target) {
    const resolvedRoot = `${path.resolve(root)}${path.sep}`;
    const resolvedTarget = path.resolve(target);
    if (!resolvedTarget.startsWith(resolvedRoot)) throw new Error(`UNSAFE_BACKUP_PATH:${resolvedTarget}`);
    return resolvedTarget;
}

function runDocker(args, { inputPath, outputPath } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn('docker', args, {
            cwd: hubRoot,
            windowsHide: true,
            stdio: [inputPath ? 'pipe' : 'ignore', 'pipe', 'pipe']
        });
        const errors = [];
        child.stderr.on('data', chunk => errors.push(chunk));
        const input = inputPath ? fs.createReadStream(inputPath) : null;
        const output = outputPath ? fs.createWriteStream(outputPath, { flags: 'wx' }) : null;
        if (input) {
            child.stdin.on('error', () => {});
            input.on('error', reject);
            input.pipe(child.stdin);
        }
        if (output) child.stdout.pipe(output);
        const chunks = [];
        if (!output) child.stdout.on('data', chunk => chunks.push(chunk));
        child.on('error', reject);
        child.on('close', async code => {
            try {
                if (output) await finished(output);
                if (code !== 0) return reject(new Error(Buffer.concat(errors).toString('utf8').trim() || `DOCKER_EXIT_${code}`));
                resolve(Buffer.concat(chunks).toString('utf8'));
            } catch (error) {
                reject(error);
            }
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

async function readReadyAssets() {
    const sql = `
        SELECT COALESCE(json_agg(row_to_json(asset_manifest)), '[]'::json)
        FROM (
            SELECT a.id AS "assetId", a.recording_id AS "recordingId",
                   a.storage_key AS "relativePath", a.byte_size AS "byteSize",
                   a.sha256, a.mime_type AS "mimeType", a.duration_ms AS "durationMs"
            FROM scripture_recording_assets a
            JOIN scripture_recordings r ON r.id = a.recording_id
            WHERE a.state = 'READY' AND r.status <> 'DELETED'
            ORDER BY a.id
        ) asset_manifest;
    `;
    const text = await runDocker([
        'compose', 'exec', '-T', 'postgres', 'psql', '-U', databaseUser, '-d', databaseName,
        '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql
    ]);
    return JSON.parse(text.trim() || '[]');
}

async function buildAssetManifest() {
    const records = await readReadyAssets();
    const assets = [];
    const errors = [];
    for (const record of records) {
        const absolutePath = safeInside(recordingsRoot, path.join(recordingsRoot, ...String(record.relativePath).split('/')));
        const stat = await fs.promises.stat(absolutePath).catch(() => null);
        if (!stat?.isFile()) {
            errors.push({ assetId: record.assetId, error: 'FILE_MISSING', relativePath: record.relativePath });
            continue;
        }
        const actualSha256 = await sha256File(absolutePath);
        if (stat.size !== Number(record.byteSize) || actualSha256 !== record.sha256) {
            errors.push({ assetId: record.assetId, error: 'FILE_INTEGRITY_MISMATCH', relativePath: record.relativePath });
        }
        assets.push({ ...record, actualByteSize: stat.size, actualSha256 });
    }
    return { assets, errors };
}

function prune(directory, extension, keep) {
    const files = fs.readdirSync(directory)
        .filter(name => name.endsWith(extension))
        .sort().reverse();
    for (const name of files.slice(keep)) {
        fs.rmSync(safeInside(directory, path.join(directory, name)), { force: true });
    }
}

const stamp = compactTaipeiTimestamp();
const dumpPath = path.join(dailyRoot, `ecclesia_${stamp}.dump`);
const partialDumpPath = `${dumpPath}.partial`;
const manifestPath = path.join(manifestDailyRoot, `ecclesia_${stamp}.json`);

try {
    await runDocker([
        'compose', 'exec', '-T', 'postgres', 'pg_dump', '-U', databaseUser, '-d', databaseName,
        '--format=custom', '--no-owner', '--no-privileges'
    ], { outputPath: partialDumpPath });
    await runDocker([
        'compose', 'exec', '-T', 'postgres', 'pg_restore', '-l'
    ], { inputPath: partialDumpPath });
    fs.renameSync(partialDumpPath, dumpPath);

    const assetManifest = await buildAssetManifest();
    const manifest = {
        schemaVersion: 'scripture-recording-backup-v1',
        createdAt: new Date().toISOString(),
        timeZone: 'Asia/Taipei',
        databaseDump: {
            relativePath: path.relative(hubRoot, dumpPath).replaceAll('\\', '/'),
            byteSize: fs.statSync(dumpPath).size,
            sha256: await sha256File(dumpPath),
            pgRestoreListVerified: true
        },
        mediaRoot: path.relative(hubRoot, recordingsRoot).replaceAll('\\', '/'),
        assets: assetManifest.assets,
        errors: assetManifest.errors
    };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    if (manifest.errors.length) throw new Error(`MEDIA_MANIFEST_FAILED:${manifest.errors.length}`);

    const day = taipeiParts();
    if (day.weekday === 'Sun') {
        fs.copyFileSync(dumpPath, path.join(weeklyRoot, path.basename(dumpPath)));
        fs.copyFileSync(manifestPath, path.join(manifestWeeklyRoot, path.basename(manifestPath)));
    }
    fs.writeFileSync(latestSuccessPath, `${JSON.stringify({
        success: true,
        completedAt: new Date().toISOString(),
        dump: path.relative(hubRoot, dumpPath).replaceAll('\\', '/'),
        manifest: path.relative(hubRoot, manifestPath).replaceAll('\\', '/'),
        assetCount: manifest.assets.length
    }, null, 2)}\n`, 'utf8');

    prune(dailyRoot, '.dump', 7);
    prune(manifestDailyRoot, '.json', 7);
    prune(weeklyRoot, '.dump', 4);
    prune(manifestWeeklyRoot, '.json', 4);
    console.log(JSON.stringify({ success: true, dumpPath, manifestPath, assetCount: manifest.assets.length }, null, 2));
} catch (error) {
    if (fs.existsSync(partialDumpPath)) fs.rmSync(partialDumpPath, { force: true });
    if (fs.existsSync(dumpPath)) fs.rmSync(dumpPath, { force: true });
    console.error(JSON.stringify({ success: false, error: error.message, dumpPath, manifestPath }, null, 2));
    process.exitCode = 1;
}
