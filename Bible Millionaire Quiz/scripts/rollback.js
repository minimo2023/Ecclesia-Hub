import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

const CONFIG = {
    user: process.env.DEPLOY_USER || 'weien',
    host: process.env.DEPLOY_HOST || '192.168.68.109',
    remotePath: process.env.DEPLOY_REMOTE_PATH || 'bible-quiz',
    keyPath: process.env.DEPLOY_KEY_PATH || path.join(os.homedir(), '.ssh', 'id_ed25519')
};

function run(cmd, options = {}) {
    console.log(`\n🚀 Executing: ${cmd}`);
    try {
        return execSync(cmd, { stdio: 'pipe', encoding: 'utf-8', ...options });
    } catch (e) {
        console.error(`❌ Command failed: ${cmd}\n${e.stderr}`);
        process.exit(1);
    }
}

async function rollback() {
    console.log('🔄 [Rollback] System Startup...');

    // 1. Get the list of rollbacks
    console.log('📥 Fetching list of available rollbacks...');
    const listCmd = `ssh -i "${CONFIG.keyPath}" ${CONFIG.user}@${CONFIG.host} "cd ${CONFIG.remotePath}\\rollbacks && dir /b /o-d rollback_*.zip"`;
    
    let stdout;
    try {
        stdout = run(listCmd);
    } catch (e) {
        console.error('❌ Could not fetch rollbacks. Are you sure any backups exist?');
        process.exit(1);
    }

    const files = stdout.trim().split('\n').map(f => f.trim()).filter(f => f);
    if (files.length === 0) {
        console.error('❌ No rollback files found in remote rollbacks directory.');
        process.exit(1);
    }

    const latestRollback = files[0];
    console.log(`\n🎯 Found latest rollback: ${latestRollback}`);
    console.log(`⚠️ This will replace the current application layout with ${latestRollback}.`);

    // In a fully interactive script we might ask for confirmation.
    // We will proceed to rollback to this latest version automatically.
    
    const remoteCommands = `
$ErrorActionPreference = 'Stop'
$base = Join-Path $env:USERPROFILE '${CONFIG.remotePath}'
$rollback = Join-Path $base 'rollbacks\\${latestRollback}'
Set-Location $base
docker compose down
foreach ($path in @('Bible Millionaire Quiz', 'steward-ops', 'dist', 'server', 'mobile-app\\dist', 'XIT-Worker')) {
  $target = Join-Path $base $path
  if (Test-Path $target) { Remove-Item -Recurse -Force $target }
}
Expand-Archive -Path $rollback -DestinationPath $base -Force
docker compose build --no-cache bible-quiz
docker compose up -d
`.trim().replace(/\r?\n/g, '; ');

    console.log('\n🔄 Executing remote rollback and restarting container...');
    try {
        execSync(`ssh -i "${CONFIG.keyPath}" ${CONFIG.user}@${CONFIG.host} "powershell -ExecutionPolicy Bypass -Command \\"${remoteCommands}\\""`, { stdio: 'inherit' });
        console.log('\n🎉 [SUCCESS] Rollback completed successfully!');
    } catch (e) {
        console.error('🔥 Fatal rollback error:', e);
        process.exit(1);
    }
}

rollback().catch(err => {
    console.error('🔥 Fatal error:', err);
    process.exit(1);
});
