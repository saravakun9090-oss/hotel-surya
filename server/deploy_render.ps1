<#
PowerShell helper to create a Render Web Service using your Render API key.
Usage (PowerShell):
  $env:RENDER_API_KEY = 'your-render-api-key'
  .\deploy_render.ps1 -RepoOwner 'your-github-user' -RepoName 'hotel-surya' -Branch 'main' -ServiceName 'hotel-app-backend'

Notes:
- This script calls the Render API and will create a Web Service that deploys the `server` folder of your repo.
- You must have your GitHub repo connected to Render (Render needs access to your GitHub account) OR include the `repository` field with installId in the request. If the API call returns a permissions error, use the Render UI to connect GitHub and then re-run.
- Do NOT put your Mongo connection string on the command line; you'll be prompted to set env vars via the Render dashboard after creation, or the script can set them if you pass them as environment variables (RENDER_MONGO_URI variable) — but it's safer to set env vars in the Render dashboard.
#>
param(
  [Parameter(Mandatory=$true)][string]$RepoOwner,
  [Parameter(Mandatory=$true)][string]$RepoName,
  [Parameter(Mandatory=$false)][string]$Branch = 'main',
  [Parameter(Mandatory=$false)][string]$ServiceName = 'hotel-app-backend',
  [Parameter(Mandatory=$false)][string]$Region = 'oregon'
)

if (-not $env:RENDER_API_KEY) {
  Write-Host "Set environment variable RENDER_API_KEY with your Render API key before running this script." -ForegroundColor Yellow
  Exit 1
}

$apiUrl = 'https://api.render.com/v1/services'

# Compose request body
$body = @{
  name = $ServiceName
  env = 'node'
  type = 'web'
  branch = $Branch
  repo = "https://github.com/$RepoOwner/$RepoName"
  # root directory is server
  rootDirectory = 'server'
  plan = 'free'
} | ConvertTo-Json -Depth 6

Write-Host "Creating Render service ($ServiceName) for repo $RepoOwner/$RepoName on branch $Branch..."

try {
  $resp = Invoke-RestMethod -Uri $apiUrl -Method Post -Headers @{"Authorization" = "Bearer $env:RENDER_API_KEY"; "Content-Type" = "application/json"} -Body $body -ErrorAction Stop
  Write-Host "Service created. Service ID: $($resp.id)" -ForegroundColor Green
  Write-Host "Service URL: $($resp.serviceDetailURL)"
  Write-Host "Render may take a minute to start the initial build. Open the Render dashboard to set environment variables (MONGO_URI etc) if not set."
  Write-Host "If you prefer, you can set env vars with the Render UI: Settings → Environment → Add Environment Variable"
} catch {
  Write-Host "Failed to create service via API: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "If this fails due to GitHub permissions, open the Render dashboard, connect your GitHub repo, then re-run the script or create the service through the UI." -ForegroundColor Yellow
  Exit 1
}

# Optional: if user provides MONGO_URI in environment variable RENDER_MONGO_URI, set it now
if ($env:RENDER_MONGO_URI) {
  Write-Host "Setting MONGO_URI and other env vars for the created service..."
  $serviceId = $resp.id
  $envApi = "https://api.render.com/v1/services/$serviceId/env-vars"
  $envBody = @(
    @{ key = 'MONGO_URI'; value = $env:RENDER_MONGO_URI },
    @{ key = 'DB_NAME'; value = ($env:RENDER_DB_NAME ? $env:RENDER_DB_NAME : 'hotel_surya') },
    @{ key = 'COLLECTION'; value = ($env:RENDER_COLLECTION ? $env:RENDER_COLLECTION : 'app_state') }
  ) | ConvertTo-Json -Depth 6
  try {
    $r2 = Invoke-RestMethod -Uri $envApi -Method Post -Headers @{"Authorization" = "Bearer $env:RENDER_API_KEY"; "Content-Type" = "application/json"} -Body $envBody -ErrorAction Stop
    Write-Host "Environment variables set."
  } catch {
    Write-Host "Failed to set env vars automatically: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "You can set them manually in the Render dashboard." -ForegroundColor Yellow
  }
}

Write-Host "Done. Open Render dashboard to monitor build and set any additional env vars (like MONGO_URI) if needed." -ForegroundColor Green
