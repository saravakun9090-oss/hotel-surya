<#
Set Netlify VITE_MONGO_API_BASE helper.

Usage examples:
  # Interactive: provide the service URL and optionally the Netlify site id
  .\set_netlify_env.ps1 -ServiceUrl 'https://hotel-app-backend.onrender.com' -SiteId 'your-netlify-site-id'

  # Non-interactive: provide a Netlify build hook to trigger a deploy after setting env
  .\set_netlify_env.ps1 -ServiceUrl 'https://hotel-app-backend.onrender.com' -BuildHookUrl 'https://api.netlify.com/build_hooks/xxx'

Notes:
- This script uses the Netlify CLI if present to set the environment variable on the site.
- You can install the Netlify CLI with: npm install -g netlify-cli
- If you don't want to use the CLI, the script prints the exact commands and UI steps to follow.
- Setting the environment variable does not always auto-trigger a deploy. You can trigger a deploy from the Netlify UI (Site → Deploys → Trigger deploy) or use a build hook to automatically start a deploy (provide BuildHookUrl).

Parameters:
  -ServiceUrl  (string) The base URL of your backend, for example https://hotel-app-backend.onrender.com
  -SiteId      (string) Optional Netlify site id (if not provided the CLI may prompt when run)
  -BuildHookUrl (string) Optional Netlify build hook URL to POST to after setting env var
#>
param(
  [Parameter(Mandatory=$true)] [string]$ServiceUrl,
  [Parameter(Mandatory=$false)] [string]$SiteId,
  [Parameter(Mandatory=$false)] [string]$BuildHookUrl
)

$varName = 'VITE_MONGO_API_BASE'
$varValue = "$ServiceUrl/api"

Write-Host "Preparing to set Netlify env var $varName = $varValue"

function Has-NetlifyCLI {
  try { netlify --version > $null 2>&1; return $true } catch { return $false }
}

if (Has-NetlifyCLI) {
  Write-Host "Netlify CLI detected."
  if ($SiteId) {
    Write-Host "Setting via: netlify env:set $varName $varValue --site $SiteId"
    netlify env:set $varName $varValue --site $SiteId
  } else {
    Write-Host "Setting via: netlify env:set $varName $varValue (will prompt for site if needed)"
    netlify env:set $varName $varValue
  }
  Write-Host "If that succeeded, you can trigger a deploy from the Netlify UI (Site → Deploys → Trigger deploy) or use a build hook."
} else {
  Write-Host "Netlify CLI not found. Install it to set the env var from the CLI, or use the Netlify UI: https://app.netlify.com/sites/<your-site>/settings/environment"
  Write-Host "UI steps: Site → Settings → Build & deploy → Environment → Edit variables → Add variable"
  Write-Host "Variable name: $varName"
  Write-Host "Variable value: $varValue"
}

if ($BuildHookUrl) {
  Write-Host "Triggering build hook: $BuildHookUrl"
  try {
    Invoke-RestMethod -Uri $BuildHookUrl -Method Post -UseBasicParsing
    Write-Host "Build hook triggered. Check Netlify Deploys for progress."
  } catch {
    Write-Host "Failed to trigger build hook: $($_.Exception.Message)" -ForegroundColor Yellow
  }
} else {
  Write-Host "No build hook provided. To trigger a new deploy automatically create a build hook in Netlify (Site → Settings → Build & deploy → Build hooks) and pass its URL with -BuildHookUrl." -ForegroundColor Cyan
}

Write-Host "Done." -ForegroundColor Green
