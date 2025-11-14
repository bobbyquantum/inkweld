import { PostApiV1AiLint200ResponseCorrectionsInner } from '../../../api-client/model/post-api-v1-ai-lint200-response-corrections-inner';

/**
 * Extended correction interface for internal use in the lint system
 */
export interface ExtendedCorrectionDto
  extends PostApiV1AiLint200ResponseCorrectionsInner {
  /**
   * The text content that this correction applies to
   */
  text?: string;

  /**
   * Reason for the correction (sometimes used instead of 'error')
   */
  reason?: string;

  /**
   * Start position (ProseMirror coordinate, adjusted from startPos)
   */
  from?: number;

  /**
   * End position (ProseMirror coordinate, adjusted from endPos)
   */
  to?: number;
}
