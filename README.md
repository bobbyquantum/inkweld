<p align="center">
  <img src="frontend/public/logo.png" alt="Inkweld" height="100">
</p>

<h1 align="center">Inkweld</h1>

<p align="center">
  <strong>Self-hosted collaborative writing platform for novelists & worldbuilders</strong><br>
  Your words, your server, your control.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#status">Status</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#development">Development</a> •
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="MIT License"></a>
  <a href="https://github.com/bobbyquantum/inkweld/actions"><img src="https://img.shields.io/github/actions/workflow/status/bobbyquantum/inkweld/ci.yml?branch=main" alt="Build"></a>
  <a href="https://github.com/bobbyquantum/inkweld/pkgs/container/inkweld"><img src="https://img.shields.io/badge/docker-ghcr.io-blue?logo=docker" alt="Docker"></a>
</p>

---

## Quick Start

```bash
# Pull and run with Docker
docker run -d \
  --name inkweld \
  -p 8333:8333 \
  -e HOST=0.0.0.0 \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  -e WEBAUTHN_RP_ID=your-domain.com \
  -e ALLOWED_ORIGINS=https://your-domain.com \
  -v inkweld_data:/data \
  ghcr.io/bobbyquantum/inkweld:latest
```

Then open `http://localhost:8333` in your browser.

📖 **[Full deployment guide →](docs/site/docs/installation/index.md)**

---

## Features

**Write together, or alone.** Work entirely in your browser with no server, keep writing across your devices through your own cloud storage, or connect to an Inkweld server for real-time collaboration.

**Build your world as you write.** Create characters, locations, factions — whatever your story needs. Link them together with relationships, and reference them directly in your prose with @mentions.

**Own your data.** Many hosting options are supported.  Native sync server binaries (thanks to Bun), self contained Docker images, and support for Cloudflare free tier deployment.

**Export when you're ready.** PDF, EPUB, Markdown, HTML. Configurable publish plans let you publish multiple asset variants from a single project.

### Three ways to use it

| | Browser | Cloud Sync | Inkweld Server |
|---|:---:|:---:|:---:|
| Where your writing lives | This browser only | Your own Dropbox, Google Drive or Nextcloud | An Inkweld server |
| Account needed | None | Your cloud provider account | Inkweld account on that server |
| Works offline | ✅ | ✅ (syncs when back online) | ✅ (syncs when back online) |
| Use on several devices | ⬜ | ✅ | ✅ |
| Real-time co-editing, presence, cursors | ⬜ | ⬜ | ✅ |
| Share projects with collaborators | ⬜ | ⬜ | ✅ |
| Version history & snapshots | ✅ local | ✅ synced | ✅ synced |
| Media library & covers | ✅ | ✅ | ✅ |
| Publishing (PDF, EPUB, HTML…) | ✅ | ✅ | ✅ |
| Server AI features, MCP for AI assistants | ⬜ | ⬜ | ✅ (if the server enables them) |
| Browser AI agents (WebMCP), after you choose Allow AI | ✅ | ✅ | ✅ |
| Backup | Export archive | Continuous mirror + export archive | Server + export archive |
| Move to another mode later | ✅ | ✅ | ✅ |
| Cost to run | Free | Free (your storage quota) | Self-host, or a hosted server |

