import { Injectable, Logger } from '@nestjs/common';
import { Doc } from 'yjs';

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
    
    // Handle empty documents
    if (!prosemirrorXmlFragment) {
      this.logger.warn(`Document ${docId} does not contain content`);
      return this.wrapInHtml('<div class="document-content">No content available</div>', docId);
    }

    // Convert XML content to HTML
    let htmlContent = '';
    try {
      const xmlString = prosemirrorXmlFragment.toString();
      htmlContent = this.parseAndConvertXml(xmlString);
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
    code {
      background: #f5f5f5;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-family: monospace;
    }
    pre {
      background: #f5f5f5;
      padding: 1em;
      border-radius: 3px;
      overflow-x: auto;
    }
    blockquote {
      border-left: 4px solid #ddd;
      padding-left: 1em;
      margin-left: 0;
      color: #666;
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

          // Get text content directly from the node if available
          if (xmlNode.toString) {
            // The toString() method returns the text content of the node
            const textContent = xmlNode.toString();
            if (textContent) {
              paragraphContent = this.escapeHtml(textContent);
            }
          } else if (xmlNode.childNodes && xmlNode.childNodes.length > 0) {
            // Process child nodes if available
            for (const child of xmlNode.childNodes) {
              if (child.nodeType === 3) { // Text node
                paragraphContent += this.escapeHtml(child.textContent || '');
              } else {
                paragraphContent += this.processXmlNode(child);
              }
            }
          }

          html += `<p>${paragraphContent}</p>`;
          break; }

        case 'heading':
          // Convert heading to HTML <h1>-<h6> tags
          { const level = xmlNode.getAttribute('level') || '1';
          let headingContent = '';

          if (xmlNode.toString) {
            const textContent = xmlNode.toString();
            if (textContent) {
              headingContent = this.escapeHtml(textContent);
            }
          } else if (xmlNode.childNodes && xmlNode.childNodes.length > 0) {
            for (const child of xmlNode.childNodes) {
              if (child.nodeType === 3) { // Text node
                headingContent += this.escapeHtml(child.textContent || '');
              } else {
                headingContent += this.processXmlNode(child);
              }
            }
          }

          html += `<h${level}>${headingContent}</h${level}>`;
          break; }

        case 'blockquote':
          { let blockquoteContent = '';

          if (xmlNode.toString) {
            const textContent = xmlNode.toString();
            if (textContent) {
              blockquoteContent = this.escapeHtml(textContent);
            }
          } else if (xmlNode.childNodes && xmlNode.childNodes.length > 0) {
            for (const child of xmlNode.childNodes) {
              blockquoteContent += this.processXmlNode(child);
            }
          }

          html += `<blockquote>${blockquoteContent}</blockquote>`;
          break; }

        case 'code_block':
          { const language = xmlNode.getAttribute('language') || '';
          let codeContent = '';

          if (xmlNode.toString) {
            const textContent = xmlNode.toString();
            if (textContent) {
              codeContent = this.escapeHtml(textContent);
            }
          } else if (xmlNode.childNodes && xmlNode.childNodes.length > 0) {
            for (const child of xmlNode.childNodes) {
              if (child.nodeType === 3) { // Text node
                codeContent += this.escapeHtml(child.textContent || '');
              }
            }
          }

          html += `<pre><code class="language-${language}">${codeContent}</code></pre>`;
          break; }

        case 'bullet_list':
          { let bulletListContent = '';

          if (xmlNode.childNodes && xmlNode.childNodes.length > 0) {
            for (const child of xmlNode.childNodes) {
              bulletListContent += this.processXmlNode(child);
            }
          }

          html += `<ul>${bulletListContent}</ul>`;
          break; }

        case 'ordered_list':
          { let orderedListContent = '';

          if (xmlNode.childNodes && xmlNode.childNodes.length > 0) {
            for (const child of xmlNode.childNodes) {
              orderedListContent += this.processXmlNode(child);
            }
          }

          html += `<ol>${orderedListContent}</ol>`;
          break; }

        case 'list_item':
          { let listItemContent = '';

          if (xmlNode.toString) {
            const textContent = xmlNode.toString();
            if (textContent) {
              listItemContent = this.escapeHtml(textContent);
            }
          } else if (xmlNode.childNodes && xmlNode.childNodes.length > 0) {
            for (const child of xmlNode.childNodes) {
              listItemContent += this.processXmlNode(child);
            }
          }

          html += `<li>${listItemContent}</li>`;
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
    if (!xmlNode) {
      return '';
    }

    // For text nodes, just return the escaped content
    if (xmlNode.nodeType === 3) { // Text node
      return this.escapeHtml(xmlNode.textContent || '');
    }

    const nodeName = xmlNode.nodeName;
    let content = '';

    // Process child nodes if any
    if (xmlNode.childNodes && xmlNode.childNodes.length > 0) {
      for (const child of xmlNode.childNodes) {
        content += this.processXmlNode(child);
      }
    }

    // Convert node based on type
    switch (nodeName) {
      case 'strong':
        return `<strong>${content}</strong>`;
      case 'em':
        return `<em>${content}</em>`;
      case 'link':
        { const href = xmlNode.getAttribute('href') || '#';
        return `<a href="${this.escapeHtml(href)}">${content}</a>`; }
      case 'code':
        return `<code>${content}</code>`;
      case 'strike':
        return `<s>${content}</s>`;
      case 'underline':
        return `<u>${content}</u>`;
      case 'br':
        return '<br>';
      case 'image':
        { const src = xmlNode.getAttribute('src') || '';
        const alt = xmlNode.getAttribute('alt') || '';
        return `<img src="${this.escapeHtml(src)}" alt="${this.escapeHtml(alt)}">`; }
      default:
        // For unhandled nodes, just return their content
        return content;
    }
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

        case 'blockquote':
          // Blockquote
          if (node.content && Array.isArray(node.content)) {
            const content = node.content.map(child => renderNode(child)).join('');
            html = `<blockquote>${content}</blockquote>`;
          } else {
            html = '<blockquote></blockquote>';
          }
          break;

        case 'bulletList':
          // Unordered list
          if (node.content && Array.isArray(node.content)) {
            const content = node.content.map(child => renderNode(child)).join('');
            html = `<ul>${content}</ul>`;
          } else {
            html = '<ul></ul>';
          }
          break;

        case 'orderedList':
          // Ordered list
          if (node.content && Array.isArray(node.content)) {
            const content = node.content.map(child => renderNode(child)).join('');
            html = `<ol>${content}</ol>`;
          } else {
            html = '<ol></ol>';
          }
          break;

        case 'listItem':
          // List item
          if (node.content && Array.isArray(node.content)) {
            const content = node.content.map(child => renderNode(child)).join('');
            html = `<li>${content}</li>`;
          } else {
            html = '<li></li>';
          }
          break;

        case 'horizontalRule':
          // Horizontal rule
          html = '<hr>';
          break;

        case 'table':
          // Table
          if (node.content && Array.isArray(node.content)) {
            const content = node.content.map(child => renderNode(child)).join('');
            html = `<table>${content}</table>`;
          } else {
            html = '<table></table>';
          }
          break;

        case 'tableRow':
          // Table row
          if (node.content && Array.isArray(node.content)) {
            const content = node.content.map(child => renderNode(child)).join('');
            html = `<tr>${content}</tr>`;
          } else {
            html = '<tr></tr>';
          }
          break;

        case 'tableCell': {
          // Table cell
          const tag = node.attrs?.header ? 'th' : 'td';
          if (node.content && Array.isArray(node.content)) {
            const content = node.content.map(child => renderNode(child)).join('');
            html = `<${tag}>${content}</${tag}>`;
          } else {
            html = `<${tag}></${tag}>`;
          }
          break;
        }

        case 'codeBlock': {
          // Code block
          const language = node.attrs?.language || '';
          if (node.content && Array.isArray(node.content)) {
            let content = node.content.map(child => {
              // For code blocks, we typically just want the text content
              if (child.type === 'text') {
                return this.escapeHtml(child.text || '');
              }
              return renderNode(child);
            }).join('');

            // If no line breaks, preserve them
            if (!content.includes('\n')) {
              content = content.replace(/\n/g, '<br>');
            }

            html = `<pre><code class="language-${language}">${content}</code></pre>`;
          } else {
            html = `<pre><code class="language-${language}"></code></pre>`;
          }
          break;
        }

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