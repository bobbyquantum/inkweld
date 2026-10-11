---
sidebar_position: 1
title: Quick Start
description: Get Inkweld running in minutes.
---

import ThemedImage from '@site/src/components/ThemedImage';

# Quick Start

Get Inkweld running on your machine in minutes.

## Try with Docker

The fastest way to try Inkweld:

```bash
docker run -p 8333:8333 \
  -v inkweld_data:/data \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  -e ALLOWED_ORIGINS=http://localhost:8333 \
  -e WEBAUTHN_RP_ID=localhost \
  ghcr.io/bobbyquantum/inkweld:latest
```

The secret above is generated fresh on each run, which is fine for a trial. For
anything you keep, save one value (for example in a `.env` file passed with
`--env-file`): a new secret signs everyone out and makes stored API keys
unreadable.

Open [http://localhost:8333](http://localhost:8333) and create your first account.
New installs are passwordless: you register with a passkey (your device's
fingerprint, face or PIN, or a security key), and the first account becomes
the administrator. See [Configuration](./configuration) to enable passwords or
email recovery.

## Local Development

Clone and run from source:

```bash
git clone https://github.com/bobbyquantum/inkweld.git
cd inkweld
bun install
npm run dev
```

The frontend runs on port 4200, backend on port 8333.

## Next Steps

<div class="row" style={{marginTop: '2rem'}}>
  <div class="col col--6" style={{marginBottom: '1rem'}}>
    <a href="/features" style={{textDecoration: 'none'}}>
      <div style={{padding: '1.5rem', background: 'var(--ifm-card-background-color)', borderRadius: '12px', height: '100%'}}>
        <h3 style={{marginTop: 0}}>🌟 Features</h3>
        <p>See what Inkweld can do</p>
      </div>
    </a>
  </div>
  <div class="col col--6" style={{marginBottom: '1rem'}}>
    <a href="./installation" style={{textDecoration: 'none'}}>
      <div style={{padding: '1.5rem', background: 'var(--ifm-card-background-color)', borderRadius: '12px', height: '100%'}}>
        <h3 style={{marginTop: 0}}>🚀 Installation</h3>
        <p>Deploy for production</p>
      </div>
    </a>
  </div>
  <div class="col col--6" style={{marginBottom: '1rem'}}>
    <a href="/user-guide/" style={{textDecoration: 'none'}}>
      <div style={{padding: '1.5rem', background: 'var(--ifm-card-background-color)', borderRadius: '12px', height: '100%'}}>
        <h3 style={{marginTop: 0}}>✍️ User Guide</h3>
        <p>Learn how to use Inkweld</p>
      </div>
    </a>
  </div>
  <div class="col col--6" style={{marginBottom: '1rem'}}>
    <a href="./configuration" style={{textDecoration: 'none'}}>
      <div style={{padding: '1.5rem', background: 'var(--ifm-card-background-color)', borderRadius: '12px', height: '100%'}}>
        <h3 style={{marginTop: 0}}>⚙️ Configuration</h3>
        <p>Environment variables and settings</p>
      </div>
    </a>
  </div>
</div>

## Community

- 💬 [GitHub Discussions](https://github.com/bobbyquantum/inkweld/discussions) — Questions and ideas
- 🐛 [Issue Tracker](https://github.com/bobbyquantum/inkweld/issues) — Bugs and feature requests
- 💻 [Source Code](https://github.com/bobbyquantum/inkweld) — MIT licensed
