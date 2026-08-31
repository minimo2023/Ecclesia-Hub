param(
    [string]$AppRoot = '',
    [string]$GoogleClientId = ''
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($AppRoot)) {
    $baseCandidate = $PSScriptRoot
    $nestedCandidate = Join-Path $baseCandidate 'Bible Millionaire Quiz'
    $AppRoot = if (Test-Path -LiteralPath $nestedCandidate) {
        $nestedCandidate
    } else {
        Split-Path -Parent $PSScriptRoot
    }
}

$envPath = Join-Path (Split-Path -Parent $AppRoot) '.env.production'
$legacyPath = Join-Path $AppRoot 'server\infrastructure\feedback\routes.js'

if (-not (Test-Path -LiteralPath $envPath)) {
    throw '.env.production does not exist.'
}

if (-not (Test-Path -LiteralPath $legacyPath)) {
    throw 'Legacy SMTP source does not exist.'
}

$legacy = [IO.File]::ReadAllText($legacyPath)

function Read-LegacyValue([string]$pattern, [string]$label) {
    $match = [regex]::Match($legacy, $pattern)
    if (-not $match.Success -or [string]::IsNullOrWhiteSpace($match.Groups[1].Value)) {
        throw "Unable to locate legacy $label."
    }
    return $match.Groups[1].Value.Trim()
}

$smtpHost = Read-LegacyValue 'host\s*:\s*[''"]([^''"]+)[''"]' 'SMTP host'
$smtpPort = Read-LegacyValue 'port\s*:\s*(\d+)' 'SMTP port'
$smtpUser = Read-LegacyValue 'user\s*:\s*[''"]([^''"]+)[''"]' 'SMTP user'
$smtpPassword = Read-LegacyValue 'pass\s*:\s*[''"]([^''"]+)[''"]' 'SMTP password'
$smtpFrom = Read-LegacyValue 'from\s*:\s*.*?<([^>]+)>' 'SMTP from address'

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = "$envPath.before-smtp-secret-$timestamp.bak"
Copy-Item -LiteralPath $envPath -Destination $backupPath

$content = [IO.File]::ReadAllText($envPath)

function Set-EnvironmentValue([string]$name, [string]$value) {
    $script:content = [regex]::Replace(
        $script:content,
        "(?m)^$([regex]::Escape($name))=.*$",
        '',
        [Text.RegularExpressions.RegexOptions]::None
    ).TrimEnd("`r", "`n")
    $script:content += "`r`n$name=$value`r`n"
}

Set-EnvironmentValue 'SMTP_HOST' $smtpHost
Set-EnvironmentValue 'SMTP_PORT' $smtpPort
Set-EnvironmentValue 'SMTP_SECURE' 'true'
Set-EnvironmentValue 'SMTP_USER' $smtpUser
Set-EnvironmentValue 'SMTP_PASSWORD' $smtpPassword
Set-EnvironmentValue 'SMTP_FROM' $smtpFrom
Set-EnvironmentValue 'PUBLIC_APP_URL' 'https://xtc-biblestudy.idv.tw'
if (-not [string]::IsNullOrWhiteSpace($GoogleClientId)) {
    Set-EnvironmentValue 'GOOGLE_CLIENT_ID' $GoogleClientId
}

[IO.File]::WriteAllText($envPath, $content, (New-Object Text.UTF8Encoding($false)))

Write-Output "SMTP environment keys migrated. Backup: $backupPath"
