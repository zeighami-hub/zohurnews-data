$ErrorActionPreference = 'Stop'
$homeDir = Join-Path $env:LOCALAPPDATA 'ZohurNewsBackup'
$mutex = New-Object Threading.Mutex($false, 'Local\ZohurNewsBackupReceiver')
if (-not $mutex.WaitOne(0)) { $mutex.Dispose(); exit 0 }
$configPath = Join-Path $homeDir ('runtime-' + [guid]::NewGuid().ToString('N') + '.conf')
$statusPath = Join-Path $homeDir 'status.json'
$rclone = Join-Path $homeDir 'rclone.exe'
function Invoke-Rclone([string[]]$Arguments) {
    $result = & $rclone --config $configPath --retries 3 --contimeout 30s --timeout 5m @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Cloud transfer failed; check internet, Google authorization and recovery passphrase.' }
    return $result
}
function Test-Snapshot([string]$Folder, [string]$Stamp) {
    $manifest = Get-Content (Join-Path $Folder 'manifest.json') -Raw | ConvertFrom-Json
    if ($manifest.schema -ne 1 -or $manifest.snapshot -ne $Stamp) { throw 'Invalid manifest' }
    $names = @($manifest.files.PSObject.Properties.Name | Sort-Object)
    if (($names -join ',') -ne 'news.sqlite.gz,research.sqlite.gz') { throw 'Unexpected manifest file names' }
    foreach ($name in $names) {
        $info = $manifest.files.$name
        $file = Join-Path $Folder $name
        if ($info.sha256 -notmatch '^[0-9a-f]{64}$' -or $info.bytes -le 0) { throw 'Invalid checksum metadata' }
        if ((Get-Item $file).Length -ne $info.bytes -or (Get-FileHash $file -Algorithm SHA256).Hash -ne $info.sha256) { throw 'Backup checksum mismatch' }
    }
}
try {
    $settings = Get-Content (Join-Path $homeDir 'settings.json') -Raw | ConvertFrom-Json
    $secure = Import-Clixml (Join-Path $homeDir 'rclone.dpapi.xml')
    [IO.File]::WriteAllText($configPath, [Net.NetworkCredential]::new('', $secure).Password, [Text.UTF8Encoding]::new($false))
    $listing = (Invoke-Rclone -Arguments @('lsjson','zohur-crypt:snapshots','--dirs-only')) -join "`n" | ConvertFrom-Json
    $stamps = @($listing | Where-Object { $_.Name -match '^\d{8}T\d{6}Z$' } | Sort-Object Name -Descending | Select-Object -First 30)
    $verified = @()
    foreach ($entry in $stamps) {
        $stamp = $entry.Name
        try { $ready = (Invoke-Rclone -Arguments @('cat',"zohur-crypt:snapshots/$stamp/READY")) -join '' } catch { continue }
        if ($ready.Trim() -ne $stamp) { continue }
        $final = Join-Path $settings.destination $stamp
        if (-not (Test-Path (Join-Path $final 'VERIFIED'))) {
            $partial = Join-Path $settings.destination ($stamp + '.partial')
            New-Item -ItemType Directory -Force $partial | Out-Null
            Invoke-Rclone -Arguments @('copy',"zohur-crypt:snapshots/$stamp",$partial,'--include','/news.sqlite.gz','--include','/research.sqlite.gz','--include','/manifest.json','--include','/READY') | Out-Null
            Test-Snapshot $partial $stamp
            if (Test-Path $final) { throw 'Existing unverified folder retained; review before replacing' }
            Move-Item $partial $final
            Set-Content (Join-Path $final 'VERIFIED') ((Get-Date).ToUniversalTime().ToString('o'))
        } else { Test-Snapshot $final $stamp }
        $verified += $stamp
        if ($verified.Count -ge [int]$settings.keep) { break }
    }
    if ($verified.Count -eq 0) { throw 'No complete cloud snapshot yet. Finish VPS authorization and first backup.' }
    # Only remove old app-owned verified snapshots after a successful receive.
    Get-ChildItem $settings.destination -Directory | Where-Object { $_.Name -match '^\d{8}T\d{6}Z$' -and (Test-Path (Join-Path $_.FullName 'VERIFIED')) } | Sort-Object Name -Descending | Select-Object -Skip ([int]$settings.keep) | ForEach-Object { Remove-Item $_.FullName -Recurse -Force }
    @{ ok=$true; checked=(Get-Date).ToUniversalTime().ToString('o'); latest=$verified[0]; destination=$settings.destination } | ConvertTo-Json | Set-Content $statusPath -Encoding UTF8
} catch {
    @{ ok=$false; checked=(Get-Date).ToUniversalTime().ToString('o'); message=$_.Exception.Message } | ConvertTo-Json | Set-Content $statusPath -Encoding UTF8
    exit 1
} finally {
    if (Test-Path $configPath) {
        # Persist OAuth refresh updates, encrypted to this Windows user.
        try { (ConvertTo-SecureString (Get-Content $configPath -Raw) -AsPlainText -Force) | Export-Clixml (Join-Path $homeDir 'rclone.dpapi.xml') } finally { Remove-Item $configPath -Force }
    }
    $mutex.ReleaseMutex(); $mutex.Dispose()
}
