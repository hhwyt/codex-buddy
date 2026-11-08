# Codex 搭子 (codex-buddy) helper for an installed Codex: status, model switch, edition, settings, restore, open.
# The first install is codex.ps1 (vendored from codex-install-made-easy); this file covers everything after it.
# The app runs it hidden with BUDDY_ACTION and BUDDY_ARGS (JSON) in the environment. It prints
# STEP:<id>:<start|done|fail>:<text> lines for progress and one RESULT:<json> line at the end.
# Keys arrive in BUDDY_ARGS (never on a command line) and are never printed or logged. Keys the app keeps for a later
# switch back are encrypted with Windows DPAPI (only this Windows account can read them).
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$ProgressPreference = 'SilentlyContinue'

$CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
$ConfigPath = Join-Path $CodexHome 'config.toml'
$AuthPath = Join-Path $CodexHome 'auth.json'
$CatalogPath = Join-Path $CodexHome 'humanslive-models.json'
$HumansLiveDir = Join-Path $env:LOCALAPPDATA 'HumansLive'
$BuddyDir = Join-Path $HumansLiveDir 'codex-buddy'
$SecretDir = Join-Path $BuddyDir 'secrets'
$BackupDir = Join-Path $BuddyDir 'backups'
$OriginalDir = Join-Path $BuddyDir 'original'
$ZhipuBaseUrl = 'https://open.bigmodel.cn/api/v1'
$FreeModels = @('glm-4.5-flash', 'glm-4.7-flash')
$Utf8 = [Text.UTF8Encoding]::new($false)
$LogFile = Join-Path $HumansLiveDir ('logs\buddy-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
New-Item -ItemType Directory -Force (Split-Path $LogFile), $SecretDir, $BackupDir | Out-Null
Add-Type -AssemblyName System.Security

# Anything that could carry a key goes through Hide before it reaches a log line or the app
function Hide([string]$text) {
  $text -replace '[0-9a-f]{32}\.[A-Za-z0-9]{16}', '****' -replace '(sk-|Bearer\s+|"OPENAI_API_KEY"\s*:\s*")[A-Za-z0-9._\-]{6,}', '$1****' -replace '("(access|refresh|id)_token"\s*:\s*")[^"]+', '$1****'
}
function Log($text) { try { Add-Content -LiteralPath $LogFile -Value ((Get-Date -Format 'HH:mm:ss.fff') + '  ' + (Hide $text)) -Encoding UTF8 } catch { } }
function Step($id, $state, $text) { Log "STEP:${id}:${state}:$text"; [Console]::Out.WriteLine("STEP:${id}:${state}:$(Hide $text)"); [Console]::Out.Flush() }
function Result($object) { [Console]::Out.WriteLine('RESULT:' + (Hide ($object | ConvertTo-Json -Compress -Depth 6))); [Console]::Out.Flush() }

# ---------- Secrets (DPAPI, current Windows user) ----------
function Save-Secret($name, [string]$text) {
  $bytes = [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($text), $null, 'CurrentUser')
  [IO.File]::WriteAllBytes((Join-Path $SecretDir "$name.dpapi"), $bytes)
}
function Read-Secret($name) {
  $path = Join-Path $SecretDir "$name.dpapi"
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  try { [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($path), $null, 'CurrentUser')) } catch { Log "secret $name unreadable: $($_.Exception.Message)"; $null }
}
function Test-Secret($name) { Test-Path -LiteralPath (Join-Path $SecretDir "$name.dpapi") }

