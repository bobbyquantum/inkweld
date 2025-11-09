import { Injectable } from '@angular/core';

import { CorrectionDto } from '../../../api-client/model/correction-dto';
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
  private getCorrectionId(correction: CorrectionDto): string {
    const suggestion = correction.suggestion || '';
    // Since text might not be available in all cases, we'll use from/to as part of the ID
    const uniqueKey = `${correction.from}-${correction.to}-${suggestion}`;

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
      const customEvent = event as CustomEvent<CorrectionDto>;
      if (customEvent.detail) {
        console.log(
          '[LintStorage] Suggestion accepted:',
          customEvent.detail.suggestion
        );
      }
    });

    document.addEventListener('lint-correction-reject', (event: Event) => {
      const customEvent = event as CustomEvent<CorrectionDto>;
      if (customEvent.detail) {
        this.rejectSuggestion(customEvent.detail);
      }
    });
  }

  /**
   * Add a suggestion to the rejected list
   */
  public rejectSuggestion(correction: CorrectionDto): void {
    const id = this.getCorrectionId(correction);
    this.rejectedSuggestions.add(id);
    this.saveRejectedSuggestions();
    console.log(
      '[LintStorage] Suggestion rejected and saved:',
      correction.suggestion
    );
  }

  /**
   * Check if a suggestion has been rejected
   */
  public isSuggestionRejected(correction: CorrectionDto): boolean {
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




