# Ends only the sandbox's Codex instances (command line names a CodexBuddy-Test data dir), never the user's own Codex
$p = Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" | ? { $_.CommandLine -like '*CodexBuddy-Test*' }
$p | % { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
"killed $(@($p).Count)"
"user codex still running: " + @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" | ? { $_.CommandLine -notlike '*CodexBuddy-Test*' }).Count
