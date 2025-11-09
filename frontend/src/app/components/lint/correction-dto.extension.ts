import { CorrectionDto } from '../../../api-client/model/correction-dto';

/**
 * Extended CorrectionDto interface for internal use in the lint system
 */
export interface ExtendedCorrectionDto extends CorrectionDto {
  /**
   * The text content that this correction applies to
   */
  text?: string;

  /**
   * Reason for the correction (sometimes used instead of 'error')
   */
  reason?: string;
}




