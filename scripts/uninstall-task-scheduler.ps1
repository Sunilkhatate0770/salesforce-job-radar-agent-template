param(
  [string]$TaskName = "Salesforce Job Radar Agent Fallback"
)

$ErrorActionPreference = "Stop"

schtasks.exe /Delete /TN $TaskName /F | Out-Host
Write-Host "Removed scheduled task '$TaskName'."
