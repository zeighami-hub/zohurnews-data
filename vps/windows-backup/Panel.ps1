Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$homeDir = Join-Path $env:LOCALAPPDATA 'ZohurNewsBackup'
$form = New-Object Windows.Forms.Form
$form.Text = 'ZohurNews Backup'; $form.Size = New-Object Drawing.Size(560,280); $form.StartPosition = 'CenterScreen'
$label = New-Object Windows.Forms.Label
$label.Location = New-Object Drawing.Point(20,20); $label.Size = New-Object Drawing.Size(510,140)
$form.Controls.Add($label)
$refresh = {
    $p = Join-Path $homeDir 'status.json'
    if (Test-Path $p) {
        try {
            $s = Get-Content $p -Raw | ConvertFrom-Json
            if ($s.ok) { $label.Text = "Verified local backup: $($s.latest)`r`nLast check (UTC): $($s.checked)`r`nFolder: $($s.destination)" }
            else { $label.Text = "Needs attention: $($s.message)`r`nLast check: $($s.checked)" }
        } catch { $label.Text = 'Status updating...' }
    } else { $label.Text = 'Waiting for first backup. Finish VPS Google authorization first.' }
}
$receive = New-Object Windows.Forms.Button; $receive.Text = 'Receive now'; $receive.Location = New-Object Drawing.Point(20,175); $receive.Width = 150
$receive.Add_Click({ Start-ScheduledTask -TaskName 'ZohurNews Backup Receiver' }); $form.Controls.Add($receive)
$open = New-Object Windows.Forms.Button; $open.Text = 'Open backup folder'; $open.Location = New-Object Drawing.Point(190,175); $open.Width = 160
$open.Add_Click({ $s = Get-Content (Join-Path $homeDir 'settings.json') -Raw | ConvertFrom-Json; Start-Process explorer.exe -ArgumentList ('"' + $s.destination + '"') }); $form.Controls.Add($open)
$timer = New-Object Windows.Forms.Timer; $timer.Interval = 3000; $timer.Add_Tick($refresh); $timer.Start()
$form.Add_FormClosed({ $timer.Dispose() }); & $refresh
[void]$form.ShowDialog()
