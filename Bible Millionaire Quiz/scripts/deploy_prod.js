import { execSync } from 'child_process';
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const biblicalRoot = path.resolve(scriptRoot, '..');
const hubRoot = path.resolve(biblicalRoot, '..');
const xitWorkerRoot = path.join(hubRoot, 'steward-ops', 'XIT-Worker');
const productionBaselinePath = path.join(hubRoot, 'platform', 'production-baseline.json');

process.chdir(hubRoot);

const CONFIG = {
    user: process.env.DEPLOY_USER || 'weien',
    host: process.env.DEPLOY_HOST || '192.168.68.109',
    remotePath: process.env.DEPLOY_REMOTE_PATH || 'bible-quiz',
    keyPath: process.env.DEPLOY_KEY_PATH || path.join(os.homedir(), '.ssh', 'id_ed25519'),
    zipName: 'deploy_surgical.zip',
    checksumName: 'deploy_surgical.zip.sha256',
    expectedDbVolume: 'biblemillionairequiz_postgres_data',
    deployScript: 'deploy_remote_run.ps1'  // 臨時生成的遠端執行腳本
};

function quotePath(value) {
    return `"${String(value).replace(/"/g, '\\"')}"`;
}

function assertCommand(command, help) {
    try {
        execSync(command, { stdio: 'ignore' });
    } catch {
        throw new Error(`${help}\nFailed check: ${command}`);
    }
}

function verifyDeployPrerequisites() {
    console.log('== [Preflight] Checking deploy prerequisites ==');
    assertCommand('npm --version', 'Node.js/npm is required before deployment.');
    assertCommand('ssh -V', 'OpenSSH client is required before deployment.');
    assertCommand('where scp', 'scp is required before deployment.');

    if (!fs.existsSync(CONFIG.keyPath)) {
        throw new Error([
            `SSH deploy key not found: ${CONFIG.keyPath}`,
            `Create or restore the key, then authorize its .pub file on ${CONFIG.user}@${CONFIG.host}.`,
            'No package version was changed.'
        ].join('\n'));
    }

    const sshTarget = `${CONFIG.user}@${CONFIG.host}`;
    const sshCheck = [
        'ssh',
        '-i', quotePath(CONFIG.keyPath),
        '-o BatchMode=yes',
        '-o ConnectTimeout=8',
        '-o StrictHostKeyChecking=accept-new',
        sshTarget,
        '"hostname"'
    ].join(' ');
    assertCommand(
        sshCheck,
        `Cannot access ${sshTarget} with the configured deploy key.`
    );
    console.log('== [Preflight] OK ==');
}

function loadProductionBaseline() {
    if (!fs.existsSync(productionBaselinePath)) {
        throw new Error(`Production baseline is missing: ${productionBaselinePath}`);
    }

    return JSON.parse(fs.readFileSync(productionBaselinePath, 'utf8'));
}

function requireProductionReleaseApproval() {
    const baseline = loadProductionBaseline();
    const requiredApproval = baseline?.policy?.requiredDeploymentApproval;

    if (!requiredApproval) {
        throw new Error('Production baseline does not define a deployment approval token.');
    }

    if (process.env.PRODUCTION_RELEASE_APPROVAL !== requiredApproval) {
        throw new Error([
            'Production deployment is locked because production is the canonical version.',
            'First compare the candidate against the approved desktop/mobile snapshots.',
            `After explicit approval, set PRODUCTION_RELEASE_APPROVAL=${requiredApproval} for this deployment only.`,
            'No package version was changed and nothing was sent to production.'
        ].join('\n'));
    }
}

/**
 * Run shell command and log it
 */
function run(cmd, options = {}) {
    console.log(`\n🚀 Executing: ${cmd}`);
    try {
        return execSync(cmd, { stdio: 'inherit', ...options });
    } catch (e) {
        console.error(`❌ Command failed: ${cmd}`);
        process.exit(1);
    }
}

function buildAndVerifyDevelopableCandidate() {
    console.log('🏗️ Building the production-equivalent source candidate...');
    run('npm run lint:bible');
    run('npm run lint:mobile');
    run('npm run test:bible');
    run('npm run build:all');
    run('npm run verify:developable-baseline');
    run('node --check "Bible Millionaire Quiz/server/index.js"');
}

