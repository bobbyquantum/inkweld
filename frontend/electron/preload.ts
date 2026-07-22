import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls for custom titlebar
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),

  // File dialogs
  showSaveDialog: (options: Electron.SaveDialogOptions) =>
    ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options: Electron.OpenDialogOptions) =>
    ipcRenderer.invoke('show-open-dialog', options),

  // File operations (dialog + file I/O combined in main process)
  saveFileWithDialog: (data: string | Buffer, options: Electron.SaveDialogOptions) =>
    ipcRenderer.invoke('save-file-with-dialog', data, options),
  openAndReadFile: (options: Electron.OpenDialogOptions) =>
    ipcRenderer.invoke('open-and-read-file', options),

  // Deep link handler
  onDeepLink: (callback: (path: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, path: string) =>
      callback(path);
    ipcRenderer.on('deep-link', handler);
    return () => ipcRenderer.removeListener('deep-link', handler);
  },

  // Check if running in Electron
  isElectron: true,
});

// Type declaration for the exposed API
export interface ElectronAPI {
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<boolean>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;
  getAppVersion: () => Promise<string>;
  getPlatform: () => Promise<NodeJS.Platform>;
  showSaveDialog: (
    options: Electron.SaveDialogOptions
  ) => Promise<Electron.SaveDialogReturnValue>;
  showOpenDialog: (
    options: Electron.OpenDialogOptions
  ) => Promise<Electron.OpenDialogReturnValue>;
  saveFileWithDialog: (
    data: string | Buffer,
    options: Electron.SaveDialogOptions
  ) => Promise<{ saved: boolean; filePath?: string; error?: string }>;
  openAndReadFile: (
    options: Electron.OpenDialogOptions
  ) => Promise<{ success: boolean; data?: Buffer; filePath?: string; error?: string }>;
  onDeepLink: (callback: (path: string) => void) => () => void;
  isElectron: boolean;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
