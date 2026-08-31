param(
    [string]$TaskName = 'EcclesiaHub-ScriptureRecordingBackup',
    [string]$RunAt = '03:30'
)

$hubRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nodePath = (Get-Command node -ErrorAction Stop).Source
$scriptPath = Join-Path $hubRoot 'Bible Millionaire Quiz\server\scripts\backup-scripture-recordings.mjs'

if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    throw "找不到備份程式：$scriptPath"
}

$action = New-ScheduledTaskAction -Execute $nodePath -Argument ('"{0}"' -f $scriptPath) -WorkingDirectory $hubRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $RunAt
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'Ecclesia Hub PostgreSQL 與會員朗讀 manifest 每日備份' -Force

Write-Host "已建立排程 $TaskName，每日 $RunAt 執行。"
