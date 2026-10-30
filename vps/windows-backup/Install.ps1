# Windows 10/11, current user only; no administrator or Python required.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$homeDir = Join-Path $env:LOCALAPPDATA 'ZohurNewsBackup'
New-Item -ItemType Directory -Force $homeDir | Out-Null
& icacls.exe $homeDir /inheritance:r /grant:r "*$([Security.Principal.WindowsIdentity]::GetCurrent().User.Value):(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect application directory permissions' }
Copy-Item "$PSScriptRoot\*.ps1" $homeDir -Force
$version = 'v1.70.3'
$asset = "rclone-$version-windows-amd64.zip"
$base = "https://downloads.rclone.org/$version"
$zip = Join-Path $homeDir $asset
Invoke-WebRequest "$base/$asset" -OutFile $zip -UseBasicParsing
$sums = (Invoke-WebRequest "$base/SHA256SUMS" -UseBasicParsing).Content
$entry = ($sums -split "`n" | Where-Object { $_.Trim().EndsWith($asset) } | Select-Object -First 1)
if (-not $entry) { throw 'Official SHA256 entry missing' }
$expected = ($entry.Trim() -split '\s+')[0]
if ((Get-FileHash $zip -Algorithm SHA256).Hash -ne $expected) { throw 'rclone SHA256 mismatch' }
Expand-Archive $zip (Join-Path $homeDir 'tools') -Force
Copy-Item (Join-Path $homeDir "tools/rclone-$version-windows-amd64/rclone.exe") (Join-Path $homeDir 'rclone.exe') -Force
Remove-Item $zip
& (Join-Path $homeDir 'Configure.ps1')
$worker = Join-Path $homeDir 'Receive.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$worker`""
$logon = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
$periodic = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 3) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'ZohurNews Backup Receiver' -Action $action -Trigger @($logon,$periodic) -Settings $settings -Principal $principal -Force | Out-Null
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'ZohurNews Backup.lnk'))
$link.TargetPath = 'powershell.exe'
$link.Arguments = "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $homeDir 'Panel.ps1')`""
$link.Save()
Start-ScheduledTask -TaskName 'ZohurNews Backup Receiver'
Write-Host 'Installed. Desktop panel created. Runs at sign-in and hourly while signed in.'
Read-Host 'Press Enter to close'
