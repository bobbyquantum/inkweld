import { Test, TestingModule } from '@nestjs/testing';
import { DocumentRendererService } from './document-renderer.service.js';
import { Logger } from '@nestjs/common';
import { Doc } from 'yjs';
import * as Y from 'yjs';
import { beforeEach, describe, expect, it, jest, spyOn } from 'bun:test';

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
      const ydoc = new Y.Doc();
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
      const ydoc = new Y.Doc();
      const xmlFragment = ydoc.getXmlFragment('prosemirror');

      // Add a paragraph
      const paragraph = new Y.XmlElement('paragraph');
      // Create a text node instead of directly inserting a string
      const text = new Y.XmlText('Hello, world!');
      paragraph.push([text]);
      xmlFragment.push([paragraph]);

      const result = service.renderDocumentAsHtml(ydoc, 'test-doc');

      // Should contain the paragraph content
      expect(result).toContain('<p>Hello, world!</p>');
      // Should have proper HTML structure
      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('<title>test-doc</title>');
    });

    it('should handle multiple paragraphs', () => {
      // Create a Yjs document with multiple paragraphs
      const ydoc = new Y.Doc();
      const xmlFragment = ydoc.getXmlFragment('prosemirror');

      // Add paragraphs
      const paragraph1 = new Y.XmlElement('paragraph');
      const text1 = new Y.XmlText('First paragraph');
      paragraph1.push([text1]);

      const paragraph2 = new Y.XmlElement('paragraph');
      const text2 = new Y.XmlText('Second paragraph');
      paragraph2.push([text2]);

      xmlFragment.push([paragraph1, paragraph2]);

      const result = service.renderDocumentAsHtml(ydoc, 'test-doc');

      // Should contain both paragraphs
      expect(result).toContain('<p>First paragraph</p>');
      expect(result).toContain('<p>Second paragraph</p>');
    });

    it('should handle an empty paragraph', () => {
      // Create a Yjs document with an empty paragraph
      const ydoc = new Y.Doc();
      const xmlFragment = ydoc.getXmlFragment('prosemirror');

      // Add empty paragraph
      const paragraph = new Y.XmlElement('paragraph');
      xmlFragment.push([paragraph]);

      const result = service.renderDocumentAsHtml(ydoc, 'test-doc');

      // Empty paragraphs should be rendered with a non-breaking space to maintain height
      expect(result).toContain('<p>&nbsp;</p>');
    });
  });

  describe('HTML escaping and security', () => {
    it('should escape HTML content in paragraphs', () => {
      // Create a Yjs document with HTML content
      const ydoc = new Y.Doc();
      const xmlFragment = ydoc.getXmlFragment('prosemirror');

      // Add paragraph with HTML
      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText('<script>alert("XSS");</script>');
      paragraph.push([text]);
      xmlFragment.push([paragraph]);

      const result = service.renderDocumentAsHtml(ydoc, 'test-doc');

      // HTML should be escaped
      expect(result).toContain('&lt;script&gt;alert("XSS");&lt;/script&gt;');
      expect(result).not.toContain('<script>alert("XSS");</script>');
    });

    it('should handle title HTML escaping', () => {
      // Create a document with potentially dangerous title
      const ydoc = new Y.Doc();
      const xmlFragment = ydoc.getXmlFragment('prosemirror');

      // Add a simple paragraph
      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText('Content');
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
      const ydoc = new Y.Doc();
      const xmlFragment = ydoc.getXmlFragment('prosemirror');

      // Create heading with level 1
      const heading1 = new Y.XmlElement('heading');
      heading1.setAttribute('level', '1');
      const text1 = new Y.XmlText('Heading 1');
      heading1.push([text1]);

      // Create heading with level 2
      const heading2 = new Y.XmlElement('heading');
      heading2.setAttribute('level', '2');
      const text2 = new Y.XmlText('Heading 2');
      heading2.push([text2]);

      xmlFragment.push([heading1, heading2]);

      const result = service.renderDocumentAsHtml(ydoc, 'test-doc');

      // Should contain properly formatted headings
      expect(result).toContain('<h1>Heading 1</h1>');
      expect(result).toContain('<h2>Heading 2</h2>');
    });

    it('should handle formatting marks within paragraphs', () => {
      // This test is more complex as it requires nested XML elements
      const ydoc = new Y.Doc();
      const xmlFragment = ydoc.getXmlFragment('prosemirror');

      // Create paragraph
      const paragraph = new Y.XmlElement('paragraph');

      // Add regular text
      const plainText1 = new Y.XmlText('Text with ');
      paragraph.push([plainText1]);

      // Add strong element
      const strong = new Y.XmlElement('strong');
      const boldText = new Y.XmlText('bold');
      strong.push([boldText]);
      paragraph.push([strong]);

      // Add more text
      const plainText2 = new Y.XmlText(' and ');
      paragraph.push([plainText2]);

      // Add emphasis element
      const em = new Y.XmlElement('em');
      const italicText = new Y.XmlText('italic');
      em.push([italicText]);
      paragraph.push([em]);

      // Add final text
      const plainText3 = new Y.XmlText(' formatting.');
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

      // Mock a document that will cause an error during parsing
      const mockYdoc = {
        getXmlFragment: jest.fn().mockReturnValue({
          toString: jest.fn().mockImplementation(() => {
            throw new Error('Parse error');
          })
        })
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
    it('should render lists correctly', () => {
      const ydoc = new Y.Doc();
      const xmlFragment = ydoc.getXmlFragment('prosemirror');

      // Create unordered list
      const bulletList = new Y.XmlElement('bullet_list');

      // Create list items
      const item1 = new Y.XmlElement('list_item');
      const item1Text = new Y.XmlText('Item 1');
      item1.push([item1Text]);

      const item2 = new Y.XmlElement('list_item');
      const item2Text = new Y.XmlText('Item 2');
      item2.push([item2Text]);

      bulletList.push([item1, item2]);

      // Create ordered list
      const orderedList = new Y.XmlElement('ordered_list');

      // Create list items
      const oItem1 = new Y.XmlElement('list_item');
      const oItem1Text = new Y.XmlText('Ordered Item 1');
      oItem1.push([oItem1Text]);

      const oItem2 = new Y.XmlElement('list_item');
      const oItem2Text = new Y.XmlText('Ordered Item 2');
      oItem2.push([oItem2Text]);

      orderedList.push([oItem1, oItem2]);

      xmlFragment.push([bulletList, orderedList]);

      const result = service.renderDocumentAsHtml(ydoc, 'test-doc');

      // Check for unordered list
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>Item 1</li>');
      expect(result).toContain('<li>Item 2</li>');
      expect(result).toContain('</ul>');

      // Check for ordered list
      expect(result).toContain('<ol>');
      expect(result).toContain('<li>Ordered Item 1</li>');
      expect(result).toContain('<li>Ordered Item 2</li>');
      expect(result).toContain('</ol>');
    });

    it('should render blockquotes', () => {
      const ydoc = new Y.Doc();
      const xmlFragment = ydoc.getXmlFragment('prosemirror');

      // Create blockquote
      const blockquote = new Y.XmlElement('blockquote');

      // Add paragraph inside blockquote
      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText('Quoted text');
      paragraph.push([text]);
      blockquote.push([paragraph]);

      xmlFragment.push([blockquote]);

      const result = service.renderDocumentAsHtml(ydoc, 'test-doc');

      // Check for blockquote with nested paragraph
      expect(result).toContain('<blockquote>');
      expect(result).toContain('Quoted text');
      expect(result).toContain('</blockquote>');
    });

    it('should render code blocks with language', () => {
      const ydoc = new Y.Doc();
      const xmlFragment = ydoc.getXmlFragment('prosemirror');

      // Create code block with language
      const codeBlock = new Y.XmlElement('code_block');
      codeBlock.setAttribute('language', 'javascript');
      const codeText = new Y.XmlText('const x = 10;\nconsole.log(x);');
      codeBlock.push([codeText]);

      xmlFragment.push([codeBlock]);

      const result = service.renderDocumentAsHtml(ydoc, 'test-doc');

      // Check for code block with language class
      expect(result).toContain('<pre><code class="language-javascript">');
      expect(result).toContain('const x = 10;\nconsole.log(x);');
      expect(result).toContain('</code></pre>');
    });

    it('should render horizontal rules', () => {
      const ydoc = new Y.Doc();
      const xmlFragment = ydoc.getXmlFragment('prosemirror');

      // Create horizontal rule
      const hr = new Y.XmlElement('horizontal_rule');

      xmlFragment.push([hr]);

      const result = service.renderDocumentAsHtml(ydoc, 'test-doc');

      // Check for horizontal rule
      expect(result).toContain('<hr>');
    });
  });
});
