param(
    [string]$BaseUrl = "https://xtc-biblestudy.idv.tw"
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "打包 Flutter 原生 App (Release APK)" -ForegroundColor Cyan
Write-Host "目標 API 伺服器: $BaseUrl" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 切換到 mobile-app 資料夾
$ProjectDir = Join-Path $PSScriptRoot "..\mobile-app"
Set-Location $ProjectDir

Write-Host "正在編譯 APK，請稍候..." -ForegroundColor Green

flutter build apk --release --dart-define=API_BASE_URL=$BaseUrl

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "若上方沒有紅字錯誤，代表打包成功！" -ForegroundColor Green
Write-Host "APK 檔案位置: mobile-app\build\app\outputs\flutter-apk\app-release.apk" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Cyan

# 恢復原本的路徑
Set-Location $PSScriptRoot
