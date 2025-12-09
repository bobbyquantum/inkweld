# Electron Desktop App

This directory contains the Electron main process code for the Inkweld desktop application.

## Structure

- `main.ts` - Main process entry point, creates the BrowserWindow and handles IPC
- `preload.ts` - Preload script that exposes secure APIs to the renderer process
- `tsconfig.json` - TypeScript configuration for Electron code
- `resources/` - Build resources (icons, etc.)

## Development

To run the desktop app in development mode:

```bash
# From the frontend directory
npm run electron:dev
```

This will:

1. Start the Angular dev server on port 4200
2. Wait for it to be ready
3. Launch Electron loading from localhost:4200

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

- Creates and manages the application window
- Handles native menus and dialogs
- Provides IPC handlers for file system operations
- Manages application lifecycle

### Preload Script (preload.ts)

- Runs in a secure context with access to Node.js APIs
- Exposes a limited, typed API to the renderer via `contextBridge`
- All renderer → main communication goes through this layer

### Renderer Process (Angular App)

- The Angular app runs in the renderer process
- Uses `ElectronService` to interact with native features
- Gracefully degrades when not running in Electron

## Security

- Context isolation is enabled (renderer can't access Node.js directly)
- Preload script exposes only necessary APIs via `contextBridge`
- External links are opened in the default browser
- Navigation is restricted to the app's own URLs

## IPC API

The preload script exposes the following API via `window.electronAPI`:

```typescript
interface ElectronAPI {
  // App info
  getAppVersion(): Promise<string>;
  getPlatform(): Promise<NodeJS.Platform>;
  
  // File dialogs
  showSaveDialog(options): Promise<SaveDialogReturnValue>;
  showOpenDialog(options): Promise<OpenDialogReturnValue>;
  
  // File operations
  writeFile(path, data): Promise<{ success: boolean; error?: string }>;
  readFile(path): Promise<{ success: boolean; data?: Buffer; error?: string }>;
  
  // Menu events
  onMenuAction(callback): () => void; // Returns cleanup function
  
  // Detection
  isElectron: boolean;
}
```

## Menu Actions

The app menu sends the following actions via `onMenuAction`:

- `new-project` - Create a new project
- `export-pdf` - Export current document as PDF
- `export-docx` - Export current document as DOCX

Handle these in your Angular components/services by subscribing to `ElectronService.menuActions`.