# ---------- config.toml, line based like codex.ps1: only the keys we own change, everything else stays ----------
function Read-Lines($path) { if (Test-Path -LiteralPath $path) { @([IO.File]::ReadAllLines($path, $Utf8)) } else { @() } }
function Read-Text($path) { if (Test-Path -LiteralPath $path) { [IO.File]::ReadAllText($path, $Utf8) } else { $null } }
function Get-Value($lines, $table, $key) {
  $current = ''
  foreach ($line in $lines) {
    if ($line -match '^\s*\[([^\]]+)\]') { $current = $Matches[1].Trim(); continue }
    if ($current -eq $table -and $line -match "^\s*$([regex]::Escape($key))\s*=\s*`"(.*)`"") { return $Matches[1] }
  }
  $null
}
# $top: key -> full line, or $null to remove the key. $tables: table name -> lines, or $null to remove the table.
# New top-level keys go first (TOML needs them before any table), new tables at the end
function Set-Config($lines, [hashtable]$top, [hashtable]$tables) {
  $kept = @(); $current = ''; $skip = $false
  foreach ($line in $lines) {
    if ($line -match '^\s*\[([^\]]+)\]') { $current = $Matches[1].Trim(); $skip = $tables.ContainsKey($current) }
    if ($skip) { continue }
    if ($current -eq '' -and $line -match '^\s*([A-Za-z_]+)\s*=' -and $top.ContainsKey($Matches[1])) { continue }
    $kept += $line
  }
  $head = @($top.Keys | Sort-Object | Where-Object { $top[$_] } | ForEach-Object { $top[$_] })
  $tail = @()
  foreach ($name in ($tables.Keys | Sort-Object)) { if ($tables[$name]) { $tail += @('', "[$name]") + $tables[$name] } }
  while ($kept.Count -and $kept[0] -eq '') { $kept = @($kept | Select-Object -Skip 1) }
  @($head + $(if ($head.Count) { @('') } else { @() }) + $kept + $tail)
}
function Set-TableValue($lines, $table, $key, $line) {
  $out = [Collections.Generic.List[string]]::new(); $current = ''; $done = $false; $seen = $false
  foreach ($l in $lines) {
    if ($l -match '^\s*\[([^\]]+)\]') {
      if ($current -eq $table -and -not $done) { $out.Add($line); $done = $true }
      $current = $Matches[1].Trim(); if ($current -eq $table) { $seen = $true }
      $out.Add($l); continue
    }
    if ($current -eq $table -and $l -match "^\s*$([regex]::Escape($key))\s*=") { if (-not $done) { $out.Add($line); $done = $true }; continue }
    $out.Add($l)
  }
  if ($current -eq $table -and -not $done) { $out.Add($line); $done = $true }
  if (-not $seen) { $out.Add(''); $out.Add("[$table]"); $out.Add($line) }
  @($out)
}
function Write-Text($path, $text) { New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null; [IO.File]::WriteAllText($path, $text, $Utf8) }
function Join-Lines($lines) { ($lines -join "`n").TrimEnd() + "`n" }
function Get-AuthKey($authText) { if ("$authText" -match '"OPENAI_API_KEY"\s*:\s*"([^"]+)"') { $Matches[1] } }

# ---------- Codex itself ----------
function Get-CodexPackage { Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue | Sort-Object Version -Descending | Select-Object -First 1 }
function Get-CodexCli { $p = Get-CodexPackage; if ($p) { Join-Path $p.InstallLocation 'app\resources\codex.exe' } }
function Get-CodexAppProcesses {
  $p = Get-CodexPackage; if (-not $p) { return @() }
  $appDir = Join-Path $p.InstallLocation 'app\'
  @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath.StartsWith($appDir, [StringComparison]::OrdinalIgnoreCase) -and $_.Name -notlike 'codex-windows-sandbox-service*' })
}
function Get-Launcher { $l = Join-Path $HumansLiveDir 'codex-zh.ps1'; if (Test-Path -LiteralPath $l) { $l } }

# Which of the four choices the config is on now
function Get-Current {
  $lines = Read-Lines $ConfigPath
  $provider = Get-Value $lines '' 'model_provider'
  $model = Get-Value $lines '' 'model'
  $auth = Read-Text $AuthPath
  $kind = if ($provider -eq 'zhipu') { if ($FreeModels -contains $model) { 'zhipu-free' } else { 'zhipu-paid' } }
          elseif ($provider -eq 'custom') { 'custom' }
          elseif (-not $provider -and "$auth" -match '"tokens"\s*:\s*\{') { 'openai' }
          else { 'none' }
  @{ kind = $kind; model = $model; provider = $provider; lines = $lines; auth = $auth }
}
# The Zhipu key: the one the app saved, or the one in auth.json while Zhipu is configured. Saved on first sight, so
# switching away and back needs no new scan
function Get-ZhipuKey {
  $key = Read-Secret 'zhipu'
  if ($key) { return $key }
  $cur = Get-Current
  if ($cur.provider -eq 'zhipu') { $key = Get-AuthKey $cur.auth; if ($key) { Save-Secret 'zhipu' $key }; return $key }
  $null
}

# Copy the current config and auth into a new backup folder (auth encrypted). Returns the folder
function Backup-Current($reason) {
  $dir = Join-Path $BackupDir ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + $reason)
  New-Item -ItemType Directory -Force $dir | Out-Null
  if (Test-Path -LiteralPath $ConfigPath) { Copy-Item -LiteralPath $ConfigPath (Join-Path $dir 'config.toml') }
  $auth = Read-Text $AuthPath
  if ($null -ne $auth) {
    [IO.File]::WriteAllBytes((Join-Path $dir 'auth.json.dpapi'), [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($auth), $null, 'CurrentUser'))
  }
  Log "backup: $dir"
  $dir
}

# Ask Codex itself for one reply with this config, in a scratch CODEX_HOME, so the real config changes only once it works.
# Returns @{ ok; reply; reason }
function Test-CodexHome($testHome) {
  $cli = Get-CodexCli
  if (-not $cli -or -not (Test-Path -LiteralPath $cli)) { return @{ ok = $false; reason = '没找到 Codex，先完成安装' } }
  $err = Join-Path $testHome 'test-stderr.txt'
  $job = Start-Job -ArgumentList $cli, $testHome, $err -ScriptBlock {
    param($c, $h, $e)
    $env:CODEX_HOME = $h
    [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
    Set-Location $h
    cmd /c "`"$c`" exec --ephemeral --skip-git-repo-check `"只回复两个字：好了`" < NUL 2>`"$e`""
  }
  $finished = Wait-Job $job -Timeout 120
  $reply = if ($finished) { Receive-Job $job -ErrorAction SilentlyContinue | Where-Object { "$_".Trim() } | Select-Object -Last 1 } else { Stop-Job $job; $null }
  Remove-Job $job -Force -ErrorAction SilentlyContinue
  $stderr = if (Test-Path -LiteralPath $err) { [IO.File]::ReadAllText($err, $Utf8) } else { '' }
  Log "test reply: $reply"
  if ($reply) { return @{ ok = $true; reply = "$reply".Trim() } }
  $tail = (($stderr -split "`n") | Where-Object { $_ -match 'error|ERROR|status|401|403|404|429|余额|insufficient|refused|timed out|dns' } | Select-Object -Last 6) -join ' | '
  Log "test failed, stderr: $tail"
  $reason = if (-not $finished) { '两分钟内没有回复，可能是网络连不上这个地址' }
    elseif ($stderr -match '1113|余额|insufficient|balance|欠费') { '账户余额不足：先去充值，再来切换' }
    elseif ($stderr -match '401|403|Unauthorized|invalid.{0,20}(key|token)|身份验证|令牌') { 'Key 不对，或者没有权限用这个模型' }
    elseif ($stderr -match 'stream (disconnected|closed) before') { '对方没有正常回复：多半是 Key 不对，或者地址、模型名不对' }
    elseif ($stderr -match '404|not.found|model.{0,30}(exist|available|support)') { '地址或模型名不对' }
    elseif ($stderr -match '429|rate|overload|过载|频') { '对方说现在太忙（限速），过一会儿再试' }
    elseif ($stderr -match 'dns|resolve|connect|refused|timed out|tls|certificate') { '连不上这个地址，检查一下网络或地址' }
    else { 'Codex 没有回复' }
  @{ ok = $false; reason = $reason; detail = (Hide $tail) }
}

function New-TestHome($configLines, $authText) {
  $dir = Join-Path $env:TEMP ('codex-buddy-test-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Force $dir | Out-Null
  Write-Text (Join-Path $dir 'config.toml') (Join-Lines $configLines)
  if ($authText) { Write-Text (Join-Path $dir 'auth.json') $authText }
  $dir
}

# ---------- Actions ----------
function Invoke-Status {
  $pkg = Get-CodexPackage
  $cur = Get-Current
  $effort = Get-Value $cur.lines '' 'model_reasoning_effort'
  $sandbox = Get-Value $cur.lines '' 'sandbox_mode'
  $null = Get-ZhipuKey   # Saves the key on first sight
  Result @{
    ok = $true; installed = [bool]$pkg; version = $(if ($pkg) { "$($pkg.Version)" }); edition = $(if (Get-Launcher) { 'zh' } else { 'en' })
    kind = $cur.kind; model = $cur.model; customBaseUrl = (Get-Value $cur.lines 'model_providers.custom' 'base_url')
    hasZhipuKey = (Test-Secret 'zhipu'); hasOpenaiLogin = ((Test-Secret 'openai-auth') -or $cur.kind -eq 'openai')
    askBeforeEdit = ($sandbox -eq 'read-only'); effort = $(if ($effort) { $effort } else { 'medium' })
    hasOriginal = (Test-Path -LiteralPath (Join-Path $OriginalDir 'state.json')); running = ((Get-CodexAppProcesses).Count -gt 0)
  }
}

# Before the first install: remember what was there, once, so "restore" can put it back
function Invoke-Snapshot {
  if (Test-Path -LiteralPath (Join-Path $OriginalDir 'state.json')) { Result @{ ok = $true; existed = $true }; return }
  New-Item -ItemType Directory -Force $OriginalDir | Out-Null
  if (Test-Path -LiteralPath $ConfigPath) { Copy-Item -LiteralPath $ConfigPath (Join-Path $OriginalDir 'config.toml') }
  $auth = Read-Text $AuthPath
  if ($null -ne $auth) { [IO.File]::WriteAllBytes((Join-Path $OriginalDir 'auth.json.dpapi'), [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($auth), $null, 'CurrentUser')) }
  $state = @{
    takenAt = (Get-Date -Format 's'); configExisted = (Test-Path -LiteralPath $ConfigPath); authExisted = ($null -ne $auth)
    catalogExisted = (Test-Path -LiteralPath $CatalogPath); codexInstalled = [bool](Get-CodexPackage); zhLauncher = [bool](Get-Launcher)
  }
  Write-Text (Join-Path $OriginalDir 'state.json') ($state | ConvertTo-Json)
  Log "snapshot: $($state | ConvertTo-Json -Compress)"
  Result @{ ok = $true; existed = $false }
}

function Invoke-Switch($a) {
  $kind = "$($a.kind)"
  $cur = Get-Current
  # Remember what the config holds now, so switching back later needs no key and no login
  if ($cur.kind -eq 'openai' -and $cur.auth) { Save-Secret 'openai-auth' $cur.auth }
  if ($cur.kind -like 'zhipu-*') { $null = Get-ZhipuKey }

  Step backup start '备份现在的配置'
  $backup = Backup-Current $kind
  Step backup done '已备份'

  Step write start '准备新配置'
  $lines = $cur.lines
  $catalogLine = if (Test-Path -LiteralPath $CatalogPath) { 'model_catalog_json = "' + ($CatalogPath -replace '\\', '\\' -replace '"', '\"') + '"' }
  $zhipuTable = @('name = "智谱 GLM"', "base_url = `"$ZhipuBaseUrl`"", 'wire_api = "responses"', 'requires_openai_auth = true')
  $candidates = @(); $authText = $null; $needLogin = $false
  switch ($kind) {
    'zhipu-free' {
      $key = Get-ZhipuKey
      if (-not $key) { Step write fail '还没有智谱 Key：先在首页完成一次安装'; Result @{ ok = $false; reason = '还没有智谱 Key' }; return }
      $authText = "{`"OPENAI_API_KEY`":`"$key`"}`n"
      $candidates = @(if ($a.model) { "$($a.model)" }) + $FreeModels | Select-Object -Unique
      $build = { param($m) Set-Config $lines @{ model_provider = 'model_provider = "zhipu"'; model = "model = `"$m`""; model_catalog_json = $catalogLine } @{ 'model_providers.zhipu' = $zhipuTable } }
    }
    'zhipu-paid' {
      $key = Get-ZhipuKey
      if (-not $key) { Step write fail '还没有智谱 Key：先在首页完成一次安装'; Result @{ ok = $false; reason = '还没有智谱 Key' }; return }
      $authText = "{`"OPENAI_API_KEY`":`"$key`"}`n"
      $candidates = @($(if ($a.model) { "$($a.model)" } else { 'glm-5' }))
      $build = { param($m) Set-Config $lines @{ model_provider = 'model_provider = "zhipu"'; model = "model = `"$m`""; model_catalog_json = $catalogLine } @{ 'model_providers.zhipu' = $zhipuTable } }
    }
    'openai' {
      $authText = Read-Secret 'openai-auth'
      if (-not $authText) { $needLogin = $true }
      $candidates = @('')
      # The Zhipu-only model menu would hide OpenAI's models, so drop it too
      $build = { param($m) Set-Config $lines @{ model_provider = $null; model = $null; model_catalog_json = $null } @{} }
    }
    'custom' {
      $baseUrl = "$($a.baseUrl)".Trim().TrimEnd('/'); $model = "$($a.model)".Trim(); $key = "$($a.apiKey)".Trim()
      if (-not $key -and (Get-Current).kind -eq 'custom') { $key = Get-AuthKey $cur.auth }
      if (-not $key) { $key = Read-Secret 'custom' }
      if ($baseUrl -notmatch '^https?://[^\s"]+$' -or -not $model -or $model -match '["\s]' -or -not $key -or $key -match '["\s]') {
        Step write fail '地址、Key、模型名要填全（地址以 http:// 或 https:// 开头）'; Result @{ ok = $false; reason = '信息没填全' }; return
      }
      $authText = "{`"OPENAI_API_KEY`":`"$key`"}`n"
      $candidates = @($model)
      $table = @('name = "其他厂商"', "base_url = `"$baseUrl`"", 'wire_api = "responses"', 'requires_openai_auth = true')
      $build = { param($m) Set-Config $lines @{ model_provider = 'model_provider = "custom"'; model = "model = `"$m`""; model_catalog_json = $null } @{ 'model_providers.custom' = $table } }
    }
    default { Step write fail "不认识的选项 $kind"; Result @{ ok = $false; reason = '不认识的选项' }; return }
  }
  Step write done '新配置准备好了'

  $test = $null; $chosen = $null; $newLines = $null
  foreach ($m in $candidates) {
    $newLines = & $build $m
    $testHome = New-TestHome $newLines $authText
    try {
      if ($needLogin) {
        Step login start '在弹出的浏览器里登录你的 OpenAI（ChatGPT）账号'
        $cli = Get-CodexCli
        $old = $env:CODEX_HOME; $env:CODEX_HOME = $testHome
        try { $login = Start-Process -FilePath $cli -ArgumentList 'login' -WorkingDirectory $testHome -WindowStyle Hidden -PassThru } finally { $env:CODEX_HOME = $old }
        if (-not $login.WaitForExit(600000)) { Stop-Process -Id $login.Id -Force -ErrorAction SilentlyContinue }
        $authText = Read-Text (Join-Path $testHome 'auth.json')
        if ("$authText" -notmatch '"tokens"\s*:\s*\{') { Step login fail '没有登录成功（窗口关了，或者十分钟内没登录）'; $test = @{ ok = $false; reason = '没有登录 OpenAI 账号' }; break }
        Step login done '已登录 OpenAI 账号'
        $needLogin = $false
      }
      Step test start $(if ($m) { "测试连通：让 $m 回一句话" } else { '测试连通：让 Codex 回一句话' })
      $test = Test-CodexHome $testHome
    } finally { Remove-Item -LiteralPath $testHome -Recurse -Force -ErrorAction SilentlyContinue }
    if ($test.ok) { $chosen = $m; break }
  }
  if (-not $test.ok) {
    if (-not ($needLogin -or "$($test.reason)" -eq '没有登录 OpenAI 账号')) { Step test fail $test.reason }
    Result @{ ok = $false; reason = $test.reason; detail = $test.detail; backup = $backup }
    return
  }
  Step test done "通了，回复：$($test.reply)"

  Step save start '保存'
  $running = (Get-CodexAppProcesses).Count -gt 0
  Write-Text $ConfigPath (Join-Lines $newLines)
  Write-Text $AuthPath $authText
  if ($kind -eq 'custom') { Save-Secret 'custom' ((Get-AuthKey $authText)) }
  if ($kind -eq 'openai') { Save-Secret 'openai-auth' $authText }
  Step save done $(if ($running) { '已保存，Codex 重新打开后生效' } else { '已保存' })
  Log "switched to $kind $chosen"
  Result @{ ok = $true; kind = $kind; model = $chosen; reply = $test.reply; running = $running }
}

function Invoke-Edition($a) {
  $edition = if ("$($a.edition)" -eq 'en') { 'en' } else { 'zh' }
  Step edition start $(if ($edition -eq 'zh') { '切换到汉化版' } else { '切换到英文原版' })
  $script = $env:BUDDY_CODEX_PS1
  if (-not $script -or -not (Test-Path -LiteralPath $script)) { Step edition fail '找不到安装脚本'; Result @{ ok = $false; reason = '找不到安装脚本' }; return }
  $env:CODEX_SETUP_ACTION = 'edition'; $env:CODEX_SETUP_EDITION = $edition; $env:CODEX_SETUP_STEPS = '1'
  $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "iex ([IO.File]::ReadAllText('$($script -replace "'", "''")', [Text.Encoding]::UTF8))" 2>&1
  $ok = $LASTEXITCODE -eq 0
  Log "edition script exit=$LASTEXITCODE out=$(@($out) -join ' | ')"
  if ($ok) {
    $null = Backup-Current 'edition'
    $lines = Set-TableValue (Read-Lines $ConfigPath) 'desktop' 'localeOverride' $(if ($edition -eq 'zh') { 'localeOverride = "zh-CN"' } else { 'localeOverride = "en-US"' })
    Write-Text $ConfigPath (Join-Lines $lines)
  }
  $running = (Get-CodexAppProcesses).Count -gt 0
  if ($ok) { Step edition done $(if ($running) { '已切换，Codex 重新打开后生效' } else { '已切换' }) } else { Step edition fail '没切换成功，复制日志发给我们' }
  Result @{ ok = $ok; edition = $edition; running = $running }
}

function Invoke-Settings($a) {
  $null = Backup-Current 'settings'
  $top = @{}
  if ($null -ne $a.askBeforeEdit) {
    # Ask before editing: read-only sandbox, so every file change needs a yes. Not asking: edits inside the project
    # folder go ahead, anything beyond it still asks
    $top.sandbox_mode = if ($a.askBeforeEdit) { 'sandbox_mode = "read-only"' } else { 'sandbox_mode = "workspace-write"' }
    $top.approval_policy = 'approval_policy = "on-request"'
  }
  if ($a.effort -in 'low', 'medium', 'high') { $top.model_reasoning_effort = "model_reasoning_effort = `"$($a.effort)`"" }
  $lines = Set-Config (Read-Lines $ConfigPath) $top @{}
  Write-Text $ConfigPath (Join-Lines $lines)
  Log "settings: $($top.Values -join '; ')"
  Result @{ ok = $true; running = ((Get-CodexAppProcesses).Count -gt 0) }
}

# Put back what was there before the first install: config, key file, model menu, edition, and Codex itself if we
# installed it
function Invoke-Restore {
  $statePath = Join-Path $OriginalDir 'state.json'
  if (-not (Test-Path -LiteralPath $statePath)) { Step restore fail '没有找到安装前的记录'; Result @{ ok = $false; reason = '没有找到安装前的记录' }; return }
  $state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
  $null = Backup-Current 'before-restore'
  $running = Get-CodexAppProcesses
  if ($running) {
    Step close start '先关掉正在运行的 Codex'
    foreach ($p in $running) { taskkill.exe /F /T /PID $p.ProcessId 2>&1 | Out-Null }
    Start-Sleep -Seconds 2
    Step close done '已关掉 Codex'
  }
  Step files start '还原 Codex 的配置'
  if ($state.configExisted) { Copy-Item -LiteralPath (Join-Path $OriginalDir 'config.toml') $ConfigPath -Force } else { Remove-Item -LiteralPath $ConfigPath -Force -ErrorAction SilentlyContinue }
  $encrypted = Join-Path $OriginalDir 'auth.json.dpapi'
  if ($state.authExisted -and (Test-Path -LiteralPath $encrypted)) {
    Write-Text $AuthPath ([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($encrypted), $null, 'CurrentUser')))
  } else { Remove-Item -LiteralPath $AuthPath -Force -ErrorAction SilentlyContinue }
  if (-not $state.catalogExisted) { Remove-Item -LiteralPath $CatalogPath -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $SecretDir -Recurse -Force -ErrorAction SilentlyContinue
  Step files done '配置已还原'
  if (-not $state.zhLauncher -and (Get-Launcher)) {
    Step edition start '去掉汉化版的快捷方式'
    $env:BUDDY_ARGS = ''
    Invoke-Edition @{ edition = 'en' } | Out-Null
  }
  $uninstalled = $true
  if (-not $state.codexInstalled -and ($pkg = Get-CodexPackage)) {
    Step uninstall start '卸载 Codex（安装前这台电脑没有它）'
    try { Remove-AppxPackage -Package $pkg.PackageFullName -ErrorAction Stop; Step uninstall done '已卸载 Codex' }
    catch {
      Log "uninstall failed: $($_.Exception.Message)"
      $uninstalled = $false
      Step uninstall fail '没能自动卸载：打开「设置 → 应用」，找到「ChatGPT」点卸载'
    }
  }
  Remove-Item -LiteralPath $OriginalDir -Recurse -Force -ErrorAction SilentlyContinue
  Result @{ ok = $true; uninstalled = $uninstalled }
}

function Invoke-Open {
  $pkg = Get-CodexPackage
  if (-not $pkg) { Result @{ ok = $false; reason = '还没装 Codex' }; return }
  $launcher = Get-Launcher
  if ($launcher) { Start-Process conhost.exe -ArgumentList "--headless powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcher`"" }
  else {
    $appId = (Get-AppxPackageManifest $pkg).Package.Applications.Application.Id | Select-Object -First 1
    Start-Process "shell:AppsFolder\$($pkg.PackageFamilyName)!$appId"
  }
  Result @{ ok = $true }
}

# Keep a copy of the app next to its data and put it in the Start menu, so the user finds it again after deleting the
# download. WScript.Shell cannot save a shortcut whose name is outside the system code page, so save under ASCII, then rename
function Invoke-SelfInstall {
  $exe = "$env:BUDDY_EXE"
  if (-not $exe -or -not (Test-Path -LiteralPath $exe)) { Result @{ ok = $false }; return }
  $target = Join-Path $BuddyDir 'codex-buddy.exe'
  try {
    if ($exe -ne $target) { Copy-Item -LiteralPath $exe $target -Force -ErrorAction Stop }
    $programs = [Environment]::GetFolderPath('Programs')
    $tmp = Join-Path $programs 'codex-buddy.lnk'
    $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($tmp)
    $shortcut.TargetPath = $target; $shortcut.WorkingDirectory = $BuddyDir; $shortcut.IconLocation = "$target,0"
    $shortcut.Save()
    Move-Item -LiteralPath $tmp (Join-Path $programs 'Codex 搭子.lnk') -Force
    Result @{ ok = $true }
  } catch { Log "self install failed: $($_.Exception.Message)"; Result @{ ok = $false } }
}

# The newest install log and buddy log, for "copy log". Logs never hold keys; Hide runs again anyway
function Invoke-Log {
  $dir = Join-Path $HumansLiveDir 'logs'
  $text = ''
  foreach ($pattern in 'codex-*.log', 'buddy-*.log') {
    $file = Get-ChildItem -Path $dir -Filter $pattern -ErrorAction SilentlyContinue | Where-Object { $_.FullName -ne $LogFile } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($file) { $text += "===== $($file.Name) =====`n" + [IO.File]::ReadAllText($file.FullName) + "`n" }
  }
  $os = Get-CimInstance Win32_OperatingSystem
  $text = "Codex 搭子 日志  $($os.Caption) $($os.BuildNumber)  $(Get-Date -Format 's')`n" + $text
  if ($text.Length -gt 200000) { $text = $text.Substring($text.Length - 200000) }
  Result @{ ok = $true; text = (Hide $text) }
}

# ================= Main =================
$action = "$env:BUDDY_ACTION"
$arguments = if ($env:BUDDY_ARGS) { $env:BUDDY_ARGS | ConvertFrom-Json } else { [pscustomobject]@{} }
Log "action: $action"
try {
  switch ($action) {
    'status' { Invoke-Status }
    'snapshot' { Invoke-Snapshot }
    'switch' { Invoke-Switch $arguments }
    'edition' { Invoke-Edition $arguments }
    'settings' { Invoke-Settings $arguments }
    'restore' { Invoke-Restore }
    'open' { Invoke-Open }
    'selfinstall' { Invoke-SelfInstall }
    'log' { Invoke-Log }
    default { Result @{ ok = $false; reason = "unknown action $action" } }
  }
} catch {
  Log "EXCEPTION $($_.Exception.Message) AT $($_.InvocationInfo.PositionMessage -replace "`r?`n", ' | ')"
  Result @{ ok = $false; reason = "出了意外：$(Hide $_.Exception.Message)" }
}
