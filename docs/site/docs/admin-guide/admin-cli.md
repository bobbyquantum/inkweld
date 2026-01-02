---
title: Admin CLI Reference
description: Approve users, inspect stats, and manage projects directly from the Bun CLI.
---

## Overview

`backend/admin-cli.ts` exposes a Bun-powered command-line interface that talks to the same database and LevelDB stores as the API. Use it to review registrations, approve accounts, and inspect instance health without opening the UI.

## Running locally

```bash
cd backend
bun run admin --help
```

The CLI automatically loads `.env` from the project root (or `backend/.env` if it exists), so make sure the database credentials align with the instance you intend to manage.

## User management

The CLI provides commands for managing user accounts, including approving new registrations and enabling/disabling accounts.

## Common commands

```bash
# List pending registrations
bun run admin users pending

# Approve + enable a user
bun run admin users approve <username>

# Review aggregate stats
bun run admin stats
```

All commands accept `--json` if you prefer machine-readable output.

## Inside Docker containers

The bundled Docker image ships with the CLI and the same dependencies as the backend, which means you can administer a running container without copying files out of it:

```bash
docker exec -it inkweld-backend \
  bun run admin-cli.ts users approve <username>
```

Because the command executes inside the container, it reuses every environment variable you passed to `docker run`/Compose—no need to maintain duplicate `.env` files.

## Safety checklist

- Never point the CLI at production without confirming `DATABASE_URL`, `DATA_PATH`, and `SESSION_SECRET`.
- Stick with read-only commands in recovery scenarios; write operations immediately affect the live project store.
- Rotate credentials after running the CLI on ad-hoc machines, especially when working inside shared containers.
