$ErrorActionPreference = 'Stop'
$OutputEncoding = [Text.UTF8Encoding]::new($false)
$homeDir = Join-Path $env:LOCALAPPDATA 'ZohurNewsBackup'
$rclone = Join-Path $homeDir 'rclone.exe'
if (-not (Test-Path (Join-Path $homeDir 'google-token.dpapi.xml'))) { & (Join-Path $homeDir 'Authorize.ps1') }
$secureToken = Import-Clixml (Join-Path $homeDir 'google-token.dpapi.xml')
$token = [Net.NetworkCredential]::new('', $secureToken).Password
$pass = Read-Host 'Enter the SAME recovery passphrase used on the VPS (input hidden)' -AsSecureString
$plain = [Net.NetworkCredential]::new('', $pass).Password
if ($plain.Length -lt 20) { throw 'Passphrase must have at least 20 characters' }
$obscured = $plain | & $rclone obscure -
if ($LASTEXITCODE -ne 0) { throw 'Cannot encode encryption key' }
$config = "[zohur-drive]`ntype = drive`nscope = drive`nroot_folder_id = 1VxFw7Bzr80HUJLfkI_hwWCZQB4QrnauT`ntoken = $token`n`n[zohur-crypt]`ntype = crypt`nremote = zohur-drive:encrypted-v1`nfilename_encryption = standard`ndirectory_name_encryption = true`npassword = $obscured`n"
(ConvertTo-SecureString $config -AsPlainText -Force) | Export-Clixml (Join-Path $homeDir 'rclone.dpapi.xml')
$dest = Read-Host 'Local backup folder [Enter = Documents\ZohurNewsBackups]'
if (-not $dest) { $dest = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'ZohurNewsBackups' }
$dest = [IO.Path]::GetFullPath($dest)
New-Item -ItemType Directory -Force $dest | Out-Null
& icacls.exe $dest /inheritance:r /grant:r "*$([Security.Principal.WindowsIdentity]::GetCurrent().User.Value):(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect local backup folder' }
@{ destination=$dest; keep=14 } | ConvertTo-Json | Set-Content (Join-Path $homeDir 'settings.json') -Encoding UTF8
Write-Host 'Credentials protected with Windows DPAPI for this user. Keep recovery passphrase separately.'
