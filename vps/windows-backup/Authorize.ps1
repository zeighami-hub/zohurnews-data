$ErrorActionPreference = 'Stop'
$homeDir = Join-Path $env:LOCALAPPDATA 'ZohurNewsBackup'
$rclone = Join-Path $homeDir 'rclone.exe'
if (-not (Test-Path $rclone)) { throw 'Run Install.cmd first' }
Write-Host 'Your browser will open. Select the SAME Google account that owns ZohurNews Backups.'
$lines = & $rclone authorize drive 2>&1
if ($LASTEXITCODE -ne 0) { throw 'Google authorization failed' }
$text = $lines -join "`n"
$match = [regex]::Match($text, '\{\s*"access_token"[\s\S]*?\}')
if (-not $match.Success) { throw 'Authorization token was not returned' }
$token = $match.Value | ConvertFrom-Json
if (-not $token.refresh_token) { throw 'Missing refresh token' }
$secret = ConvertTo-SecureString $match.Value -AsPlainText -Force
$secret | Export-Clixml (Join-Path $homeDir 'google-token.dpapi.xml')
Set-Clipboard -Value $match.Value
Write-Host 'Authorization JSON copied to clipboard. Paste ONLY into the hidden prompt in the VPS setup terminal. Do not paste into chat.'
Write-Host 'After pasting on VPS, return here and press Enter to clear the clipboard.'
Read-Host | Out-Null
Set-Clipboard -Value ''
