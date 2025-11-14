---
sidebar_position: 1
title: Welcome to Inkweld
description: Self-hosted collaborative writing for novelists, screenwriters, and creative teams.
---

![Inkweld Editor](/img/editor-desktop.png)

Inkweld is a **self-hosted collaborative writing platform** designed for novelists, screenwriters, worldbuilders, and creative teams who want complete control over their work. Write together in real-time, build detailed fictional universes, and own every word—all on your own infrastructure.

## Why Self-Host Your Writing?

### Complete Privacy

Your stories never leave your server. No third-party access, no data mining, no surveillance. Perfect for sensitive projects or those bound by NDAs.

### No Subscription Fees

Pay only for your hosting costs. No per-user charges, no feature paywalls, no surprise price increases.

### Full Customization

Open source means you can modify anything. Add features, integrate with your tools, or contribute improvements back to the community.

### No Vendor Lock-In

Export your data anytime in standard formats. Migrate to another platform or self-host elsewhere without losing your work.

## Perfect For

<div class="row" style={{marginTop: '2rem', marginBottom: '2rem'}}>
  <div class="col col--6">
    <div style={{padding: '1.5rem', background: 'var(--ifm-card-background-color)', borderRadius: '12px', marginBottom: '1rem'}}>
      <h3>📚 Novelists</h3>
      <p>Collaborate on long-form fiction with co-authors. Organize by chapters, track characters, and maintain consistency across your world.</p>
    </div>
  </div>
  <div class="col col--6">
    <div style={{padding: '1.5rem', background: 'var(--ifm-card-background-color)', borderRadius: '12px', marginBottom: '1rem'}}>
      <h3>🎬 Screenwriters</h3>
      <p>Work together on scripts with real-time collaboration. See changes as they happen without version conflict headaches.</p>
    </div>
  </div>
  <div class="col col--6">
    <div style={{padding: '1.5rem', background: 'var(--ifm-card-background-color)', borderRadius: '12px', marginBottom: '1rem'}}>
      <h3>🗺️ Worldbuilders</h3>
      <p>Develop detailed fictional universes with structured templates for characters, locations, timelines, and lore.</p>
    </div>
  </div>
  <div class="col col--6">
    <div style={{padding: '1.5rem', background: 'var(--ifm-card-background-color)', borderRadius: '12px', marginBottom: '1rem'}}>
      <h3>👥 Writing Groups</h3>
      <p>Share work, provide feedback, and collaborate on group projects—all in one private, self-hosted space.</p>
    </div>
  </div>
</div>

## Key Features at a Glance

✅ **Real-time collaboration** - CRDT-powered conflict-free editing  
✅ **Offline-first** - Work anywhere, sync when you're ready  
✅ **Worldbuilding tools** - Character profiles, locations, timelines  
✅ **Flexible organization** - Folders, chapters, scenes, notes  
✅ **Modern editor** - Rich text with distraction-free mode  
✅ **Self-hosted** - Docker deployment on any server  
✅ **Open source** - MIT licensed, free forever  

![Project Dashboard](/img/bookshelf-desktop.png)

## Quick Start

### Try with Docker (Fastest)

```bash
docker run -p 8333:8333 \
  -v inkweld_data:/data \
  -e SESSION_SECRET=your-secret-key-min-32-characters-long \
  -e CLIENT_URL=http://localhost:8333 \
  ghcr.io/bobbyquantum/inkweld:latest
```

Visit [http://localhost:8333](http://localhost:8333) and start writing.

### Local Development

```bash
git clone https://github.com/bobbyquantum/inkweld.git
cd inkweld
bun run install-all
npm start
```

See the [installation guide](./installation) for detailed setup instructions.

## Documentation Guide

<div class="row" style={{marginTop: '2rem'}}>
  <div class="col col--6" style={{marginBottom: '1rem'}}>
    <a href="./features" style={{textDecoration: 'none'}}>
      <div style={{padding: '1.5rem', background: 'var(--ifm-color-primary-lightest)', borderRadius: '12px', height: '100%'}}>
        <h3 style={{marginTop: 0}}>🌟 Features</h3>
        <p>Explore everything Inkweld can do for your writing</p>
      </div>
    </a>
  </div>
  <div class="col col--6" style={{marginBottom: '1rem'}}>
    <a href="./installation" style={{textDecoration: 'none'}}>
      <div style={{padding: '1.5rem', background: 'var(--ifm-color-primary-lightest)', borderRadius: '12px', height: '100%'}}>
        <h3 style={{marginTop: 0}}>⚡ Installation</h3>
        <p>Get Inkweld running locally or on your server</p>
      </div>
    </a>
  </div>
  <div class="col col--6" style={{marginBottom: '1rem'}}>
    <a href="./user-guide/projects" style={{textDecoration: 'none'}}>
      <div style={{padding: '1.5rem', background: 'var(--ifm-color-success-lightest)', borderRadius: '12px', height: '100%'}}>
        <h3 style={{marginTop: 0}}>✍️ User Guide</h3>
        <p>Learn how to use Inkweld for your creative projects</p>
      </div>
    </a>
  </div>
  <div class="col col--6" style={{marginBottom: '1rem'}}>
    <a href="./hosting/docker" style={{textDecoration: 'none'}}>
      <div style={{padding: '1.5rem', background: 'var(--ifm-color-success-lightest)', borderRadius: '12px', height: '100%'}}>
        <h3 style={{marginTop: 0}}>🚀 Hosting</h3>
        <p>Deploy for production with Docker and Docker Compose</p>
      </div>
    </a>
  </div>
</div>

## Community & Support

- 💬 **[GitHub Discussions](https://github.com/bobbyquantum/inkweld/discussions)** - Ask questions, share ideas
- 🐛 **[Issue Tracker](https://github.com/bobbyquantum/inkweld/issues)** - Report bugs, request features
- 💻 **[Source Code](https://github.com/bobbyquantum/inkweld)** - Explore and contribute

## License

Inkweld is open source software licensed under the **[MIT License](https://github.com/bobbyquantum/inkweld/blob/main/LICENSE)**. Free to use, modify, and deploy forever.

---

**Ready to start?** Head to [Installation](./installation) or [explore the features](./features).
