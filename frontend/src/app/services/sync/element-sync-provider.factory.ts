import { inject, Injectable } from '@angular/core';

import { SetupService } from '../core/setup.service';
import { type StorageConfigType } from '../core/storage-context.service';
import { type IElementSyncProvider } from './element-sync-provider.interface';
import { LocalElementSyncProvider } from './local-element-sync.provider';
import { YjsElementSyncProvider } from './yjs-element-sync.provider';

/**
 * Factory for creating the appropriate element sync provider.
 *
 * Selects between:
 * - YjsElementSyncProvider: For server mode (real-time sync via WebSocket)
 * - LocalElementSyncProvider: For local mode (local IndexedDB only) and
 *   cloud sync mode (local IndexedDB, mirrored to cloud storage separately)
 *
 * This allows ProjectStateService to work with a consistent interface
 * regardless of the sync backend.
 */
@Injectable({
  providedIn: 'root',
})
export class ElementSyncProviderFactory {
  private readonly setupService = inject(SetupService);
  private readonly yjsProvider = inject(YjsElementSyncProvider);
  private readonly localProvider = inject(LocalElementSyncProvider);

  /**
   * Get the appropriate sync provider based on current mode.
   *
   * Note: This returns a new reference each time, but the underlying
   * providers are singletons managed by Angular DI.
   */
  getProvider(): IElementSyncProvider {
    if (this.setupService.getMode() === 'server') {
      return this.yjsProvider;
    }

    return this.localProvider;
  }

  /**
   * Get the current mode for informational purposes.
   */
  getCurrentMode(): StorageConfigType {
    return this.setupService.getMode() ?? 'local';
  }

  /**
   * True when there is no Inkweld server (Browser mode or Cloud Sync mode).
   * Callers use this to choose browser storage over HTTP; cloud sync takes
   * the browser-storage path too.
   */
  isLocalMode(): boolean {
    return this.setupService.getMode() !== 'server';
  }

  /** True when in Cloud Sync mode */
  isCloudMode(): boolean {
    return this.setupService.getMode() === 'cloud';
  }
}
