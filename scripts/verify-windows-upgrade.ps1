param([ValidateSet('backup','verify')][string]$Action = 'backup', [string]$BackupRoot)
$ErrorActionPreference = 'Stop'
$userRoot = 'C:\Users\hwy'
$resultFile = Join-Path $userRoot 'codexbuddy-upgrade-verification.json'
$directories = [ordered]@{
  codex = "$userRoot\.codex"
  buddy = "$userRoot\AppData\Local\CodexBuddy"
  browser = "$userRoot\AppData\Roaming\codex-buddy"
  codexApp = "$userRoot\AppData\Roaming\Codex"
}
function Digest([string]$text) {
  $hash = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))).Replace('-','').ToLowerInvariant() }
  finally { $hash.Dispose() }
}
function FileManifest([string]$directory) {
  $entries = @()
  if (-not (Test-Path -LiteralPath $directory)) { return $entries }
  foreach ($file in Get-ChildItem -LiteralPath $directory -File -Recurse -Force) {
    if ($file.Name -match '\.(guard|lock)$') { continue }
    $relative = $file.FullName.Substring($directory.Length).TrimStart('\')
    $entries += [ordered]@{ path=$relative; size=$file.Length; sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash }
  }
  return $entries
}
function Selection {
  $file = Join-Path $directories.buddy 'state.json'
  if (-not (Test-Path $file)) { return $null }
  $state = [IO.File]::ReadAllText($file) | ConvertFrom-Json
  return [ordered]@{ keys=(Digest ($state.keys | ConvertTo-Json -Depth 20 -Compress)); active=$state.active; order=$state.order; zh=$state.zh; custom=$state.custom }
}
try {
  if (Get-Process CodexBuddy,ChatGPT -ErrorAction SilentlyContinue) { throw 'Close Windows CodexBuddy and ChatGPT before taking stable data snapshots.' }
  if ($Action -eq 'backup') {
    $BackupRoot = Join-Path $userRoot ('codexbuddy-upgrade-backups\'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
    & icacls.exe $BackupRoot /inheritance:r /grant:r 'DESKTOP-UNM04EU\hwy:(OI)(CI)F' 'SYSTEM:(OI)(CI)F' 'Administrators:(OI)(CI)F' | Out-Null
    $manifests = [ordered]@{}
    foreach ($name in $directories.Keys) {
      $source = $directories[$name]
      if (-not (Test-Path -LiteralPath $source)) { continue }
      $destination = Join-Path $BackupRoot $name
      & robocopy.exe $source $destination /E /XJ /R:1 /W:1 /COPY:DAT /DCOPY:DAT /NFL /NDL /NJH /NJS /NP /XF *.guard *.lock | Out-Null
      if ($LASTEXITCODE -ge 8) { throw "Backup failed: $name" }
      $manifests[$name] = @(FileManifest $source)
      $copied = @(FileManifest $destination)
      if ((Digest ($manifests[$name] | ConvertTo-Json -Depth 5 -Compress)) -ne (Digest ($copied | ConvertTo-Json -Depth 5 -Compress))) { throw "Backup verification failed: $name" }
    }
    $snapshot = [ordered]@{ backup=$BackupRoot; selection=(Selection); manifests=$manifests }
    $snapshot | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 (Join-Path $BackupRoot 'snapshot.json')
    [ordered]@{ok=$true; phase='backup'; backup=$BackupRoot; counts=@($manifests.Keys | ForEach-Object { [ordered]@{name=$_; files=$manifests[$_].Count} })} | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $resultFile
  } else {
    $snapshot = [IO.File]::ReadAllText((Join-Path $BackupRoot 'snapshot.json')) | ConvertFrom-Json
    $checked = 0
    # Chat sessions/history and authentication are user data. Logs and runtime caches may legitimately change.
    foreach ($file in @($snapshot.manifests.codex)) {
      if ($file.path -notmatch '^(sessions|archived_sessions)\\|^(history\.jsonl|auth\.json|state_\d+\.sqlite.*)$') { continue }
      $current = Join-Path $directories.codex $file.path
      if (-not (Test-Path -LiteralPath $current) -or (Get-FileHash -LiteralPath $current -Algorithm SHA256).Hash -ne $file.sha256) { throw "Protected user file changed: $($file.path)" }
      $checked++
    }
    $selection = Selection
    if ((Digest ($snapshot.selection | ConvertTo-Json -Depth 20 -Compress)) -ne (Digest ($selection | ConvertTo-Json -Depth 20 -Compress))) { throw 'Saved model selection or encrypted API keys changed' }
    foreach ($file in @($snapshot.manifests.buddy)) {
      if ($file.path -ne 'data-key.bin') { continue }
      if ((Get-FileHash -LiteralPath (Join-Path $directories.buddy $file.path) -Algorithm SHA256).Hash -ne $file.sha256) { throw 'Data encryption key changed' }
    }
    $before = [IO.File]::ReadAllText((Join-Path $BackupRoot 'codex\config.toml'))
    $after = [IO.File]::ReadAllText((Join-Path $directories.codex 'config.toml'))
    # A bridge gets a fresh loopback port after a program restart; the provider, model and all other values must match.
    $pattern = 'http://127\.0\.0\.1:\d+'
    if (($before -replace $pattern,'http://127.0.0.1:PORT') -ne ($after -replace $pattern,'http://127.0.0.1:PORT')) { throw 'Codex configuration changed beyond the ephemeral bridge port' }
    [ordered]@{ok=$true; phase='verify'; backup=$BackupRoot; protectedFiles=$checked; selectionUnchanged=$true; configPreserved=$true; dataKeyPreserved=$true} | ConvertTo-Json | Set-Content -Encoding UTF8 $resultFile
  }
} catch {
  [ordered]@{ok=$false; phase=$Action; backup=$BackupRoot; error=$_.Exception.Message} | ConvertTo-Json | Set-Content -Encoding UTF8 $resultFile
  exit 1
}
