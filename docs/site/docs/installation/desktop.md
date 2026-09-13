---
title: Desktop App (Electron)
description: Build and run Inkweld as a native desktop application for macOS, Windows, and Linux.
sidebar_position: 5
---

# Desktop App (Electron)

Inkweld ships an Electron wrapper that runs the web client as a native desktop application. It behaves exactly like the browser version — including offline mode and connecting to a sync server — with a native window, menus, and file dialogs.

:::info[Build from source]
Pre-built desktop installers are not published yet. The steps below build the app locally; CI verifies the Electron build on every change.
:::

## Prerequisites

- [Node.js 22+](https://nodejs.org/)
- [Bun 1.3+](https://bun.sh/)
- Platform tooling for packaging: Xcode command line tools on macOS, or the Visual Studio Build Tools on Windows. Linux needs no extra tooling for AppImage or `.deb` output.

## Run in development

```bash
git clone https://github.com/bobbyquantum/inkweld.git
cd inkweld
bun install
cd frontend
npm run electron:dev
```

This starts the Angular dev server on port 4200, waits for it, and opens Electron pointing at it. Changes to the frontend hot-reload inside the window.

## Build an installer

From the `frontend` directory:

```bash
npm run electron:package
```

Or target one platform:

```bash
npm run electron:package:mac
```

```bash
npm run electron:package:win
```

```bash
npm run electron:package:linux
```

Installers are written to `frontend/release/`. Cross-platform builds generally need to run on the target OS.

## Connecting to a server

On first launch the desktop app shows the same mode selection screen as the web client. Choose **Offline** to keep everything on the machine, or **Server** and enter the URL of your Inkweld instance. See [Choosing Your Mode](/user-guide/getting-started/client-mode) in the User Guide.

## How it's built

- The Angular app runs in the renderer process; the Electron main process only manages the window, menus, and file dialogs.
- Context isolation is on. The renderer reaches native features through a small typed API exposed by a preload script.
- External links open in the system browser, and navigation is locked to the app's own pages.

Source lives in `frontend/electron/`.
