import { inject, Injectable } from '@angular/core';

import { SetupService } from '../core/setup.service';
import { IElementSyncProvider } from './element-sync-provider.interface';
import { OfflineElementSyncProvider } from './offline-element-sync.provider';
import { YjsElementSyncProvider } from './yjs-element-sync.provider';

/**
 * Factory for creating the appropriate element sync provider.
 *
 * Selects between:
 * - YjsElementSyncProvider: For server mode (real-time sync via WebSocket)
 * - OfflineElementSyncProvider: For offline mode (local IndexedDB only)
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
  private readonly offlineProvider = inject(OfflineElementSyncProvider);

  /**
   * Get the appropriate sync provider based on current mode.
   *
   * Note: This returns a new reference each time, but the underlying
   * providers are singletons managed by Angular DI.
   */
  getProvider(): IElementSyncProvider {
    const mode = this.setupService.getMode();

    if (mode === 'offline') {
      return this.offlineProvider;
    }

    return this.yjsProvider;
  }

  /**
   * Get the current mode for informational purposes.
   */
  getCurrentMode(): 'offline' | 'server' {
    return this.setupService.getMode() === 'offline' ? 'offline' : 'server';
  }

  /**
   * Check if we're in offline mode.
   */
  isOfflineMode(): boolean {
    return this.setupService.getMode() === 'offline';
  }
}
