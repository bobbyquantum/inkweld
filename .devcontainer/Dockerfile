# Inkweld Development Container
# Self-contained development image with all tools for the Inkweld stack:
# - Bun runtime (backend + package management)
# - Node.js 22 LTS (Angular dev server, docs site)
# - Build tools for native modules (better-sqlite3, leveldb, sharp)

FROM mcr.microsoft.com/devcontainers/base:bookworm

LABEL maintainer="bobbyquantum"
LABEL description="Inkweld development environment - Hono/Bun backend, Angular frontend, Docusaurus docs"

# Versions
ARG BUN_VERSION=1.3.6
ARG NODE_VERSION=22

# Install system dependencies for native modules and development
RUN apt-get update && apt-get install -y \
  # Build essentials for native Node.js modules
  python3 \
  make \
  g++ \
  # LevelDB / classic-level build dependencies
  libleveldb-dev \
  # Sharp (image processing) dependencies
  libvips-dev \
  # Fonts for Sharp SVG text rendering
  fontconfig \
  fonts-dejavu-core \
  # Git LFS for large files
  git-lfs \
  # Useful dev tools
  curl \
  wget \
  jq \
  sqlite3 \
  # Clean up
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* \
  && fc-cache -fv

# Install Node.js 22 LTS via NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
  && apt-get install -y nodejs \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g npm@latest

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" \
  && ln -s /root/.bun/bin/bun /usr/local/bin/bun \
  && ln -s /root/.bun/bin/bunx /usr/local/bin/bunx

# Install global npm packages (Angular CLI, Playwright deps, etc.)
RUN npm install -g \
  @angular/cli@21 \
  typescript \
  wrangler \
  && npx playwright install-deps

# Set up non-root user paths for Bun
USER vscode
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
ENV PATH="/home/vscode/.bun/bin:${PATH}"

# Pre-configure Angular CLI: disable prompts and enable autocompletion
RUN mkdir -p /home/vscode/.angular \
  && echo '{"version":1,"cli":{"completion":{"prompted":true},"analytics":false}}' > /home/vscode/.angular-config.json \
  && echo 'source <(ng completion script)' >> /home/vscode/.bashrc

# Pre-install Playwright browsers for e2e testing
RUN npx playwright install chromium firefox

# Switch back to root for final setup
USER root

# Environment variables
ENV NODE_ENV=development
ENV SHELL=/bin/bash

# Working directory
WORKDIR /workspaces/inkweld

# Expose development ports
# 4200 - Angular dev server
# 8333 - Hono/Bun backend
# 3000 - Docusaurus docs site
EXPOSE 4200 8333 3000

# Default command
CMD ["sleep", "infinity"]
