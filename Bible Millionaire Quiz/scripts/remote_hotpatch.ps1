$User = "weien"
$HostName = "192.168.68.40"
$KeyPath = "$env:USERPROFILE\.ssh\id_ed25519"
$RemoteRoot = "~/bible-quiz"

Write-Host "🚀 Starting Incremental Hot Patch..." -ForegroundColor Cyan

# 1. 先確保遠端 .env 是正式環境設定 (防止部署複寫)
Write-Host "🔑 Uploading production .env..." -ForegroundColor Yellow
scp -i $KeyPath .env.production "$User@$HostName`:$RemoteRoot/.env"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to upload .env.production" -ForegroundColor Red
    exit 1
}

# 2. Sync server code (Fast)
Write-Host "📂 Uploading server logic..." -ForegroundColor Yellow
scp -i $KeyPath -r ./server "$User@$HostName`:$RemoteRoot/"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to upload server code" -ForegroundColor Red
    exit 1
}

# 2. Sync built frontend (If needed, but optional for server-only patches)
# Write-Host "📂 Uploading frontend assets..." -ForegroundColor Yellow
# scp -i $KeyPath -r ./dist "$User@$HostName`:$RemoteRoot/"

# 3. Restart container to apply changes (NO BUILD)
Write-Host "🔄 Restarting Container bible-quiz..." -ForegroundColor Cyan
ssh -i $KeyPath "$User@$HostName" "docker restart bible-quiz"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to restart container" -ForegroundColor Red
    exit 1
}

Write-Host "🎉 Hot Patch Complete! (Took ~10-20 seconds)" -ForegroundColor Green
