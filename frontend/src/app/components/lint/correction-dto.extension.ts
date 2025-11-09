import { PostLint200ResponseCorrectionsInner } from '../../../api-client/model/post-lint200-response-corrections-inner';

/**
 * Extended correction interface for internal use in the lint system
 */
export interface ExtendedCorrectionDto extends PostLint200ResponseCorrectionsInner {
  /**
   * The text content that this correction applies to
   */
  text?: string;

  /**
   * Reason for the correction (sometimes used instead of 'error')
   */
  reason?: string;
}




