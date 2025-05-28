# CI/CD Pipeline

This document describes the automated CI/CD pipeline for Inkweld.

## Overview

The project uses GitHub Actions for continuous integration and deployment, with automatic Docker image publishing to GitHub Container Registry (GHCR).

## Workflows

### 1. Main CI Pipeline (`.github/workflows/ci.yml`)

**Triggers:**
- Push to `main` branch
- Pull requests to `main` branch

**Jobs:**

#### Test Job
- Runs on Ubuntu (with matrix support for other OS)
- Sets up Bun runtime
- Installs dependencies for both frontend and backend
- Runs linting checks
- Executes all tests

#### Docker Publish Job
- **Only runs on pushes to main branch** (not on PRs)
- Depends on successful test completion
- Builds the frontend application
- Creates and publishes Docker images to GHCR
- Uses Docker layer caching for faster builds

**Published Tags:**
- `ghcr.io/owner/inkweld:latest` - Latest build from main
- `ghcr.io/owner/inkweld:main-<commit-sha>` - Specific commit

### 2. Release Pipeline (`.github/workflows/release.yml`)

**Triggers:**
- GitHub releases (published)
- Git tags matching `v*` pattern

**Features:**
- Automatic semantic versioning
- Multiple tag formats for flexibility
- Always updates `latest` tag for releases

**Published Tags:**
- `ghcr.io/owner/inkweld:v1.0.0` - Exact version
- `ghcr.io/owner/inkweld:1.0` - Major.minor
- `ghcr.io/owner/inkweld:1` - Major version
- `ghcr.io/owner/inkweld:latest` - Latest release

### 3. Manual Docker Publish (`.github/workflows/docker-publish.yml`)

**Triggers:**
- Manual workflow dispatch

**Features:**
- Custom tag input
- Option to also tag as `latest`
- Useful for hotfixes or special builds

## Docker Images

### Registry
All images are published to GitHub Container Registry (GHCR):
- Registry: `ghcr.io`
- Repository: `ghcr.io/<owner>/inkweld`

### Image Contents
- Multi-stage build optimized for production
- Built with Bun runtime
- Includes pre-built frontend static files
- NestJS backend with SQLite support
- Proper file permissions and security

### Using Images

#### Latest Development Build
```bash
docker run -p 8333:8333 ghcr.io/bobbyquantum/inkweld:latest
```

#### Specific Version
```bash
docker run -p 8333:8333 ghcr.io/bobbyquantum/inkweld:v1.0.0
```

#### With Docker Compose
```yaml
services:
  inkweld:
    image: ghcr.io/bobbyquantum/inkweld:latest
    ports:
      - "8333:8333"
    environment:
      - NODE_ENV=production
```

## Build Optimization

### Caching
- Docker layer caching using GitHub Actions cache
- Bun dependency caching
- Frontend build artifact caching

### Security
- Images run as non-root user (`bun`)
- Minimal attack surface
- Production-only dependencies

## Monitoring

### Build Status
- GitHub Actions status badges in README
- Docker image status badge
- Automatic failure notifications

### Image Information
- All images include metadata labels
- Build information embedded
- Traceability to source commits

## Development Workflow

### For Contributors
1. Create feature branch
2. Make changes
3. Push to GitHub
4. CI runs tests automatically
5. Create PR when ready
6. Tests run again on PR
7. Merge to main triggers Docker build

### For Releases
1. Create and publish GitHub release
2. Use semantic versioning (e.g., `v1.0.0`)
3. Release workflow automatically builds and publishes
4. Multiple tags created for flexibility

## Troubleshooting

### Build Failures
- Check GitHub Actions logs
- Verify all tests pass locally
- Ensure Docker build works locally

### Image Issues
- Verify image exists in GHCR
- Check image tags and metadata
- Test image locally before deployment

### Manual Intervention
- Use manual Docker publish workflow
- Can override tags if needed
- Useful for hotfixes or rollbacks 