/**
 * Create a surgical zip package
 */
async function createSurgicalZip() {
    console.log('📦 Creating surgical package...');
    const zipPath = path.join(hubRoot, CONFIG.zipName);
    const checksumPath = path.join(hubRoot, CONFIG.checksumName);
    fs.rmSync(zipPath, { force: true });
    fs.rmSync(checksumPath, { force: true });

    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
        output.on('error', reject);
        output.on('close', () => {
            console.log(`✅ Zip created: ${archive.pointer()} total bytes`);
            const checksum = crypto
                .createHash('sha256')
                .update(fs.readFileSync(zipPath))
                .digest('hex');
            fs.writeFileSync(
                checksumPath,
                `${checksum}\n`,
                'utf8'
            );
            console.log(`✅ SHA-256 created: ${checksum}`);
            resolve();
        });
        archive.on('error', (err) => reject(err));

        archive.pipe(output);

        // Add core folders
        archive.directory(
            path.join(biblicalRoot, 'dist'),
            'Bible Millionaire Quiz/dist'
        );
        archive.directory(
            path.join(biblicalRoot, 'mobile-app', 'dist'),
            'Bible Millionaire Quiz/mobile-app/dist'
        );
        archive.directory(
            path.join(biblicalRoot, 'scripture-tools-app', 'dist'),
            'Bible Millionaire Quiz/scripture-tools-app/dist'
        );
        archive.directory(
            path.join(biblicalRoot, 'scripts'),
            'Bible Millionaire Quiz/scripts'
        );
        archive.directory(
            path.join(biblicalRoot, 'shared'),
            'Bible Millionaire Quiz/shared'
        );
        archive.directory(
            path.join(biblicalRoot, 'src', 'data'),
            'Bible Millionaire Quiz/src/data'
        );
        // [DATA GUARD] 排除 schedule.db 與 schedule-data.json：這些是生產資料，不是程式碼
        // 遠端腳本會在部署時自動備份並還原，確保排班資料不被覆蓋
        archive.glob('**/*', {
            cwd: xitWorkerRoot,
            ignore: [
                'schedule.db',
                'schedule.db-wal',
                'schedule.db-shm',
                'schedule-data.json',
                '.env',
                '.git/**',
                'node_modules/**',
                '**/*.log',
                '**/*.err.log'
            ]
        }, { prefix: 'steward-ops/XIT-Worker' });
        
        // Add server folder EXCLUDING static_assets
        archive.glob('**/*', {
            cwd: path.join(biblicalRoot, 'server'),
            ignore: ['static_assets/**', 'node_modules/**', 'CRASH_LOG.txt']
        }, { prefix: 'Bible Millionaire Quiz/server' });

        // Add root files
        archive.file(path.join(hubRoot, 'package.json'), { name: 'package.json' });
        archive.file(path.join(hubRoot, 'package-lock.json'), { name: 'package-lock.json' });
        archive.file(path.join(hubRoot, 'Dockerfile'), { name: 'Dockerfile' });
        archive.file(path.join(hubRoot, 'Dockerfile.nginx'), { name: 'Dockerfile.nginx' });
        archive.file(path.join(hubRoot, 'docker-compose.yml'), { name: 'docker-compose.yml' });
        archive.file(path.join(hubRoot, 'nginx.conf'), { name: 'nginx.conf' });
        archive.file(path.join(hubRoot, '.dockerignore'), { name: '.dockerignore' });
        // Production secrets stay on the deployment host.  The remote script
        // reuses its existing .env.production when it refreshes .env, so the
        // archive must never carry a copy of it.
        archive.file(
            path.join(hubRoot, 'platform', 'ecclesia-hub.marker'),
            { name: 'platform/ecclesia-hub.marker' }
        );

        archive.finalize();
    });
}

/**
 * 動態產生遠端部署的 PowerShell 腳本
 * 避免透過 SSH 嵌套引號的路徑問題
 */
