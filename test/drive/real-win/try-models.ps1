$p = Get-AppxPackage -Name OpenAI.Codex; $cli = Join-Path $p.InstallLocation 'app\resources\codex.exe'
$env:CODEX_HOME = 'C:\Users\hwy\CodexBuddy-Test\home\.codex'
$work = Join-Path $env:TEMP 'cb-model-test'; Set-Location $work; $empty = Join-Path $work 'empty.txt'
foreach ($m in $env:TRY_MODELS -split ',') {
  $out = Join-Path $work "try-$m.out"; $err = Join-Path $work "try-$m.err"
  $proc = Start-Process -FilePath $cli -ArgumentList @('exec','--ephemeral','--skip-git-repo-check','-m',$m,'"回复一个字：好"') -RedirectStandardInput $empty -RedirectStandardOutput $out -RedirectStandardError $err -NoNewWindow -PassThru
  if (-not $proc.WaitForExit(240000)) { taskkill /F /T /PID $proc.Id | Out-Null }
  $o = Get-Content $out -Raw -Encoding UTF8 -ErrorAction SilentlyContinue; $e = Get-Content $err -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
  "=== $m reply=[$(($o -replace '\s+',' ').Trim())] err=[$((($e -split "`n") | ? { $_ -match 'ERROR|error|not' } | select -First 2) -join ' / ')]"
}
