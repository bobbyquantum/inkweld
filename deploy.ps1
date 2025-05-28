# Deployment script for Inkweld (PowerShell)
# This script deploys using the pre-built image from GitHub Container Registry

param(
    [string]$GitHubRepositoryOwner = $env:GITHUB_REPOSITORY_OWNER,
    [string]$ImageTag = $env:IMAGE_TAG ?? "latest",
    [string]$Port = $env:PORT ?? "8333"
)

# Check if required parameters are set
if ([string]::IsNullOrEmpty($GitHubRepositoryOwner)) {
    Write-Error "Error: GitHubRepositoryOwner parameter is required"
    Write-Host "Example: .\deploy.ps1 -GitHubRepositoryOwner bobbyquantum"
    Write-Host "Or set environment variable: `$env:GITHUB_REPOSITORY_OWNER = 'bobbyquantum'"
    exit 1
}

Write-Host "Deploying Inkweld..." -ForegroundColor Green
Write-Host "Registry: ghcr.io"
Write-Host "Owner: $GitHubRepositoryOwner"
Write-Host "Image Tag: $ImageTag"
Write-Host "Port: $Port"

# Pull the latest image first (optional, but recommended)
Write-Host "Pulling latest image..." -ForegroundColor Yellow
try {
    docker pull "ghcr.io/$GitHubRepositoryOwner/inkweld:$ImageTag"
} catch {
    Write-Warning "Could not pull image, continuing with local/cached version"
}

# Deploy using docker compose
Write-Host "Starting deployment..." -ForegroundColor Yellow
$env:GITHUB_REPOSITORY_OWNER = $GitHubRepositoryOwner
$env:IMAGE_TAG = $ImageTag
$env:PORT = $Port

docker compose -f compose.deploy.yaml up -d

Write-Host "Deployment complete!" -ForegroundColor Green
Write-Host "Inkweld should be available at: http://localhost:$Port"
Write-Host ""
Write-Host "To view logs: docker compose -f compose.deploy.yaml logs -f"
Write-Host "To stop: docker compose -f compose.deploy.yaml down" 