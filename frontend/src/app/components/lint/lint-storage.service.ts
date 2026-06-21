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
   * The id must be identical whether computed while filtering fresh lint
   * results or when the user rejects a suggestion from the UI. Because the
   * plugin maps corrections to document positions before filtering, both code
   * paths see `from`/`to` (ProseMirror document positions), so those are used
   * to disambiguate identical errors that appear in different paragraphs —
   * rejecting one "teh" must not suppress an unrelated "teh" elsewhere. The
   * `text` field is never used: it is only present on the extended DTO and
   * would otherwise make rejections not stick across lint passes.
   */
  private getCorrectionId(
    correction: Correction | ExtendedCorrectionDto
  ): string {
    const extended = correction as ExtendedCorrectionDto;
    const from = extended.from ?? correction.startPos ?? 0;
    const to = extended.to ?? correction.endPos ?? 0;
    const originalText = correction.originalText || '';
    const suggestion = correction.correctedText || '';
    return `${from}-${to}-${originalText}-${suggestion}`.toLowerCase();
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
  private readonly handleCorrectionRejectBound = (event: Event): void => {
    const customEvent = event as CustomEvent<ExtendedCorrectionDto>;
    if (customEvent.detail) {
      this.rejectSuggestion(customEvent.detail);
    }
  };

  private listenForEvents(): void {
    document.addEventListener(
      'lint-correction-reject',
      this.handleCorrectionRejectBound
    );
  }

  /**
   * Remove document listeners so the service can be torn down by its owner
   * (e.g. the ProseMirror lint plugin on destroy) without leaking listeners.
   */
  public destroy(): void {
    document.removeEventListener(
      'lint-correction-reject',
      this.handleCorrectionRejectBound
    );
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
