import { inject, Injectable, NgZone } from '@angular/core';

/**
 * Interface for the Electron API exposed via preload script
 */
export interface ElectronAPI {
  // Window controls for custom titlebar
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<boolean>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;
  // App info
  getAppVersion: () => Promise<string>;
  getPlatform: () => Promise<NodeJS.Platform>;
  // File dialogs
  showSaveDialog: (
    options: SaveDialogOptions
  ) => Promise<SaveDialogReturnValue>;
  showOpenDialog: (
    options: OpenDialogOptions
  ) => Promise<OpenDialogReturnValue>;
  // File operations (dialog + I/O combined in main process)
  saveFileWithDialog: (
    data: string | ArrayBuffer,
    options: SaveDialogOptions
  ) => Promise<{ saved: boolean; filePath?: string; error?: string }>;
  openAndReadFile: (options: OpenDialogOptions) => Promise<{
    success: boolean;
    data?: ArrayBuffer;
    filePath?: string;
    error?: string;
  }>;
  // Electron flag
  isElectron: boolean;
}

export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileFilter[];
}

export interface OpenDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileFilter[];
  properties?: ('openFile' | 'openDirectory' | 'multiSelections')[];
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface SaveDialogReturnValue {
  canceled: boolean;
  filePath?: string;
}

export interface OpenDialogReturnValue {
  canceled: boolean;
  filePaths: string[];
}

declare global {
  var electronAPI: ElectronAPI | undefined;
}

/**
 * Service for interacting with Electron's main process
 * Provides native desktop features like file dialogs and file system access
 */
@Injectable({
  providedIn: 'root',
})
export class ElectronService {
  private readonly ngZone = inject(NgZone);

  /**
   * Check if the app is running in Electron
   */
  get isElectron(): boolean {
    return !!globalThis.electronAPI?.isElectron;
  }

  /**
   * Get the Electron API (only available when running in Electron)
   */
  private get api(): ElectronAPI | undefined {
    return globalThis.electronAPI;
  }

  constructor() {
    // No menu listener needed with custom titlebar
  }

  /**
   * Window control methods for custom titlebar
   */

  async windowMinimize(): Promise<void> {
    if (this.api) {
      await this.api.windowMinimize();
    }
  }

  async windowMaximize(): Promise<boolean> {
    if (this.api) {
      return await this.api.windowMaximize();
    }
    return false;
  }

  async windowClose(): Promise<void> {
    if (this.api) {
      await this.api.windowClose();
    }
  }

  async windowIsMaximized(): Promise<boolean> {
    if (this.api) {
      return await this.api.windowIsMaximized();
    }
    return false;
  }

  /**
   * Get the application version
   */
  async getAppVersion(): Promise<string | null> {
    if (!this.api) return null;
    return this.api.getAppVersion();
  }

  /**
   * Get the platform (win32, darwin, linux)
   */
  async getPlatform(): Promise<string | null> {
    if (!this.api) return null;
    return this.api.getPlatform();
  }

  /**
   * Show a native save file dialog
   */
  async showSaveDialog(
    options: SaveDialogOptions
  ): Promise<SaveDialogReturnValue | null> {
    if (!this.api) return null;
    return this.api.showSaveDialog(options);
  }

  /**
   * Show a native open file dialog
   */
  async showOpenDialog(
    options: OpenDialogOptions
  ): Promise<OpenDialogReturnValue | null> {
    if (!this.api) return null;
    return this.api.showOpenDialog(options);
  }

  /**
   * Save a file using a native save dialog
   * The dialog and file write happen entirely in the main process
   */
  async saveFileWithDialog(
    data: string | ArrayBuffer,
    options: SaveDialogOptions
  ): Promise<{ saved: boolean; filePath?: string }> {
    if (!this.api) {
      return { saved: false };
    }
    const result = await this.api.saveFileWithDialog(data, options);
    return { saved: result.saved, filePath: result.filePath };
  }

  /**
   * Open and read a file using a native open dialog
   * The dialog and file read happen entirely in the main process
   */
  async openAndReadFile(
    options: OpenDialogOptions
  ): Promise<{ data: ArrayBuffer | null; filePath?: string }> {
    if (!this.api) {
      return { data: null };
    }
    const result = await this.api.openAndReadFile(options);
    if (result.success && result.data) {
      return { data: result.data, filePath: result.filePath };
    }
    return { data: null };
  }
}
