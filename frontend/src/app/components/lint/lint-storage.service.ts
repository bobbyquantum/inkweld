import { Injectable } from '@angular/core';

import { Correction } from '../../../api-client/model/correction';
import { ExtendedCorrectionDto } from './correction-dto.extension';

/**
 * Service to store and manage user decisions on lint suggestions
 */
@Injectable({
  providedIn: 'root',
})
export class LintStorageService {
  private readonly STORAGE_KEY = 'lint-rejected-suggestions';
  private rejectedSuggestions: Set<string> = new Set();

  constructor() {
    this.loadRejectedSuggestions();
    this.listenForEvents();
  }

  /**
   * Generate a unique identifier for a correction
   */
  private getCorrectionId(correction: Correction): string {
    const suggestion = correction.correctedText || '';
    // Since text might not be available in all cases, we'll use from/to as part of the ID
    const uniqueKey = `${correction.startPos}-${correction.endPos}-${suggestion}`;

    // For ExtendedCorrectionDto with text property
    const extendedCorrection = correction as ExtendedCorrectionDto;
    if (extendedCorrection.text) {
      return `${uniqueKey}-${extendedCorrection.text}`.toLowerCase();
    }

    return uniqueKey.toLowerCase();
  }

  /**
   * Load rejected suggestions from localStorage
   */
  private loadRejectedSuggestions(): void {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const items = JSON.parse(saved) as string[];
        this.rejectedSuggestions = new Set(items);
        console.log(
          `[LintStorage] Loaded ${this.rejectedSuggestions.size} rejected suggestions`
        );
      }
    } catch (error) {
      console.error('[LintStorage] Error loading rejected suggestions:', error);
      this.rejectedSuggestions = new Set();
    }
  }

  /**
   * Save rejected suggestions to localStorage
   */
  private saveRejectedSuggestions(): void {
    try {
      const items = Array.from(this.rejectedSuggestions);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
      console.log(`[LintStorage] Saved ${items.length} rejected suggestions`);
    } catch (error) {
      console.error('[LintStorage] Error saving rejected suggestions:', error);
    }
  }

  /**
   * Listen for custom events for accepting and rejecting suggestions
   */
  private listenForEvents(): void {
    document.addEventListener('lint-correction-accept', (event: Event) => {
      const customEvent = event as CustomEvent<Correction>;
      if (customEvent.detail) {
        console.log(
          '[LintStorage] Suggestion accepted:',
          customEvent.detail.correctedText
        );
      }
    });

    document.addEventListener('lint-correction-reject', (event: Event) => {
      const customEvent = event as CustomEvent<Correction>;
      if (customEvent.detail) {
        this.rejectSuggestion(customEvent.detail);
      }
    });
  }

  /**
   * Add a suggestion to the rejected list
   */
  public rejectSuggestion(correction: Correction): void {
    const id = this.getCorrectionId(correction);
    this.rejectedSuggestions.add(id);
    this.saveRejectedSuggestions();
    console.log(
      '[LintStorage] Suggestion rejected and saved:',
      correction.correctedText
    );
  }

  /**
   * Check if a suggestion has been rejected
   */
  public isSuggestionRejected(correction: Correction): boolean {
    const id = this.getCorrectionId(correction);
    return this.rejectedSuggestions.has(id);
  }

  /**
   * Clear all rejected suggestions
   */
  public clearRejectedSuggestions(): void {
    this.rejectedSuggestions.clear();
    this.saveRejectedSuggestions();
    console.log('[LintStorage] Cleared all rejected suggestions');
  }
}
