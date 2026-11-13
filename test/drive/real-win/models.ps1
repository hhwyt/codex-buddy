# Sends one line to every model in the sandbox's catalog with the real Codex CLI (sandbox CODEX_HOME)
param([string]$Home2 = 'C:\Users\hwy\CodexBuddy-Test\home\.codex')
$p = Get-AppxPackage -Name OpenAI.Codex
$cli = Join-Path $p.InstallLocation 'app\resources\codex.exe'
$env:CODEX_HOME = $Home2
$cfg = Get-Content (Join-Path $Home2 'config.toml') -Raw
"--- config.toml"; $cfg -replace '(?m)^(.*(key|token).*=\s*").{8,}(")', '$1***$3'
$cat = (Select-String -InputObject $cfg -Pattern 'model_catalog_json\s*=\s*"([^"]+)"').Matches
if (-not $cat) { "no catalog"; return }
$catFile = $cat[0].Groups[1].Value -replace '\\\\','\'
$models = (Get-Content $catFile -Raw | ConvertFrom-Json).models
"--- menu: " + (($models | % { "$($_.slug)=$($_.display_name)" }) -join ' | ')
$work = Join-Path $env:TEMP 'cb-model-test'; New-Item -ItemType Directory -Force $work | Out-Null; Set-Location $work
foreach ($m in $models) {
  $out = Join-Path $work "$($m.slug).out"; $err = Join-Path $work "$($m.slug).err"
  $proc = Start-Process -FilePath $cli -ArgumentList @('exec','--ephemeral','--skip-git-repo-check','-m',$m.slug,'"回复一个字：好"') -RedirectStandardOutput $out -RedirectStandardError $err -NoNewWindow -PassThru
  if (-not $proc.WaitForExit(150000)) { taskkill /F /T /PID $proc.Id | Out-Null; $to = ' TIMEOUT' } else { $to = '' }
  $o = (Get-Content $out -Raw -ErrorAction SilentlyContinue); $e = (Get-Content $err -Raw -ErrorAction SilentlyContinue)
  $bad = if ($e -match 'not available|not supported|does not exist|Model not|ERROR|error') { ($e -split "`n" | ? { $_ -match 'not available|not supported|does not exist|Model not|ERROR|error' } | select -First 3) -join ' / ' } else { '' }
  "=== $($m.slug)$to reply=[$(($o -replace '\s+',' ').Trim())] err=[$bad]"
}
