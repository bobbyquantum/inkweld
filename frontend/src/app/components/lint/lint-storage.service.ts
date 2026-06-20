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
   * Generate a stable identifier for a correction.
   *
   * The id must be identical whether computed for a raw API `Correction` (used
   * when filtering fresh lint results) or for an `ExtendedCorrectionDto` (used
   * when the user rejects a suggestion from the UI). Only fields present on the
   * raw API correction are used — never `text`/`from`/`to`, which are only
   * added later by the plugin — otherwise rejections would not stick across
   * subsequent lint passes.
   */
  private getCorrectionId(
    correction: Correction | ExtendedCorrectionDto
  ): string {
    const startPos = correction.startPos ?? 0;
    const endPos = correction.endPos ?? 0;
    const originalText = correction.originalText || '';
    const suggestion = correction.correctedText || '';
    return `${startPos}-${endPos}-${originalText}-${suggestion}`.toLowerCase();
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
