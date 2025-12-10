/**
 * Tests for Published File utility functions
 */
import { describe, expect, it } from 'vitest';

import { PublishFormat } from './publish-plan';
import {
  getExtensionForFormat,
  getFormatDisplayName,
  getFormatIcon,
  getMimeTypeForFormat,
} from './published-file';

describe('Published File Utilities', () => {
  describe('getMimeTypeForFormat', () => {
    it('should return EPUB MIME type', () => {
      expect(getMimeTypeForFormat(PublishFormat.EPUB)).toBe(
        'application/epub+zip'
      );
    });

    it('should return PDF MIME type', () => {
      expect(getMimeTypeForFormat(PublishFormat.PDF_SIMPLE)).toBe(
        'application/pdf'
      );
    });

    it('should return HTML MIME type', () => {
      expect(getMimeTypeForFormat(PublishFormat.HTML)).toBe('text/html');
    });

    it('should return Markdown MIME type', () => {
      expect(getMimeTypeForFormat(PublishFormat.MARKDOWN)).toBe(
        'text/markdown'
      );
    });

    it('should return octet-stream for unknown format', () => {
      expect(getMimeTypeForFormat('unknown' as PublishFormat)).toBe(
        'application/octet-stream'
      );
    });
  });

  describe('getExtensionForFormat', () => {
    it('should return .epub for EPUB format', () => {
      expect(getExtensionForFormat(PublishFormat.EPUB)).toBe('.epub');
    });

    it('should return .pdf for PDF format', () => {
      expect(getExtensionForFormat(PublishFormat.PDF_SIMPLE)).toBe('.pdf');
    });

    it('should return .html for HTML format', () => {
      expect(getExtensionForFormat(PublishFormat.HTML)).toBe('.html');
    });

    it('should return .md for Markdown format', () => {
      expect(getExtensionForFormat(PublishFormat.MARKDOWN)).toBe('.md');
    });

    it('should return empty string for unknown format', () => {
      expect(getExtensionForFormat('unknown' as PublishFormat)).toBe('');
    });
  });

  describe('getFormatDisplayName', () => {
    it('should return EPUB for EPUB format', () => {
      expect(getFormatDisplayName(PublishFormat.EPUB)).toBe('EPUB');
    });

    it('should return PDF for PDF format', () => {
      expect(getFormatDisplayName(PublishFormat.PDF_SIMPLE)).toBe('PDF');
    });

    it('should return HTML for HTML format', () => {
      expect(getFormatDisplayName(PublishFormat.HTML)).toBe('HTML');
    });

    it('should return Markdown for Markdown format', () => {
      expect(getFormatDisplayName(PublishFormat.MARKDOWN)).toBe('Markdown');
    });

    it('should return format string for unknown format', () => {
      expect(getFormatDisplayName('custom' as PublishFormat)).toBe('custom');
    });
  });

  describe('getFormatIcon', () => {
    it('should return book icon for EPUB format', () => {
      expect(getFormatIcon(PublishFormat.EPUB)).toBe('book');
    });

    it('should return picture_as_pdf icon for PDF format', () => {
      expect(getFormatIcon(PublishFormat.PDF_SIMPLE)).toBe('picture_as_pdf');
    });

    it('should return code icon for HTML format', () => {
      expect(getFormatIcon(PublishFormat.HTML)).toBe('code');
    });

    it('should return description icon for Markdown format', () => {
      expect(getFormatIcon(PublishFormat.MARKDOWN)).toBe('description');
    });

    it('should return insert_drive_file icon for unknown format', () => {
      expect(getFormatIcon('unknown' as PublishFormat)).toBe(
        'insert_drive_file'
      );
    });
  });
});
