$ErrorActionPreference = 'Stop'
$count = 0
Get-ChildItem $PSScriptRoot -Filter '*.ps1' | ForEach-Object {
    $tokens = $null; $errors = $null
    [void][Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$tokens, [ref]$errors)
    if ($errors.Count) { throw ($errors | Out-String) }
    $count++
}
Write-Host "Parsed $count PowerShell scripts successfully."
# The receiver must not invoke remote deletion/synchronization.
$code = Get-Content (Join-Path $PSScriptRoot 'Receive.ps1') -Raw
if ($code -match 'Invoke-Rclone[^\r\n]+(?:sync|purge|deletefile)') { throw 'Receiver must never delete cloud content' }
$ast = [Management.Automation.Language.Parser]::ParseInput($code, [ref]$null, [ref]$null)
$fn = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Test-Snapshot' }, $true)
Invoke-Expression $fn.Extent.Text
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('zohur-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $fixture | Out-Null
try {
    $stamp = '20261030T120000Z'; $files = @{}
    foreach ($name in @('news.sqlite.gz','research.sqlite.gz')) {
        $path = Join-Path $fixture $name
        [IO.File]::WriteAllBytes($path, [byte[]]@(1,2,3,4))
        $files[$name] = @{ bytes=4; sha256=(Get-FileHash $path -Algorithm SHA256).Hash.ToLower() }
    }
    @{ schema=1; snapshot=$stamp; files=$files } | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $fixture 'manifest.json') -Encoding UTF8
    Test-Snapshot $fixture $stamp
    [IO.File]::WriteAllBytes((Join-Path $fixture 'news.sqlite.gz'), [byte[]]@(4,3,2,1))
    $rejected = $false
    try { Test-Snapshot $fixture $stamp } catch { $rejected = $true }
    if (-not $rejected) { throw 'Corrupt snapshot was accepted' }
    $secretPath = Join-Path $fixture 'secret.xml'
    (ConvertTo-SecureString 'test-credential-not-real' -AsPlainText -Force) | Export-Clixml $secretPath
    if ([Net.NetworkCredential]::new('', (Import-Clixml $secretPath)).Password -ne 'test-credential-not-real') { throw 'Credential persistence failed' }
    Write-Host 'PASS: checksum acceptance, corrupted-file rejection and credential persistence.'
} finally { Remove-Item $fixture -Recurse -Force }
