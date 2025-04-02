import { Injectable, Logger } from '@nestjs/common';
import { Doc, XmlElement, XmlText } from 'yjs'; // Import XmlElement and XmlText

/**
 * Service for rendering ProseMirror documents as HTML
 * Following SOLID principles by extracting rendering responsibility from controller
 */
@Injectable()
export class DocumentRendererService {
  private readonly logger = new Logger(DocumentRendererService.name);

  /**
   * Render Yjs document as HTML
   * @param ydoc The Yjs document containing ProseMirror content
   * @param docId The document ID for logging/title
   * @returns Complete HTML document as string
   */
  public renderDocumentAsHtml(ydoc: Doc, docId: string): string {
    this.logger.debug(`Rendering document ${docId} as HTML`);

    // Extract ProseMirror content from Y.Doc
    const prosemirrorXmlFragment = ydoc.getXmlFragment('prosemirror');
    this.logger.debug(`Prosemirror XML Fragment: ${prosemirrorXmlFragment}`);

    // Handle empty documents - check if fragment exists AND has content
    if (!prosemirrorXmlFragment || prosemirrorXmlFragment.length === 0) {
      this.logger.warn(`Document ${docId} does not contain content or is empty`);
      return this.wrapInHtml('<div class="document-content">No content available</div>', docId);
    }

    // Convert XML content to HTML
    let htmlContent = '';
    try {
      // Use the correct function to convert the Yjs XML fragment directly
      htmlContent = this.convertXmlFragmentToHtml(prosemirrorXmlFragment);
    } catch (e) {
      this.logger.error(`Failed to convert XML fragment to HTML: ${e}`);
      htmlContent = '<p>Error rendering document content</p>';
    }

    // Wrap in full HTML document
    return this.wrapInHtml(htmlContent, docId);
  }

