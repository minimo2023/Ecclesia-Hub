$ErrorActionPreference = "Continue"

Write-Host "🔍 Checking for existing bible-quiz container..."
# Use -q to get only IDs, avoiding format string issues in PowerShell
$ids = docker ps -a -q --filter "name=bible-quiz"

if ($ids) {
    Write-Host "⚠️ Found existing containers: $ids"
    Write-Host "🗑️ Force removing..."
    docker rm -f $ids
}
else {
    Write-Host "✅ No conflicting container found."
}

Write-Host "🔄 Starting Docker Compose..."
Set-Location $HOME\bible-quiz
# standard up -d
docker compose up -d --remove-orphans

Write-Host "⏳ Waiting for startup (5s)..."
Start-Sleep -Seconds 5

Write-Host "📜 Recent Logs:"
docker logs bible-quiz 2>&1 | Select-Object -Last 20

Write-Host "📊 Final Status:"
docker ps
