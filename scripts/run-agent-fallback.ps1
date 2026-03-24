$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoDir = Split-Path -Parent $ScriptDir

Set-Location $RepoDir

$node = (Get-Command node -ErrorAction Stop).Source
& $node "src/tools/fallbackScheduler.js"
exit $LASTEXITCODE
