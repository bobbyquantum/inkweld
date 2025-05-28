#!/bin/bash

# Deployment script for Inkweld
# This script deploys using the pre-built image from GitHub Container Registry

set -e

# Default values
GITHUB_REPOSITORY_OWNER="${GITHUB_REPOSITORY_OWNER:-}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
PORT="${PORT:-8333}"

# Check if required environment variables are set
if [ -z "$GITHUB_REPOSITORY_OWNER" ]; then
    echo "Error: GITHUB_REPOSITORY_OWNER environment variable is required"
    echo "Example: export GITHUB_REPOSITORY_OWNER=bobbyquantum"
    exit 1
fi

echo "Deploying Inkweld..."
echo "Registry: ghcr.io"
echo "Owner: $GITHUB_REPOSITORY_OWNER"
echo "Image Tag: $IMAGE_TAG"
echo "Port: $PORT"

# Pull the latest image first (optional, but recommended)
echo "Pulling latest image..."
docker pull "ghcr.io/${GITHUB_REPOSITORY_OWNER}/inkweld:${IMAGE_TAG}" || echo "Warning: Could not pull image, continuing with local/cached version"

# Deploy using docker compose
echo "Starting deployment..."
GITHUB_REPOSITORY_OWNER="$GITHUB_REPOSITORY_OWNER" \
IMAGE_TAG="$IMAGE_TAG" \
PORT="$PORT" \
docker compose -f compose.deploy.yaml up -d

echo "Deployment complete!"
echo "Inkweld should be available at: http://localhost:${PORT}"
echo ""
echo "To view logs: docker compose -f compose.deploy.yaml logs -f"
echo "To stop: docker compose -f compose.deploy.yaml down" 