import { Injectable, Optional } from '@angular/core';

import { type Correction } from '../../../api-client/model/correction';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Used as Angular DI token, required at runtime
import { LoggerService } from '../../services/core/logger.service';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Used as Angular DI token, required at runtime
import { StorageContextService } from '../../services/core/storage-context.service';
import { type ExtendedCorrectionDto } from './correction-dto.extension';

const LINT_REJECTED_BASE_KEY = 'lint-rejected-suggestions';

/**
 * Service to store and manage user decisions on lint suggestions
 */
@Injectable({
  providedIn: 'root',
})
export class LintStorageService {
  private rejectedSuggestions: Set<string> = new Set();

  private get STORAGE_KEY(): string {
    if (this.storageContext) {
      return this.storageContext.prefixKey(LINT_REJECTED_BASE_KEY);
    }
    return LINT_REJECTED_BASE_KEY;
  }

  constructor(
    // eslint-disable-next-line @angular-eslint/prefer-inject -- Optional injection needed for non-Angular contexts (e.g. ProseMirror plugins using `new`)
    @Optional() private readonly logger?: LoggerService,
    // eslint-disable-next-line @angular-eslint/prefer-inject -- Optional injection needed for non-Angular contexts (e.g. ProseMirror plugins using `new`)
    @Optional() private readonly storageContext?: StorageContextService
  ) {
    this.loadRejectedSuggestions();
    this.listenForEvents();
  }

  /**
   * Generate a unique identifier for a correction
   */
  private getCorrectionId(
    correction: Correction | ExtendedCorrectionDto
  ): string {
    // Support both Correction (API) and ExtendedCorrectionDto (with text property)
    const extended = correction as ExtendedCorrectionDto;
    const suggestion = correction.correctedText || '';
    const startPos = correction.startPos ?? 0;
    const endPos = correction.endPos ?? 0;
    const uniqueKey = `${startPos}-${endPos}-${suggestion}`;

    // For ExtendedCorrectionDto with text property
    if (extended.text) {
      return `${uniqueKey}-${extended.text}`.toLowerCase();
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
        this.logger?.debug(
          'LintStorage',
          `Loaded ${this.rejectedSuggestions.size} rejected suggestions`
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
      this.logger?.debug(
        'LintStorage',
        `Saved ${items.length} rejected suggestions`
      );
    } catch (error) {
      console.error('[LintStorage] Error saving rejected suggestions:', error);
    }
  }

  /**
   * Listen for custom events for accepting and rejecting suggestions
   */
  private listenForEvents(): void {
    document.addEventListener('lint-correction-reject', (event: Event) => {
      const customEvent = event as CustomEvent<ExtendedCorrectionDto>;
      if (customEvent.detail) {
        this.rejectSuggestion(customEvent.detail);
      }
    });
  }

  /**
   * Add a suggestion to the rejected list
   */
  public rejectSuggestion(
    correction: Correction | ExtendedCorrectionDto
  ): void {
    const id = this.getCorrectionId(correction);
    this.rejectedSuggestions.add(id);
    this.saveRejectedSuggestions();
  }

  /**
   * Check if a suggestion has been rejected
   */
  public isSuggestionRejected(
    correction: Correction | ExtendedCorrectionDto
  ): boolean {
    const id = this.getCorrectionId(correction);
    return this.rejectedSuggestions.has(id);
  }

  /**
   * Clear all rejected suggestions
   */
  public clearRejectedSuggestions(): void {
    this.rejectedSuggestions.clear();
    this.saveRejectedSuggestions();
    this.logger?.debug('LintStorage', 'Cleared all rejected suggestions');
  }
}