📋 **[Full feature list →](#feature-list)**

---

## Status

### 1.0 beta

- Inkweld is feature complete for 1.0 and in beta: the focus until 1.0.0 is testing and bug fixing. Please report problems on the [issue tracker](https://github.com/bobbyquantum/inkweld/issues).
- Releases follow [Semantic Versioning](https://semver.org/), and the [changelog](CHANGELOG.md) lists what changed in each one.
- Docker images are tagged per release: `ghcr.io/bobbyquantum/inkweld:1.0.0-beta.1` and so on, plus `:beta` for the newest beta. `:latest` follows the betas until 1.0.0 and stable releases after it; `:dev` follows `main`.
- **From 1.0.0-beta.1 on, there is always an automatic upgrade path.** Any release can be upgraded to any later release without exporting and re-importing your work: the Docker/Bun server migrates its database on start (Cloudflare deployments with `wrangler d1 migrations apply`), the app upgrades the data it keeps on your device, and project archives exported by any release stay importable. Back up before upgrading all the same.
- Builds from before 1.0.0-beta.1 had no such promise. The database migrations were squashed into a single baseline for 1.0: a database that was fully migrated before the squash (commit `a49deaef`) upgrades cleanly; an older one must first be started on a build from just before the squash so its remaining migrations run, or be reset.

---

## Feature List

Everything below ships in 1.0. New features are driven by what people using Inkweld ask for: suggest one in [Discussions](https://github.com/bobbyquantum/inkweld/discussions).

- **Projects:** home screen with covers, search, sorting and pinning; drag-and-drop project tree with unlimited folder nesting; project templates for worldbuilding, tabletop RPGs and scripts, with an illustrated tabletop RPG demo; rename; archives (`.inkweld.zip`) to back up, restore or duplicate a project.
- **Writing:** rich-text editor with tables, images, links and keyboard shortcuts; scenes and notes with synopsis, status and word targets; corkboard and outline views of a folder; conversation scenes written as speech bubbles, with a script view; find and replace; zen mode; snapshots (named and automatic); threaded comments; writing statistics.
- **Search and navigation:** quick open (Ctrl/Cmd+P), find in document (Ctrl/Cmd+F), project-wide full-text search (Ctrl/Cmd+Shift+F) with tag, type, relationship and template filters; breadcrumbs; pinned items; recent files; mobile-friendly layout.
- **Worldbuilding:** templates for characters, places, factions and more, edited in a live template editor, with per-element customisation; relationships with backlinks; @mentions in prose; tags; custom calendars; random name, place and prompt generators.
- **Media library:** images stored on the device and synced to the server; paste or drop images into documents; project and element covers; filtering, search and tags.
- **Collaboration:** real-time co-editing with presence and cursors; sharing with viewer and editor roles; offline-first with sync on reconnect; move a project from a Browser profile to a server later; activity feed.
- **Relationship charts:** graph and hierarchy layouts, filtered by relationship and element type, exported as PNG or SVG.
- **Canvas and maps:** layered freeform canvas with drawing tools, shapes, text, images and gradient fills; pan, zoom and touch support; size and crop frames exported as PNG/SVG or used as the project cover; interactive maps with background images, pins and regions linked to elements.
- **Timelines:** custom time systems, eras, events, and timelines built automatically from element dates.
- **Publishing:** publish plans for EPUB, PDF (Typst), Markdown, HTML and a multi-page website, with typography presets, per-section style overrides, two-column layouts, full-page covers and sourcebook-style worldbuilding entries.
- **Accounts and security:** passkeys by default, with optional magic-link recovery, passwords (with email reset) and GitHub sign-in; user approval; CSRF protection and a Content-Security-Policy.
- **Administration:** admin dashboard for users, settings, AI providers and announcements; custom branding and legal pages; per-user storage quotas; production logging.
- **Self-hosting:** Docker image and Compose, native Bun server, or Cloudflare Workers; Home Assistant app; installable web app (PWA) on desktop and mobile, with an in-app install prompt.
- **Optional AI features** (off by default: an admin enables them and each user opts in with Allow AI; see [AI stance](#data-security--ai-stance)): image generation (OpenAI, OpenRouter, Fal.ai, Stable Diffusion) with model profiles, worldbuilding context and reference images; prompt optimisation; grammar and style suggestions; an MCP server for AI assistants; WebMCP tools for AI agents built into the browser.

---

## Architecture

Inkweld has two parts that can run together or separately, plus an optional Cloud Sync mode that needs neither an Inkweld server nor an account:

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/architecture-dark.svg">
    <img alt="Inkweld architecture: an Angular PWA in the browser talking to an optional Hono/Bun sync server over REST and WebSocket" src="assets/architecture-light.svg" width="920">
  </picture>
</p>

**The client** is where you write. It's a full web app that works offline.

**The server** enables real-time collaboration and sharing. Run it on your own hardware or a VPS. Without it, you can still use Inkweld locally — documents save to your browser.

**Cloud Sync** mirrors your projects to your own Dropbox, Google Drive or Nextcloud straight from the browser, so you can move between devices without running a server.

---

## Development

### Requirements

- [Bun 1.4+](https://bun.sh/)
- [Node.js 22+](https://nodejs.org/)

### Setup

```bash
git clone https://github.com/bobbyquantum/inkweld.git
cd inkweld
bun install
cp .env.example .env
npm run dev
```

Frontend runs on `:4200`, backend on `:8333`.

### Commands

| Task | Command |
|------|---------|
| Dev servers | `npm run dev` |
| Run tests | `npm test` |
| Build | `npm run build` |
| Docker (local) | `npm run docker:prod` |

📖 **[Developer docs →](docs/site/docs/getting-started.md)**

---

## Data Security & AI Stance

Inkweld is self-hosted — the content on your server doesn't leave your server and any browsers you connect with.  

The exception to this are if you use external AI services.  There's an **AI Kill Switch** that disables all AI features, and AI is disabled by default. Each user also has a **No AI / Allow AI** choice, No AI until they change it, which keeps every AI feature off for them even when the server allows AI.   

If you choose to enable AI features, you can configure both self hosted services and external services, and uses include image generation based on content, and grammar suggestions.  

You should be aware when using external AI services that content could be used to train, and in the case of some providers, even be published or sold as training data sets.

> Always check the provider policies when configuring AI features.

## AI Usage Disclosure

**Disclosure:** GitHub Copilot and Claude Code is used in development (a lot). The desktop background image in the main app is currently AI-generated.  Some of the examples in the docs use generative AI for images and text. 

The main logo is not AI, this was hand-drawn in Inkscape as SVG.

---

## Contributing

Check out the [Status](#status) for where the project is.

- 🐛 [Report bugs](https://github.com/bobbyquantum/inkweld/issues)
- 💡 [Request features](https://github.com/bobbyquantum/inkweld/discussions)
- 🔧 [Submit PRs](https://github.com/bobbyquantum/inkweld)

---

## License

MIT — see [LICENSE](LICENSE).
