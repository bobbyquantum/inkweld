import { app, BrowserWindow, ipcMain, shell, dialog, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';

let mainWindow: BrowserWindow | null = null;

// Determine if we're in development mode
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Path to the Angular build output
const DIST_PATH = path.join(__dirname, '../dist/inkweld-frontend/browser');

// Register custom protocol scheme before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Inkweld',
    icon: path.join(__dirname, '../public/icons/android-chrome-512x512.png'),
    backgroundColor: '#1e1e1e', // Match app theme
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    show: false, // Don't show until ready
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:4200');
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // Use custom app:// protocol in production
    mainWindow.loadURL('app://./index.html');
  }

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links in the default browser
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Remove the default menu for frameless window
  // Menu.setApplicationMenu(null);
}

// Removed traditional menu for frameless window
// Menu functionality can be added via custom titlebar or context menus

// IPC Handlers

// Window control handlers for custom titlebar
ipcMain.handle('window-minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return mainWindow.isMaximized();
  }
  return false;
});

ipcMain.handle('window-close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

ipcMain.handle('show-save-dialog', async (_event, options) => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

ipcMain.handle('show-open-dialog', async (_event, options) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

ipcMain.handle('write-file', async (_event, filePath: string, data: string | Buffer) => {
  try {
    fs.writeFileSync(filePath, data);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('read-file', async (_event, filePath: string) => {
  try {
    const data = fs.readFileSync(filePath);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  // Register custom app:// protocol to serve files from the Angular dist folder
  // This allows absolute paths like /logo.png to work correctly
  if (!isDev) {
    protocol.handle('app', (request) => {
      // Get the path from the URL (remove app://./)
      let urlPath = request.url.slice('app://./'.length);

      // Handle URL decoding
      urlPath = decodeURIComponent(urlPath);

      // Remove any query string or hash
      const queryIndex = urlPath.indexOf('?');
      if (queryIndex !== -1) {
        urlPath = urlPath.slice(0, queryIndex);
      }
      const hashIndex = urlPath.indexOf('#');
      if (hashIndex !== -1) {
        urlPath = urlPath.slice(0, hashIndex);
      }

      // Default to index.html for empty paths or paths without extension (SPA routing)
      if (!urlPath || (!path.extname(urlPath) && !urlPath.includes('.'))) {
        urlPath = 'index.html';
      }

      const filePath = path.join(DIST_PATH, urlPath);
      return net.fetch(pathToFileURL(filePath).toString());
    });
  }

  createWindow();

  app.on('activate', () => {
    // On macOS, re-create a window when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Prevent new window creation except for our handlers
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    // Allow navigation within the app
    if (isDev && parsedUrl.origin === 'http://localhost:4200') {
      return;
    }
    if (!isDev && parsedUrl.protocol === 'file:') {
      return;
    }
    // Block external navigation, open in browser instead
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });
});
