import { Injectable, signal } from '@angular/core';

/**
 * Service for coordinating image insertion in documents.
 *
 * This service allows the keyboard shortcut plugin to trigger
 * the insert image dialog in the document editor component.
 */
@Injectable({
  providedIn: 'root',
})
export class InsertImageService {
  /**
   * Signal that increments each time the insert image action is triggered.
   * Components should watch this signal with an effect to open the dialog.
   */
  readonly triggerCount = signal(0);

  /**
   * Trigger the insert image action.
   * Called by keyboard shortcut handler.
   */
  trigger(): void {
    this.triggerCount.update(count => count + 1);
  }
}
