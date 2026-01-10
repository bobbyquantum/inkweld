#!/bin/bash
# Deploy docs to Cloudflare Pages manually
# Usage: ./deploy-docs.sh
#
# Prerequisites:
# 1. Install wrangler: npm install -g wrangler
# 2. Login to Cloudflare: wrangler login
# 3. Set CLOUDFLARE_ACCOUNT_ID environment variable (optional, wrangler will prompt)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCS_DIR="$PROJECT_ROOT/docs/site"

echo "📚 Building docs for production..."
cd "$PROJECT_ROOT"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  bun install
fi

# Build docs with production URL
cd "$DOCS_DIR"

# Temporarily update URL for production build
sed -i.bak "s|https://preview.inkweld.org|https://docs.inkweld.org|g" docusaurus.config.ts

echo "🔨 Building documentation site..."
bun run build

# Restore the original config
mv docusaurus.config.ts.bak docusaurus.config.ts

echo "🚀 Deploying to Cloudflare Pages..."
wrangler pages deploy build --project-name=inkweld-docs

echo "✅ Docs deployed to https://docs.inkweld.org"
