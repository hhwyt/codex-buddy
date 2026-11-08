# Installs Microsoft's WebView2 runtime (the app's page needs it; some Windows 10 PCs lack it) with Microsoft's own
# online bootstrapper, after checking it is signed by Microsoft. Shows a small window meanwhile. Exit 0 = installed.
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$form = New-Object Windows.Forms.Form
$form.Text = 'Codex 搭子'; $form.ClientSize = New-Object Drawing.Size(440, 110); $form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'; $form.MaximizeBox = $false; $form.MinimizeBox = $false; $form.TopMost = $true
$form.BackColor = [Drawing.Color]::White
$label = New-Object Windows.Forms.Label
$label.Text = "第一次打开，先装一个微软的网页组件（WebView2）。`n大约一分钟，装好会自动继续。"
$label.Font = New-Object Drawing.Font('Microsoft YaHei UI', 11); $label.Location = New-Object Drawing.Point(24, 26); $label.Size = New-Object Drawing.Size(400, 60)
$form.Controls.Add($label)
$form.Show(); [Windows.Forms.Application]::DoEvents()
function Wait-Process($p) { while (-not $p.HasExited) { [Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 100 } }

$setup = Join-Path $env:TEMP 'MicrosoftEdgeWebview2Setup.exe'
$ok = $false
try {
  Wait-Process (Start-Process curl.exe -PassThru -WindowStyle Hidden -ArgumentList '-fsSL', '--retry', '3', '-o', "`"$setup`"", 'https://go.microsoft.com/fwlink/p/?LinkId=2124703')
  $sig = Get-AuthenticodeSignature $setup
  if ($sig.Status -eq 'Valid' -and $sig.SignerCertificate.Subject -match 'O=Microsoft Corporation') {
    $p = Start-Process $setup -PassThru -ArgumentList '/silent', '/install'
    Wait-Process $p
    $ok = $p.ExitCode -eq 0
  }
} catch { }
$form.Close()
Remove-Item $setup -Force -ErrorAction SilentlyContinue
if (-not $ok) {
  [void][Windows.Forms.MessageBox]::Show("微软的网页组件（WebView2）没装上。`n`n请用浏览器打开 https://go.microsoft.com/fwlink/p/?LinkId=2124703 下载并安装，然后重新打开 Codex 搭子。", 'Codex 搭子')
  exit 1
}
exit 0
