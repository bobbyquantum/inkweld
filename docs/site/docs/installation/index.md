---
slug: /installation
title: Installation
description: Choose the best deployment method for your needs - Docker, Cloudflare Workers, or native Bun binary.
sidebar_position: 3
---

# Installation

Inkweld offers flexible deployment options to suit different needs, from quick local testing to production-ready cloud infrastructure.

## Choose Your Deployment Method

<div class="row" style={{marginTop: '2rem', marginBottom: '2rem'}}>
  <div class="col col--4">
    <div style={{padding: '1.5rem', background: 'var(--ifm-card-background-color)', borderRadius: '12px', height: '100%', border: '2px solid var(--ifm-color-primary)'}}>
      <h3>🐳 Docker</h3>
      <span style={{background: 'var(--ifm-color-primary)', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem'}}>Recommended</span>
      <p style={{marginTop: '1rem'}}>The easiest and most reliable way to deploy Inkweld. Single container with everything included.</p>
      <ul>
        <li>One command to start</li>
        <li>Automatic updates</li>
        <li>Works anywhere Docker runs</li>
      </ul>
      <a href="./docker" class="button button--primary button--block">Docker Guide →</a>
    </div>
  </div>
  <div class="col col--4">
    <div style={{padding: '1.5rem', background: 'var(--ifm-card-background-color)', borderRadius: '12px', height: '100%'}}>
      <h3>☁️ Cloudflare Workers</h3>
      <p style={{marginTop: '1rem'}}>Deploy to Cloudflare's global edge network for low-latency access worldwide.</p>
      <ul>
        <li>Global edge deployment</li>
        <li>Generous free tier</li>
        <li>Managed infrastructure</li>
      </ul>
      <a href="./cloudflare" class="button button--secondary button--block">Cloudflare Guide →</a>
    </div>
  </div>
  <div class="col col--4">
    <div style={{padding: '1.5rem', background: 'var(--ifm-card-background-color)', borderRadius: '12px', height: '100%'}}>
      <h3>⚡ Native Binary</h3>
      <p style={{marginTop: '1rem'}}>Run the standalone Bun binary directly on your server without containerization.</p>
      <ul>
        <li>Minimal overhead</li>
        <li>Direct system access</li>
        <li>Custom integrations</li>
      </ul>
      <a href="./native-bun" class="button button--secondary button--block">Native Guide →</a>
    </div>
  </div>
</div>

## Quick Comparison

| Feature | Docker | Cloudflare | Native |
|---------|--------|------------|--------|
| **Ease of Setup** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Scalability** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Cost** | Your hosting | Free tier available | Your hosting |
| **Offline Support** | ✅ Full | ⚠️ Limited | ✅ Full |
| **Real-time Collab** | ✅ WebSocket | ✅ Durable Objects | ✅ WebSocket |
| **Best For** | Most users | Global teams | Custom setups |

## System Requirements

### Minimum Requirements

- **CPU**: 1 core
- **RAM**: 512MB
- **Storage**: 1GB (plus space for your data)
- **Network**: Stable internet connection for collaboration features

### Recommended for Production

- **CPU**: 2+ cores
- **RAM**: 2GB+
- **Storage**: SSD with 10GB+ free space
- **Network**: Low-latency connection for real-time collaboration

## What's Next?

After installation, you'll want to:

1. **[Configure your instance](/docs/configuration)** - Set up authentication, storage, and optional features
2. **[Create your first project](/docs/user-guide/projects)** - Start writing!
3. **[Set up user management](/docs/admin-guide/overview)** - Manage access and permissions

---

:::tip Need Help?
Check the [Troubleshooting guide](/docs/troubleshooting/logging) if you run into issues, or open an issue on [GitHub](https://github.com/bobbyquantum/inkweld/issues).
:::
