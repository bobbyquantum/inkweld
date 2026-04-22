import { Injectable, signal } from '@angular/core';

/**
 * Service for coordinating link insertion in documents.
 *
 * This service allows the keyboard shortcut plugin (Mod-K) to trigger
 * the insert link dialog in the document editor component.
 */
@Injectable({
  providedIn: 'root',
})
export class InsertLinkService {
  /**
   * Signal that increments each time the insert link action is triggered.
   * Components should watch this signal with an effect to open the dialog.
   */
  private readonly _triggerCount = signal(0);
  readonly triggerCount = this._triggerCount.asReadonly();

  /**
   * Trigger the insert link action.
   * Called by keyboard shortcut handler (Mod-K).
   */
  trigger(): void {
    this._triggerCount.update(count => count + 1);
  }
}
