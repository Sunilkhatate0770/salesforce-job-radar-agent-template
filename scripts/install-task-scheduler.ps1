param(
  [string]$TaskName = "Salesforce Job Radar Agent Fallback",
  [int]$IntervalMinutes = 10
)

$ErrorActionPreference = "Stop"

if ($IntervalMinutes -lt 1) {
  throw "IntervalMinutes must be at least 1"
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RunScript = Join-Path $ScriptDir "run-agent-fallback.ps1"

if (-not (Test-Path $RunScript)) {
  throw "Fallback run script not found at $RunScript"
}

$taskCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$RunScript`""

schtasks.exe /Create `
  /TN $TaskName `
  /SC DAILY `
  /ST 09:00 `
  /TR $taskCommand `
  /F | Out-Host

Write-Host "Installed scheduled task '$TaskName' every $IntervalMinutes minute(s)."
