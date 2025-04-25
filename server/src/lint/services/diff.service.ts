import { Injectable, Logger } from '@nestjs/common';
import { DiffMatchPatch, diff_match_patch } from 'diff-match-patch';

@Injectable()
export class DiffService {
  private readonly dmp: DiffMatchPatch;
  private readonly logger = new Logger(DiffService.name);

  constructor() {
    this.dmp = new diff_match_patch();
  }

  /**
   * Calculate precise character positions for a correction
   * @param original The original text
   * @param error The error text to find
   * @param _suggestion The suggested correction (not used in position calculation)
   * @returns Object with from and to positions, or null if positions can't be determined
   */
  calculatePositions(original: string, error: string, _suggestion: string): { from: number, to: number } | null {
    if (!error || error.length === 0) {
      this.logger.warn('Empty error text provided to DiffService');
      return null;
    }

    try {
      // Find the first occurrence of the error in the original text
      const errorIndex = original.indexOf(error);
      if (errorIndex === -1) {
        // If exact match not found, try to find the closest match
        return this.findNearestMatch(original, error);
      }

      return {
        from: errorIndex,
        to: errorIndex + error.length
      };
    } catch (e) {
      const err = e as Error;
      this.logger.error(`Error in diff calculation: ${err.message}`);
      return null;
    }
  }

  /**
   * Find the nearest matching text when an exact match isn't found
   * Uses diff-match-patch's fuzzy matching capabilities
   */
  findNearestMatch(original: string, error: string): { from: number, to: number } | null {
    try {
      // Use the diff-match-patch match algorithm to find closest match
      const matches = this.dmp.match_main(original, error, 0);
      if (matches === -1) {
        this.logger.warn(`Could not find a match for '${error}' in the text`);
        return null;
      }

      return {
        from: matches,
        to: matches + error.length
      };
    } catch (e) {
      const err = e as Error;
      this.logger.error(`Error in fuzzy match: ${err.message}`);
      return null;
    }
  }

  /**
   * Apply a complete set of corrections to the original text and validate the positions
   * @param original The original text
   * @param corrections Array of correction objects without position information
   * @returns Array of corrections with valid from/to positions
   */
  processCorrections(original: string, corrections: any[]): any[] {
    if (!corrections || !Array.isArray(corrections)) {
      return [];
    }

    return corrections
      .map(correction => {
        // Skip corrections that don't have the required properties
        if (!correction.error || !correction.suggestion) {
          return null;
        }

        // Calculate positions
        const positions = this.calculatePositions(original, correction.error, correction.suggestion);
        if (!positions) {
          this.logger.warn(`Could not determine positions for correction: "${correction.error}" -> "${correction.suggestion}"`);
          return null;
        }

        // Return complete correction with positions
        return {
          ...correction,
          from: positions.from,
          to: positions.to
        };
      })
      .filter(Boolean); // Remove nulls
  }
}
