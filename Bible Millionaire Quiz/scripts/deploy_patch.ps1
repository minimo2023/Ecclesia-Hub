$User = "weien"
$HostName = "Weien-WEBS"
$KeyPath = "$env:USERPROFILE\.ssh\id_ed25519"
$HubRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$RemotePath = "~/bible-quiz/Bible Millionaire Quiz/server"
$LocalPath = Join-Path $HubRoot "Bible Millionaire Quiz\server"

Write-Host "🚀 Starting Patch Deployment..." -ForegroundColor Cyan

# Define files to update
$Files = @(
    "index.js",
    "routes\expedition.js",
    "routes\game.js",
    "services\ExpeditionService.js",
    "database\index.js"
)

foreach ($File in $Files) {
    Write-Host "📂 Uploading $File..."
    # $RemoteFileDir = Split-Path "$RemotePath/$File" -Parent
    # Convert backslashes to forward slashes for remote path
    $RemoteFilePath = "$RemotePath/$File".Replace('\', '/')
    
    # Use scp to copy file
    scp -i $KeyPath "$LocalPath\$File" "$User@$HostName`:$RemoteFilePath"
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to upload $File" -ForegroundColor Red
        exit 1
    }
}

Write-Host "✅ All files uploaded." -ForegroundColor Green

# Restart containers
Write-Host "🔄 Restarting containers..." -ForegroundColor Cyan
ssh -i $KeyPath "$User@$HostName" "cd bible-quiz && rm -f 'Bible Millionaire Quiz/server/routes/expedition_v2.js' && docker compose build --no-cache bible-quiz && docker compose up -d"

Write-Host "🎉 Deployment Complete!" -ForegroundColor Green
