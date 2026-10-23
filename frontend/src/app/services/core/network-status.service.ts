import { DestroyRef, inject, Injectable, signal } from '@angular/core';

function readOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/**
 * The browser's online/offline state as a signal.
 *
 * `navigator.onLine` read inside a `computed` is a snapshot: nothing tells
 * the computed to re-run when the network changes, so a value read while
 * offline sticks after the network is back. Read {@link online} instead.
 */
@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private readonly onlineSignal = signal(readOnline());

  /** False while the browser reports no network. */
  readonly online = this.onlineSignal.asReadonly();

  constructor() {
    const update = (): void => this.onlineSignal.set(readOnline());
    globalThis.addEventListener('online', update);
    globalThis.addEventListener('offline', update);
    inject(DestroyRef).onDestroy(() => {
      globalThis.removeEventListener('online', update);
      globalThis.removeEventListener('offline', update);
    });
  }
}
