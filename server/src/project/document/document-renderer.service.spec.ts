import { Test, TestingModule } from '@nestjs/testing';
import { DocumentRendererService } from './document-renderer.service.js';
import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest, spyOn } from 'bun:test';
import { Doc, XmlElement, XmlText } from 'yjs';
describe('DocumentRendererService', () => {
  let service: DocumentRendererService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentRendererService],
    }).compile();

    service = module.get<DocumentRendererService>(DocumentRendererService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('renderDocumentAsHtml', () => {
    it('should handle empty documents', () => {
      // Create an empty Yjs document
      const ydoc = new Doc();
      const result = service.renderDocumentAsHtml(ydoc, 'test-doc');

      // Should contain a placeholder message
      expect(result).toContain('No content available');
      // Should be wrapped in HTML structure
      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('<html>');
      expect(result).toContain('</html>');
    });

    it('should render a simple paragraph', () => {
      // Create a Yjs document with a simple paragraph
      const ydoc = new Doc();
      const xmlFragment = ydoc.getXmlFragment('prosemirror');

      // Add a paragraph
      const paragraph = new XmlElement('paragraph');
      // Create a text node instead of directly inserting a string

      xmlFragment.push([paragraph]);
      const text = new XmlText('Hello, world!');
      paragraph.push([text]);

      const result = service.renderDocumentAsHtml(ydoc, 'test-doc');

      // Should contain the paragraph content
      expect(result).toContain('<p>Hello, world!</p>');
      // Should have proper HTML structure
      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('<title>test-doc</title>');
    });

    it('should handle multiple paragraphs', () => {
      // Create a Yjs document with multiple paragraphs
      const ydoc = new Doc();
      const xmlFragment = ydoc.getXmlFragment('prosemirror');

      // Add paragraphs
      const paragraph1 = new XmlElement('paragraph');
      const text1 = new XmlText('First paragraph');
      paragraph1.push([text1]);

      const paragraph2 = new XmlElement('paragraph');
      const text2 = new XmlText('Second paragraph');
      paragraph2.push([text2]);

      xmlFragment.push([paragraph1, paragraph2]);

      const result = service.renderDocumentAsHtml(ydoc, 'test-doc');

      // Should contain both paragraphs
      expect(result).toContain('<p>First paragraph</p>');
      expect(result).toContain('<p>Second paragraph</p>');
    });

    it('should handle an empty paragraph', () => {
      // Create a Yjs document with an empty paragraph
      const ydoc = new Doc();
      const xmlFragment = ydoc.getXmlFragment('prosemirror');

      // Add empty paragraph
      const paragraph = new XmlElement('paragraph');
      xmlFragment.push([paragraph]);

      const result = service.renderDocumentAsHtml(ydoc, 'test-doc');

      // Empty paragraphs should be rendered with a non-breaking space to maintain height
      expect(result).toContain('<p>&nbsp;</p>');
    });
  });

  describe('HTML escaping and security', () => {
    it('should escape HTML content in paragraphs', () => {
      // Create a Yjs document with HTML content
      const ydoc = new Doc();
      const xmlFragment = ydoc.getXmlFragment('prosemirror');

      // Add paragraph with HTML
      const paragraph = new XmlElement('paragraph');
      const text = new XmlText('<script>alert("XSS");</script>');
      paragraph.push([text]);
      xmlFragment.push([paragraph]);

      const result = service.renderDocumentAsHtml(ydoc, 'test-doc');

      // HTML should be escaped
      expect(result).toContain('&lt;script&gt;alert(&quot;XSS&quot;);&lt;/script&gt;');
      expect(result).not.toContain('<script>alert("XSS");</script>');
    });

    it('should handle title HTML escaping', () => {
      // Create a document with potentially dangerous title
      const ydoc = new Doc();
      const xmlFragment = ydoc.getXmlFragment('prosemirror');

      // Add a simple paragraph
      const paragraph = new XmlElement('paragraph');
      const text = new XmlText('Content');
      paragraph.push([text]);
      xmlFragment.push([paragraph]);

      const result = service.renderDocumentAsHtml(ydoc, '"><script>alert("XSS");</script>');

      // Title should be escaped in the HTML output
      expect(result).toContain('<title>&quot;&gt;&lt;script&gt;alert(&quot;XSS&quot;);&lt;/script&gt;</title>');
      expect(result).not.toContain('<title>"><script>alert("XSS");</script></title>');
    });
  });

  describe('Document structure handling', () => {
    it('should handle headings', () => {
      // Create a Yjs document with headings
      const ydoc = new Doc();
      const xmlFragment = ydoc.getXmlFragment('prosemirror');

      // Create heading with level 1
      const heading1 = new XmlElement('heading');
      xmlFragment.push([heading1]);

      heading1.setAttribute('level', '1');
      const text1 = new XmlText('Heading 1');
      heading1.push([text1]);

      // Create heading with level 2
      const heading2 = new XmlElement('heading');
      xmlFragment.push([heading2]);

      heading2.setAttribute('level', '2');
      const text2 = new XmlText('Heading 2');
      heading2.push([text2]);


      const result = service.renderDocumentAsHtml(ydoc, 'test-doc');

      // Should contain properly formatted headings
      expect(result).toContain('<h1>Heading 1</h1>');
      expect(result).toContain('<h2>Heading 2</h2>');
    });

    it('should handle formatting marks within paragraphs', () => {
      // This test is more complex as it requires nested XML elements
      const ydoc = new Doc();
      const xmlFragment = ydoc.getXmlFragment('prosemirror');

      // Create paragraph
      const paragraph = new XmlElement('paragraph');

      // Add regular text
      const plainText1 = new XmlText('Text with ');
      paragraph.push([plainText1]);

      // Add strong element
      const strong = new XmlElement('strong');
      const boldText = new XmlText('bold');
      strong.push([boldText]);
      paragraph.push([strong]);

      // Add more text
      const plainText2 = new XmlText(' and ');
      paragraph.push([plainText2]);

      // Add emphasis element
      const em = new XmlElement('em');
      const italicText = new XmlText('italic');
      em.push([italicText]);
      paragraph.push([em]);

      // Add final text
      const plainText3 = new XmlText(' formatting.');
      paragraph.push([plainText3]);

      xmlFragment.push([paragraph]);

      const result = service.renderDocumentAsHtml(ydoc, 'test-doc');

      // Test for formatted content
      expect(result).toContain('<p>Text with <strong>bold</strong> and <em>italic</em> formatting.</p>');
    });
  });

  describe('Error handling', () => {
    it('should handle exceptions during XML parsing', () => {
      // Create a spy on the logger to check for error messages
      const loggerErrorSpy = spyOn(Logger.prototype, 'error').mockImplementation(() => {});

      // Mock a document whose fragment causes an error during processing/iteration
      const mockFragment = {
        // Make it iterable but throw on iteration attempt
        [Symbol.iterator]: () => { throw new Error('Simulated processing error'); },
        // Add length property for the empty check (so it passes the initial check)
        length: 1,
      };
      const mockYdoc = {
        getXmlFragment: jest.fn().mockReturnValue(mockFragment)
      } as unknown as Doc;

      const result = service.renderDocumentAsHtml(mockYdoc, 'test-doc');

      // Should log an error
      expect(loggerErrorSpy).toHaveBeenCalled();

      // Should still return valid HTML with an error message
      expect(result).toContain('<p>Error rendering document content</p>');
      expect(result).toContain('<!DOCTYPE html>');

      // Clean up
      loggerErrorSpy.mockRestore();
    });
  });

  // Add more advanced tests for complex document structures
  describe('Complex document features', () => {


    it('should render horizontal rules', () => {
      const ydoc = new Doc();
      const xmlFragment = ydoc.getXmlFragment('prosemirror');

      // Create horizontal rule
      const hr = new XmlElement('horizontal_rule');

      xmlFragment.push([hr]);

      const result = service.renderDocumentAsHtml(ydoc, 'test-doc');

      // Check for horizontal rule
      expect(result).toContain('<hr>');
    });
  });
});