  /**
   * Wrap HTML content in a complete HTML document with styles
   * @param content The HTML content to wrap
   * @param title The document title
   * @returns Complete HTML document
   */
  private wrapInHtml(content: string, title: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${this.escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.5;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 1rem;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
    }
    p {
      margin: 1em 0;
    }
    a {
      color: #0074d9;
    }
    img {
      max-width: 100%;
    }
    table {
      border-collapse: collapse;
      width: 100%;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 0.5em;
    }
    th {
      background: #f5f5f5;
    }
  </style>
</head>
<body>
  <div class="document-content">
    ${content}
  </div>
</body>
</html>
    `;
  }

  /**
   * Parse and convert XML string to HTML
   * @param xmlString The XML string to parse and convert
   * @returns HTML string
   */
  private parseAndConvertXml(xmlString: string): string {
    // Simple regex-based parser since we're dealing with a known structure
    // This handles the case where the XML is actually just a string representation
    const paragraphRegex = /<paragraph>(.*?)<\/paragraph>/g;
    let match;
    let html = '';

    while ((match = paragraphRegex.exec(xmlString)) !== null) {
      const content = match[1].trim();
      // Add a non-breaking space in empty paragraphs to preserve spacing
      if (content === '') {
        html += `<p>&nbsp;</p>\n`;
      } else {
        html += `<p>${content}</p>\n`;
      }
    }

    // If no paragraphs were found, or HTML is empty, return the original as a fallback
    if (!html) {
      return `<p>${this.escapeHtml(xmlString)}</p>`;
    }

    return html;
  }

  /**
   * Convert a Yjs XML fragment to HTML
   * @param xmlFragment The Yjs XML fragment
   * @returns HTML string
   */
  private convertXmlFragmentToHtml(xmlFragment: any): string {
    if (!xmlFragment) {
      return '';
    }

    let html = '';

    // Iterate through the XML fragment nodes
    xmlFragment.forEach((xmlNode: any) => {
      // Handle each type of node
      const nodeName = xmlNode.nodeName;

      switch (nodeName) {
        case 'paragraph':
          // Convert paragraph to HTML <p> tag
          { let paragraphContent = '';
          // Always process child nodes using forEach
          if (typeof xmlNode.forEach === 'function') {
             xmlNode.forEach((child: any) => {
               paragraphContent += this.processXmlNode(child);
             });
          }
          // Handle empty paragraphs specifically - use &nbsp; to ensure rendering
          if (paragraphContent === '') {
             html += `<p>&nbsp;</p>`; // Match test expectation for empty paragraphs
          } else {
             html += `<p>${paragraphContent}</p>`;
          }
          break; }

        case 'heading':
          // Convert heading to HTML <h1>-<h6> tags
          { const level = xmlNode.getAttribute('level') || '1';
          let headingContent = '';
          // Always process child nodes using forEach
          if (typeof xmlNode.forEach === 'function') {
            xmlNode.forEach((child: any) => {
              headingContent += this.processXmlNode(child);
            });
          }
          html += `<h${level}>${headingContent}</h${level}>`;
          break; }

        case 'horizontal_rule':
          html += '<hr>';
          break;

        default:
          // For unhandled node types, try to get direct text or process children
          if (xmlNode.toString) {
            const textContent = xmlNode.toString();
            if (textContent) {
              html += this.escapeHtml(textContent);
            }
          } else if (xmlNode.childNodes && xmlNode.childNodes.length > 0) {
            for (const child of xmlNode.childNodes) {
              html += this.processXmlNode(child);
            }
          } else if (xmlNode.nodeType === 3) { // Text node
            html += this.escapeHtml(xmlNode.textContent || '');
          }
      }
    });

    return html;
  }

  /**
   * Process an individual XML node and convert it to HTML
   * @param xmlNode The XML node to process
   * @returns HTML string
   */
  private processXmlNode(xmlNode: any): string {
    this.logger.debug(`Processing node: ${xmlNode?.constructor?.name}`); // Log node type

    if (!xmlNode) {
      this.logger.debug('Node is null/undefined, returning empty string.');
      return '';
    }

    // Handle Yjs Text nodes
    if (xmlNode instanceof XmlText) {
      const textContent = xmlNode.toString();
      this.logger.debug(`Processing XmlText, content: "${textContent}"`);
      const escapedContent = this.escapeHtml(textContent);
      this.logger.debug(`Returning escaped text: "${escapedContent}"`);
      return escapedContent;
    }

    // Handle Yjs Element nodes
    if (xmlNode instanceof XmlElement) {
      const nodeName = xmlNode.nodeName;
      this.logger.debug(`Processing XmlElement: <${nodeName}>`);
      let content = '';

      // Iterate through children using forEach if available
      if (typeof xmlNode.forEach === 'function') {
        this.logger.debug(`Iterating children of <${nodeName}>...`);
        xmlNode.forEach((child: any) => {
          const childHtml = this.processXmlNode(child);
          this.logger.debug(`  Child (${child?.constructor?.name}) processed, adding: "${childHtml}"`);
          content += childHtml;
        });
        this.logger.debug(`Finished iterating children of <${nodeName}>. Accumulated content: "${content}"`);
      } else {
        this.logger.warn(`Cannot iterate over children of node: ${nodeName}`);
      }

      // Convert node based on type (inline elements primarily)
      let resultHtml = '';
      switch (nodeName) {
        case 'strong':
          resultHtml = `<strong>${content}</strong>`; break;
        case 'em':
          resultHtml = `<em>${content}</em>`; break;
        case 'link':
          { const href = xmlNode.getAttribute('href') || '#';
          resultHtml = `<a href="${this.escapeHtml(href)}">${content}</a>`; break; }
        case 'code': // Inline code
          resultHtml = `<code>${content}</code>`; break;
        case 'strike':
          resultHtml = `<s>${content}</s>`; break;
        case 'underline':
          resultHtml = `<u>${content}</u>`; break;
        case 'br': // Self-closing, no content
          resultHtml = '<br>'; break;
        case 'image': // Self-closing, uses attributes
          { const src = xmlNode.getAttribute('src') || '';
          const alt = xmlNode.getAttribute('alt') || '';
          resultHtml = `<img src="${this.escapeHtml(src)}" alt="${this.escapeHtml(alt)}">`; break; }
        // Block elements are handled in convertXmlFragmentToHtml,
        // but if encountered here, just return content.
        case 'paragraph':
        case 'heading':
        case 'horizontal_rule':
          this.logger.debug(`Passing content through for block element <${nodeName}>: "${content}"`);
          resultHtml = content; break; // Pass content through
        default:
          this.logger.warn(`Unhandled XML element type in processXmlNode: ${nodeName}`);
          resultHtml = content; break; // Return content for unhandled
      }
      this.logger.debug(`Returning HTML for <${nodeName}>: "${resultHtml}"`);
      return resultHtml;
    }

    // Fallback for unknown node types
    this.logger.warn(`Unknown node type encountered in processXmlNode: ${typeof xmlNode}, constructor: ${xmlNode?.constructor?.name}`);
    return '';
  }

  /**
   * Convert a ProseMirror document to HTML
   * @param prosemirrorDoc The ProseMirror document object
   * @returns HTML string
   */
  private convertProseMirrorToHtml(prosemirrorDoc: any): string {
    // This is a simplistic implementation that handles basic ProseMirror structure
    // A complete implementation would handle all node types, marks, etc.

    if (!prosemirrorDoc || !prosemirrorDoc.type) {
      return '';
    }

    // Helper function to render a node
    const renderNode = (node: any): string => {
      if (!node) return '';

      let html = '';

      switch (node.type) {
        case 'doc':
          // Document node - render its content
          if (node.content && Array.isArray(node.content)) {
            html = node.content.map(child => renderNode(child)).join('');
          }
          break;

        case 'paragraph':
          // Paragraph node
          if (node.content && Array.isArray(node.content)) {
            const content = node.content.map(child => renderNode(child)).join('');
            html = `<p>${content}</p>`;
          } else {
            html = '<p></p>';
          }
          break;

        case 'heading': {
          // Heading node (h1-h6)
          const level = node.attrs?.level || 1;
          if (node.content && Array.isArray(node.content)) {
            const content = node.content.map(child => renderNode(child)).join('');
            html = `<h${level}>${content}</h${level}>`;
          } else {
            html = `<h${level}></h${level}>`;
          }
          break;
        }

        case 'horizontalRule':
          // Horizontal rule
          html = '<hr>';
          break;

        case 'image': {
          // Image
          const src = node.attrs?.src || '';
          const alt = node.attrs?.alt || '';
          const title = node.attrs?.title ? ` title="${this.escapeHtml(node.attrs.title)}"` : '';
          html = `<img src="${this.escapeHtml(src)}" alt="${this.escapeHtml(alt)}"${title}>`;
          break;
        }

        case 'hardBreak':
          // Hard break (line break)
          html = '<br>';
          break;

        case 'text': {
          // Text node - apply marks if present
          let text = this.escapeHtml(node.text || '');

          // Apply marks (bold, italic, etc.)
          if (node.marks && Array.isArray(node.marks)) {
            node.marks.forEach((mark: any) => {
              switch (mark.type) {
                case 'strong':
                  text = `<strong>${text}</strong>`;
                  break;
                case 'em':
                  text = `<em>${text}</em>`;
                  break;
                case 'code':
                  text = `<code>${text}</code>`;
                  break;
                case 'link': {
                  const href = mark.attrs?.href || '';
                  const title = mark.attrs?.title ? ` title="${this.escapeHtml(mark.attrs.title)}"` : '';
                  text = `<a href="${this.escapeHtml(href)}"${title}>${text}</a>`;
                  break;
                }
                case 'strike':
                  text = `<s>${text}</s>`;
                  break;
                case 'underline':
                  text = `<u>${text}</u>`;
                  break;
                // Add more mark types as needed
              }
            });
          }

          html = text;
          break;
        }

        default:
          // Unknown node type - try to render content if available
          if (node.content && Array.isArray(node.content)) {
            html = node.content.map(child => renderNode(child)).join('');
          } else if (node.text) {
            html = this.escapeHtml(node.text);
          }
      }

      return html;
    };

    // Start rendering from the root node
    return renderNode(prosemirrorDoc);
  }

  /**
   * Escape HTML special characters to prevent XSS
   * @param text The text to escape
   * @returns Escaped text
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