function generateRemoteScript(timestamp) {
    return `# [Remote Deploy Script] Auto-generated by deploy_prod.js - ${timestamp}
\$ErrorActionPreference = 'Stop'
\$base        = Join-Path \$env:USERPROFILE '${CONFIG.remotePath}'
\$zip         = Join-Path \$base '${CONFIG.zipName}'
\$checksumFile = Join-Path \$base '${CONFIG.checksumName}'
\$rollbackDir = Join-Path \$base 'rollbacks'
\$expectedDbVolume = '${CONFIG.expectedDbVolume}'

Write-Host '=== [Deploy] Starting remote extraction ===' -ForegroundColor Cyan
Write-Host "Base path: \$base"
Write-Host "Zip exists: \$(Test-Path \$zip)"

if (-not (Test-Path \$zip)) { throw "deploy zip not found: \$zip" }
if (-not (Test-Path \$checksumFile)) { throw "deploy checksum not found: \$checksumFile" }
\$expectedChecksum = (Get-Content \$checksumFile -Raw).Trim().ToLowerInvariant()
\$actualChecksum = (Get-FileHash -Algorithm SHA256 \$zip).Hash.ToLowerInvariant()
if (\$expectedChecksum -ne \$actualChecksum) {
    throw "deploy package checksum mismatch: expected=\$expectedChecksum actual=\$actualChecksum"
}
Write-Host "Package SHA-256 verified: \$actualChecksum"

# Refuse to deploy if production is not attached to the pinned PostgreSQL
# volume. A Compose project rename must never select a fresh empty database.
\$currentDbInspect = ((& docker inspect bible-quiz-db) -join [Environment]::NewLine) | ConvertFrom-Json
if (\$LASTEXITCODE -ne 0) { throw 'Cannot inspect the production PostgreSQL container' }
\$currentDbVolume = [string]((\$currentDbInspect[0].Mounts | Where-Object { \$_.Destination -eq '/var/lib/postgresql/data' } | Select-Object -First 1).Name)
if (\$currentDbVolume -ne \$expectedDbVolume) {
    throw "Database volume mismatch before deploy: expected=\$expectedDbVolume actual=\$currentDbVolume"
}
& docker volume inspect \$expectedDbVolume | Out-Null
if (\$LASTEXITCODE -ne 0) { throw "Required external database volume is missing: \$expectedDbVolume" }

\$preDeployUserCount = (& docker exec bible-quiz-db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB" -Atc "SELECT COUNT(*) FROM users;"' 2>\$null)
if (\$null -eq \$preDeployUserCount -or '' -eq \$preDeployUserCount) { \$preDeployUserCount = "0" }
if (\$preDeployUserCount -is [string]) { \$preDeployUserCount = \$preDeployUserCount.Trim() } else { \$preDeployUserCount = [string]\$preDeployUserCount }
if (\$LASTEXITCODE -ne 0 -or \$preDeployUserCount -notmatch '^\\d+$') {
    throw 'Cannot read the production users count before deploy'
}
Write-Host "Database guard: volume=\$currentDbVolume users=\$preDeployUserCount"

# Ensure rollbacks directory
if (-not (Test-Path \$rollbackDir)) {
    New-Item -ItemType Directory -Path \$rollbackDir | Out-Null
    Write-Host 'Created rollbacks directory'
}

# Database backup before replacing app files. Use the Postgres container's own
# environment so the script works when DB_USER/DB_NAME differ between machines.
\$backupDir = Join-Path \$base 'backups'
if (-not (Test-Path \$backupDir)) {
    New-Item -ItemType Directory -Path \$backupDir | Out-Null
    Write-Host 'Created backups directory'
}
\$dbBackup = Join-Path \$backupDir 'db_backup_${timestamp}.dump'
\$verifyDbName = 'v42_restore_verify_${timestamp.replace(/-/g, '_')}'
Write-Host "Creating database backup: \$dbBackup"
& docker exec bible-quiz-db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB" -f /tmp/bible_quiz_backup.dump'
if (\$LASTEXITCODE -ne 0) { throw 'Database backup inside container failed' }
& docker exec bible-quiz-db pg_restore --list /tmp/bible_quiz_backup.dump | Out-Null
if (\$LASTEXITCODE -ne 0) { throw 'Database backup catalog verification failed' }
& docker cp bible-quiz-db:/tmp/bible_quiz_backup.dump \$dbBackup
if (\$LASTEXITCODE -ne 0) { throw 'Database backup copy failed' }
if ((Get-Item \$dbBackup).Length -le 0) { throw 'Database backup is empty' }

# Prove that this backup can be restored before touching the application.
& docker exec bible-quiz-db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$1"' -- \$verifyDbName
if (\$LASTEXITCODE -ne 0) { throw 'Cannot clear the temporary restore-verification database' }
& docker exec bible-quiz-db sh -c 'createdb -U "$POSTGRES_USER" "$1"' -- \$verifyDbName
if (\$LASTEXITCODE -ne 0) { throw 'Cannot create the temporary restore-verification database' }
try {
    & docker exec bible-quiz-db sh -c 'pg_restore --exit-on-error -U "$POSTGRES_USER" -d "$1" /tmp/bible_quiz_backup.dump' -- \$verifyDbName
    if (\$LASTEXITCODE -ne 0) { throw 'Database restore verification failed' }
} finally {
    & docker exec bible-quiz-db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$1"' -- \$verifyDbName | Out-Null
    & docker exec bible-quiz-db rm -f /tmp/bible_quiz_backup.dump | Out-Null
}
Write-Host 'Database backup created and restore verified with pg_restore --exit-on-error'

# Stop container before backup to release file locks
Write-Host 'Stopping container before backup to release file locks...'
Set-Location \$base
& docker compose stop

# Rollback backup (zip 格式，Windows 原生支援)
\$biblicalPath = Join-Path \$base 'Bible Millionaire Quiz'
\$stewardOpsPath = Join-Path \$base 'steward-ops'
\$xitWorkerPath = Join-Path \$stewardOpsPath 'XIT-Worker'
\$legacyDistPath = Join-Path \$base 'dist'
\$legacyMobileDistPath = Join-Path \$base 'mobile-app/dist'
\$legacyServerPath = Join-Path \$base 'server'
\$legacyXitWorkerPath = Join-Path \$base 'XIT-Worker'
\$rollbackZip = Join-Path \$rollbackDir 'rollback_${timestamp}.zip'

\$toArchive = @(
    \$biblicalPath,
    \$stewardOpsPath,
    \$legacyDistPath,
    \$legacyMobileDistPath,
    \$legacyServerPath,
    \$legacyXitWorkerPath
) | Where-Object { Test-Path \$_ }
if (\$toArchive.Count -gt 0) {
    Compress-Archive -Path \$toArchive -DestinationPath \$rollbackZip -Force
    Write-Host "Rollback backup created: \$rollbackZip"
}

# [DATA GUARD] 先備份生產環境的排班資料庫，兼容新舊目錄
\$activeXitWorkerPath = if (Test-Path \$xitWorkerPath) {
    \$xitWorkerPath
} elseif (Test-Path \$legacyXitWorkerPath) {
    \$legacyXitWorkerPath
} else {
    \$null
}
if (\$activeXitWorkerPath) {
    \$scheduleDb = Join-Path \$activeXitWorkerPath 'schedule.db'
    \$scheduleJson = Join-Path \$activeXitWorkerPath 'schedule-data.json'
    \$tempDb   = Join-Path \$base 'schedule.db.bak'
    \$tempJson = Join-Path \$base 'schedule-data.json.bak'
    if (Test-Path \$scheduleDb)   { Copy-Item \$scheduleDb   \$tempDb   -Force; Write-Host '[DATA GUARD] Backed up schedule.db' }
    if (Test-Path \$scheduleJson) { Copy-Item \$scheduleJson \$tempJson -Force; Write-Host '[DATA GUARD] Backed up schedule-data.json' }
}

# Remove both the new candidate layout and the legacy application layout.
foreach (\$applicationPath in @(
    \$biblicalPath,
    \$stewardOpsPath,
    \$legacyDistPath,
    \$legacyMobileDistPath,
    \$legacyServerPath,
    \$legacyXitWorkerPath
)) {
    if (Test-Path \$applicationPath) {
        Remove-Item -Recurse -Force \$applicationPath
        Write-Host "Removed old application path: \$applicationPath"
    }
}

# Extract new files
Write-Host 'Extracting...'
Expand-Archive -Path \$zip -DestinationPath \$base -Force
Write-Host 'Extracted OK'

# [DATA GUARD] 還原排班資料庫
\$stewardOpsPath = Join-Path \$base 'steward-ops'
\$xitWorkerPath = Join-Path \$stewardOpsPath 'XIT-Worker'
\$scheduleDb = Join-Path \$xitWorkerPath 'schedule.db'
\$scheduleJson = Join-Path \$xitWorkerPath 'schedule-data.json'
if (Test-Path \$tempDb) {
    Copy-Item \$tempDb   \$scheduleDb   -Force
    Remove-Item \$tempDb -Force
    Write-Host '[DATA GUARD] Restored schedule.db'
}
if (Test-Path \$tempJson) {
    Copy-Item \$tempJson \$scheduleJson -Force
    Remove-Item \$tempJson -Force
    Write-Host '[DATA GUARD] Restored schedule-data.json'
}

# Ensure uploads directory
\$uploadsPath = Join-Path \$base 'uploads'
if (-not (Test-Path \$uploadsPath)) {
    New-Item -ItemType Directory -Path \$uploadsPath | Out-Null
    Write-Host 'Created uploads directory'
}

# Copy production env
\$envProd = Join-Path \$base '.env.production'
\$envFile = Join-Path \$base '.env'
if (Test-Path \$envProd) { Copy-Item \$envProd \$envFile -Force; Write-Host 'Env file updated' }

# Validate the extracted Compose file before stopping the current stack.
Set-Location \$base
\$composeJson = ((& docker compose config --format json) -join [Environment]::NewLine)
if (\$LASTEXITCODE -ne 0) { throw 'docker compose config validation failed' }
\$composeConfig = \$composeJson | ConvertFrom-Json
\$configuredDbVolume = [string]\$composeConfig.volumes.postgres_data.name
\$configuredDbExternal = [bool]\$composeConfig.volumes.postgres_data.external
if (\$configuredDbVolume -ne \$expectedDbVolume -or -not \$configuredDbExternal) {
    throw "Unsafe Compose database volume config: name=\$configuredDbVolume external=\$configuredDbExternal"
}

# Docker rebuild and restart
Write-Host '=== [Deploy] Building Docker image ===' -ForegroundColor Cyan
Set-Location \$base
& docker compose build --no-cache bible-quiz
if (\$LASTEXITCODE -ne 0) {
    & docker compose up -d --no-build
    if (\$LASTEXITCODE -ne 0) {
        throw 'Docker image build failed and the previous locally available image could not be restarted'
    }
    throw 'Docker image build failed; the previous locally available image was restarted'
}
& docker compose down
if (\$LASTEXITCODE -ne 0) { throw 'Could not stop the existing production stack cleanly' }
& docker compose up -d
if (\$LASTEXITCODE -ne 0) {
    & docker compose up -d --no-build
    throw 'Production stack startup failed; attempted to restore the last locally available image'
}

\$dbReady = \$false
for (\$attempt = 0; \$attempt -lt 30; \$attempt++) {
    & docker exec bible-quiz-db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | Out-Null
    if (\$LASTEXITCODE -eq 0) { \$dbReady = \$true; break }
    Start-Sleep -Seconds 2
}
if (-not \$dbReady) {
    & docker compose stop
    throw 'PostgreSQL did not become ready after deploy; stack stopped for safety'
}

\$postDeployDbInspect = ((& docker inspect bible-quiz-db) -join [Environment]::NewLine) | ConvertFrom-Json
\$postDeployDbVolume = [string]((\$postDeployDbInspect[0].Mounts | Where-Object { \$_.Destination -eq '/var/lib/postgresql/data' } | Select-Object -First 1).Name)
\$postDeployUserCount = (& docker exec bible-quiz-db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB" -Atc "SELECT COUNT(*) FROM users;"' 2>\$null)
if (\$null -eq \$postDeployUserCount -or '' -eq \$postDeployUserCount) { \$postDeployUserCount = "0" }
if (\$postDeployUserCount -is [string]) { \$postDeployUserCount = \$postDeployUserCount.Trim() } else { \$postDeployUserCount = [string]\$postDeployUserCount }
if (\$postDeployDbVolume -ne \$expectedDbVolume -or \$postDeployUserCount -ne \$preDeployUserCount) {
    & docker compose stop
    throw "Database guard failed after deploy: volume=\$postDeployDbVolume users=\$postDeployUserCount expectedVolume=\$expectedDbVolume expectedUsers=\$preDeployUserCount. Stack stopped for safety."
}
Write-Host "Database guard passed: volume=\$postDeployDbVolume users=\$postDeployUserCount"
Write-Host '=== [Deploy] Done ===' -ForegroundColor Green
`.trim();
}

