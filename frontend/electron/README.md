# Electron Desktop App

This directory contains the Electron main process code for the Inkweld desktop application.

## Structure

- `main.ts` - Main process entry point, creates the BrowserWindow and handles IPC
- `preload.ts` - Preload script that exposes secure APIs to the renderer process
- `tsconfig.json` - TypeScript configuration for Electron code (compiled to `dist-electron/`)

Packaging is configured in `../electron-builder.json`; the app icon comes from `public/icons/`.

## Development

To run the desktop app in development mode:

```bash
# From the frontend directory
npm run electron:dev
```

This will:

1. Start the Angular dev server on port 4200
2. Wait for it to be ready
3. Compile the Electron code and launch Electron loading from localhost:4200

## Building

To build the desktop app for distribution:

```bash
# Build for all platforms (requires appropriate OS/tools)
npm run electron:package

# Build for specific platform
npm run electron:package:win
npm run electron:package:mac
npm run electron:package:linux
```

Built packages will be in the `release/` directory.

## Architecture

### Main Process (main.ts)

- Creates and manages the application window (defines no custom application menu; the Angular app draws its own titlebar)
- Serves the built app in production through a custom `app://` protocol
- Registers the `inkweld://` deep-link protocol and forwards links to the renderer
- Provides IPC handlers for window controls, native dialogs and file I/O
- Manages application lifecycle (single-instance lock)

### Preload Script (preload.ts)

- Runs in an isolated, sandboxed context
- Exposes a limited, typed API to the renderer via `contextBridge`
- All renderer → main communication goes through this layer

### Renderer Process (Angular App)

- The Angular app runs in the renderer process
- Uses `ElectronService` (`src/app/services/electron.service.ts`) to interact with native features
- Gracefully degrades when not running in Electron

## Security

- Context isolation is enabled (renderer can't access Node.js directly)
- Preload script exposes only necessary APIs via `contextBridge`
- External links are opened in the default browser
- Navigation is restricted to the app's own URLs

## IPC API

The preload script exposes the following API via `window.electronAPI` (the
authoritative definition is `ElectronAPI` in `preload.ts`):

```typescript
interface ElectronAPI {
  // Window controls for the custom titlebar
  windowMinimize(): Promise<void>;
  windowMaximize(): Promise<boolean>; // toggles; resolves to the new maximized state
  windowClose(): Promise<void>;
  windowIsMaximized(): Promise<boolean>;

  // App info
  getAppVersion(): Promise<string>;
  getPlatform(): Promise<NodeJS.Platform>;

  // File dialogs
  showSaveDialog(options): Promise<SaveDialogReturnValue>;
  showOpenDialog(options): Promise<OpenDialogReturnValue>;

  // Dialog + file I/O combined in the main process
  saveFileWithDialog(
    data: string | Buffer,
    options
  ): Promise<{ saved: boolean; filePath?: string; error?: string }>;
  openAndReadFile(options): Promise<{
    success: boolean;
    data?: Buffer;
    filePath?: string;
    error?: string;
  }>;

  // inkweld:// deep links; returns a cleanup function
  onDeepLink(callback: (path: string) => void): () => void;

  // Detection
  isElectron: boolean;
}
```

## Deep links

In packaged builds the app registers as the handler for `inkweld://` URLs. A
URL such as `inkweld://user/project` is sent to the renderer as the path
`user/project` through `onDeepLink`. Links received before the window is ready
are held until it is.
