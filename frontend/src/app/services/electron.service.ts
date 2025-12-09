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
  // File operations
  writeFile: (
    filePath: string,
    data: string | ArrayBuffer
  ) => Promise<{ success: boolean; error?: string }>;
  readFile: (
    filePath: string
  ) => Promise<{ success: boolean; data?: ArrayBuffer; error?: string }>;
  // Menu (deprecated - removed in favor of custom titlebar)
  // onMenuAction: (callback: (action: string) => void) => () => void;
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
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

/**
 * Service for interacting with Electron's main process
 * Provides native desktop features like file dialogs and file system access
 */
@Injectable({
  providedIn: 'root',
})
export class ElectronService {
  private ngZone = inject(NgZone);

  /**
   * Check if the app is running in Electron
   */
  get isElectron(): boolean {
    return !!window.electronAPI?.isElectron;
  }

  /**
   * Get the Electron API (only available when running in Electron)
   */
  private get api(): ElectronAPI | undefined {
    return window.electronAPI;
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
   * Write data to a file (requires Electron)
   */
  async writeFile(
    filePath: string,
    data: string | ArrayBuffer
  ): Promise<boolean> {
    if (!this.api) return false;
    const result = await this.api.writeFile(filePath, data);
    return result.success;
  }

  /**
   * Read data from a file (requires Electron)
   */
  async readFile(filePath: string): Promise<ArrayBuffer | null> {
    if (!this.api) return null;
    const result = await this.api.readFile(filePath);
    if (result.success && result.data) {
      return result.data;
    }
    return null;
  }

  /**
   * Save a file with a native dialog
   * Convenience method combining dialog and write
   */
  async saveFileWithDialog(
    data: string | ArrayBuffer,
    options: SaveDialogOptions
  ): Promise<{ saved: boolean; filePath?: string }> {
    if (!this.api) {
      return { saved: false };
    }

    const dialogResult = await this.showSaveDialog(options);
    if (!dialogResult || dialogResult.canceled || !dialogResult.filePath) {
      return { saved: false };
    }

    const success = await this.writeFile(dialogResult.filePath, data);
    return {
      saved: success,
      filePath: success ? dialogResult.filePath : undefined,
    };
  }
}
