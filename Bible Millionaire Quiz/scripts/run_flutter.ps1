param(
    [string]$BaseUrl = "https://xtc-biblestudy.idv.tw"
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "啟動 Flutter 原生 App (開發模式)" -ForegroundColor Cyan
Write-Host "目標 API 伺服器: $BaseUrl" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 切換到 mobile-app 資料夾
$ProjectDir = Join-Path $PSScriptRoot "..\mobile-app"
Set-Location $ProjectDir

Write-Host "正在啟動 App..." -ForegroundColor Green

flutter run --dart-define=API_BASE_URL=$BaseUrl

# 恢復原本的路徑
Set-Location $PSScriptRoot