async function start() {
    run('npm run verify:production-baseline');
    requireProductionReleaseApproval();
    verifyDeployPrerequisites();
    console.log('🛡️ [Surgical Deploy] System Startup...');

    // Keep the package version stable unless a reconciled release explicitly
    // opts into a version bump.
    if (process.env.DEPLOY_BUMP_VERSION === 'true') {
        console.log('📈 Bumping patch version...');
        run('npm version patch --no-git-tag-version');
    } else {
        console.log('📈 Keeping the canonical production package version.');
    }

    // 1. Timestamp shared by remote DB backup and rollback package.
    console.log('📥 Triggering remote database backup...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    // 2. Rebuild from the active, maintainable source. The canonical runtime
    // remains untouched until the candidate has passed all checks.
    buildAndVerifyDevelopableCandidate();
    run('npm run verify:production-baseline');
    if (process.env.DEPLOY_SKIP_AUDIT !== 'true') {
        run('npm audit --omit=dev --audit-level=high');
    }

    // 3. Packaging
    await createSurgicalZip();

    // 4. Transfer zip
    console.log('📤 Transferring package...');
    run(`scp -i "${CONFIG.keyPath}" ${CONFIG.zipName} ${CONFIG.user}@${CONFIG.host}:${CONFIG.remotePath}/`);
    run(`scp -i "${CONFIG.keyPath}" ${CONFIG.checksumName} ${CONFIG.user}@${CONFIG.host}:${CONFIG.remotePath}/`);

    // 5. Generate PowerShell deploy script locally and SCP it
    console.log('📝 Generating remote deploy script...');
    const psContent = generateRemoteScript(timestamp);
    fs.writeFileSync(CONFIG.deployScript, psContent, 'utf8');
    run(`scp -i "${CONFIG.keyPath}" ${CONFIG.deployScript} ${CONFIG.user}@${CONFIG.host}:${CONFIG.remotePath}/`);

    // 6. Execute the PS1 script on remote (no quoting hell)
    console.log('🔄 Running remote extraction and container restart...');
    const remoteScriptPath = `C:\\Users\\${CONFIG.user}\\${CONFIG.remotePath}\\${CONFIG.deployScript}`;
    run(`ssh -i "${CONFIG.keyPath}" ${CONFIG.user}@${CONFIG.host} "powershell -ExecutionPolicy Bypass -File ${remoteScriptPath}"`);

    // 7. Remote cleanup
    console.log('🧹 Cleaning up remote temp files...');
    run(`ssh -i "${CONFIG.keyPath}" ${CONFIG.user}@${CONFIG.host} "del ${CONFIG.remotePath}\\${CONFIG.deployScript} 2>nul & del ${CONFIG.remotePath}\\${CONFIG.zipName} 2>nul & del ${CONFIG.remotePath}\\${CONFIG.checksumName} 2>nul"`);

    // 8. Local cleanup
    console.log('🧹 Cleaning up local temp files...');
    if (fs.existsSync(CONFIG.zipName))     fs.unlinkSync(CONFIG.zipName);
    if (fs.existsSync(CONFIG.checksumName)) fs.unlinkSync(CONFIG.checksumName);
    if (fs.existsSync(CONFIG.deployScript)) fs.unlinkSync(CONFIG.deployScript);

    console.log('\n🎉 [SUCCESS] Deployment completed in surgical mode!');
}

async function packageOnly() {
    console.log('📦 [Package Only] Building and verifying the developable deploy candidate...');
    run('npm run verify:production-baseline');
    buildAndVerifyDevelopableCandidate();
    run('npm run verify:production-baseline');
    await createSurgicalZip();
    console.log(`✅ Candidate package ready: ${path.join(hubRoot, CONFIG.zipName)}`);
}

const command = process.argv[2];
const task = command === '--package-only'
    ? packageOnly()
    : command === '--print-remote-script'
        ? Promise.resolve(process.stdout.write(generateRemoteScript('verification-timestamp')))
        : start();

task.catch(err => {
    console.error('🔥 Fatal deployment error:', err);
    process.exit(1);
});
