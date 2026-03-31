param(
  [string]$ProjectRef = "olfppuhztjeutvougzfx",
  [int]$Limit = 5,
  [string[]]$Sources = @("supabase-edge", "github-actions")
)

$ErrorActionPreference = "Stop"

function Get-SupabaseServiceRoleKey {
  param(
    [string]$Ref
  )

  $apiKeysJson = npx supabase projects api-keys --project-ref $Ref -o json
  $apiKeys = $apiKeysJson | ConvertFrom-Json
  $serviceRole = $apiKeys | Where-Object { $_.name -eq "service_role" } | Select-Object -First 1

  if (-not $serviceRole.api_key) {
    throw "Unable to resolve Supabase service_role key for project $Ref"
  }

  return $serviceRole.api_key
}

$env:SUPABASE_URL = "https://$ProjectRef.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = Get-SupabaseServiceRoleKey -Ref $ProjectRef

foreach ($source in $Sources) {
  Write-Host ""
  Write-Host "=== Live health for $source ===" -ForegroundColor Cyan
  node src/tools/coverageReport.js --source=$source --limit=$Limit
}
