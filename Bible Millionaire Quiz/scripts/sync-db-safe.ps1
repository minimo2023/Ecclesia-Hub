# sync-db-safe.ps1 - 安全同步靜態資料庫到伺服器
# 只同步靜態內容（題目、經文），不覆蓋動態資料（用戶、遊戲進度）

param(
    [switch]$DryRun = $false,  # 只顯示會做什麼，不實際執行
    [switch]$IncludeContent = $false  # 是否包含 content.db (需連同 WAL)
)

$ErrorActionPreference = "Stop"

# 配置
$RemoteHost = "weien@Weien-WEBS"
$RemotePath = "C:\Users\weien\bible-quiz\data"
$LocalPath = ".\data"

Write-Host "🔄 開始資料庫同步..." -ForegroundColor Cyan

# 1. 先備份伺服器上的資料
Write-Host "`n📦 步驟 1: 備份伺服器資料" -ForegroundColor Yellow
$backupCmd = "cd C:\Users\weien\bible-quiz && xcopy data data_backup_%date:~0,10% /E /I /Y"
if ($DryRun) {
    Write-Host "[DRY RUN] 會執行: ssh $RemoteHost `"$backupCmd`""
} else {
    ssh $RemoteHost $backupCmd
}

# 2. 同步靜態資料庫
Write-Host "`n📤 步驟 2: 同步靜態資料庫" -ForegroundColor Yellow

$staticDbs = @(
    "bible_quiz.db",
    "fhl_bible.db"
)

foreach ($db in $staticDbs) {
    $localFile = Join-Path $LocalPath $db
    if (Test-Path $localFile) {
        if ($DryRun) {
            Write-Host "[DRY RUN] 會上傳: $localFile"
        } else {
            Write-Host "  上傳 $db..."
            scp $localFile "${RemoteHost}:${RemotePath}/"
        }
    } else {
        Write-Host "  ⚠️ 找不到 $db，跳過" -ForegroundColor Yellow
    }
}

# 3. 可選：同步 content.db (需連同 WAL)
if ($IncludeContent) {
    Write-Host "`n📤 步驟 3: 同步 content.db (含 WAL)" -ForegroundColor Yellow
    
    $contentFiles = @(
        "content.db",
        "content.db-wal",
        "content.db-shm"
    )
    
    foreach ($file in $contentFiles) {
        $localFile = Join-Path $LocalPath $file
        if (Test-Path $localFile) {
            if ($DryRun) {
                Write-Host "[DRY RUN] 會上傳: $localFile"
            } else {
                Write-Host "  上傳 $file..."
                scp $localFile "${RemoteHost}:${RemotePath}/"
            }
        }
    }
}

Write-Host "`n✅ 同步完成！" -ForegroundColor Green

if (-not $DryRun) {
    Write-Host "`n📋 注意事項:" -ForegroundColor Cyan
    Write-Host "  - 靜態資料庫已同步"
    Write-Host "  - 動態資料庫 (users.db, games.db, notes.db) 保持不變"
    Write-Host "  - 如需生效，請在伺服器重啟 Docker 容器"
}
