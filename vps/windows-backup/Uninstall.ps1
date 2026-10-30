$ErrorActionPreference = 'Stop'
Unregister-ScheduledTask -TaskName 'ZohurNews Backup Receiver' -Confirm:$false -ErrorAction SilentlyContinue
$link = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ZohurNews Backup.lnk'
Remove-Item $link -ErrorAction SilentlyContinue
Write-Host 'Automatic receiving removed. Existing backups and private configuration retained.'
