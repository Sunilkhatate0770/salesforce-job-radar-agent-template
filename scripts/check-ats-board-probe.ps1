param(
  [string]$ProjectRef = "olfppuhztjeutvougzfx",
  [string]$Provider = ""
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

$args = @("src/tools/atsBoardProbe.js")
if ($Provider) {
  $args += "--provider=$Provider"
}

node @args
