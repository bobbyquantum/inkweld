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
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <title>${this.escapeHtml(title)}</title>
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
        html += `<br/>\n`;
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
      this.logger.warn('XML fragment is null or undefined');
      return '';
    }

    this.logger.debug(`Converting XML fragment to HTML. Fragment type: ${typeof xmlFragment}, constructor: ${xmlFragment.constructor?.name}`);

    let html = '';

    try {
      // Iterate through the XML fragment nodes
      this.logger.debug(`Starting iteration through XML fragment with ${xmlFragment.length} nodes`);

      xmlFragment.forEach((xmlNode: any, index: number) => {
        // Log node details
        const nodeName = xmlNode?.nodeName;
        const nodeType = typeof xmlNode;
        const nodeConstructor = xmlNode?.constructor?.name;

        this.logger.debug(`Processing fragment node [${index}]: type=${nodeType}, constructor=${nodeConstructor}, nodeName=${nodeName}`);

        switch (nodeName) {
          case 'paragraph':
            this.logger.debug(`[${index}] Processing paragraph node`);
            // Convert paragraph to HTML <p> tag
            { let paragraphContent = '';
            // Always process child nodes using forEach
            if (typeof xmlNode.forEach === 'function') {
               this.logger.debug(`[${index}] Paragraph has children, processing them`);
               xmlNode.forEach((child: any, childIndex: number) => {
                 this.logger.debug(`[${index}.${childIndex}] Processing paragraph child`);
                 const childContent = this.processXmlNode(child);
                 this.logger.debug(`[${index}.${childIndex}] Child content: "${childContent}"`);
                 paragraphContent += childContent;
               });
               this.logger.debug(`[${index}] Final paragraph content: "${paragraphContent}"`);
            } else {
               this.logger.warn(`[${index}] Paragraph node doesn't have forEach method`);
            }
            // Handle empty paragraphs specifically - use br to ensure rendering
            if (paragraphContent === '') {
               this.logger.debug(`[${index}] Empty paragraph, using br`);
               html += `<br/>\n`;
            } else {
               this.logger.debug(`[${index}] Adding paragraph: <p>${paragraphContent}</p>`);
               html += `<p>${paragraphContent}</p>\n`;
            }
            break; }

          case 'heading':
            this.logger.debug(`[${index}] Processing heading node`);
            // Convert heading to HTML <h1>-<h6> tags
            {
              // Safely extract the level attribute and ensure it's a string
              let level: string;
              try {
                const rawLevel = xmlNode.getAttribute('level');
                this.logger.debug(`[${index}] Raw heading level: ${rawLevel}, type: ${typeof rawLevel}`);

                // Convert to string and ensure it's between 1-6
                level = String(rawLevel || 1);
                // Validate level is between 1-6
                const numLevel = parseInt(level, 10);
                if (isNaN(numLevel) || numLevel < 1 || numLevel > 6) {
                  this.logger.warn(`[${index}] Invalid heading level ${level}, defaulting to 1`);
                  level = '1';
                }
              } catch (error) {
                this.logger.error(`[${index}] Error getting heading level: ${error}, defaulting to 1`);
                level = '1';
              }

              let headingContent = '';
              // Always process child nodes using forEach
              if (typeof xmlNode.forEach === 'function') {
                this.logger.debug(`[${index}] Heading has children, processing them`);
                xmlNode.forEach((child: any, childIndex: number) => {
                  this.logger.debug(`[${index}.${childIndex}] Processing heading child`);
                  const childContent = this.processXmlNode(child);
                  this.logger.debug(`[${index}.${childIndex}] Child content: "${childContent}"`);
                  headingContent += childContent;
                });
                this.logger.debug(`[${index}] Final heading content: "${headingContent}"`);
              } else {
                this.logger.warn(`[${index}] Heading node doesn't have forEach method`);
              }

              this.logger.debug(`[${index}] Adding heading: <h${level}>${headingContent}</h${level}>`);
              html += `<h${level}>${headingContent}</h${level}>\n`;
              break;
            }

          case 'horizontal_rule':
            this.logger.debug(`[${index}] Adding horizontal rule`);
            html += '<hr/>\n';
            break;

          default:
            this.logger.debug(`[${index}] Processing default/unknown node type: ${nodeName}`);
            // For unhandled node types, try to get direct text or process children
            if (xmlNode.toString) {
              const textContent = xmlNode.toString();
              this.logger.debug(`[${index}] Node has toString method, content: "${textContent}"`);
              if (textContent) {
                const escapedContent = this.escapeHtml(textContent);
                this.logger.debug(`[${index}] Adding escaped text: "${escapedContent}"`);
                html += escapedContent;
              }
            } else if (xmlNode.childNodes && xmlNode.childNodes.length > 0) {
              this.logger.debug(`[${index}] Node has ${xmlNode.childNodes.length} childNodes`);
              for (const child of xmlNode.childNodes) {
                const childContent = this.processXmlNode(child);
                this.logger.debug(`[${index}] Child node content: "${childContent}"`);
                html += childContent;
              }
            } else if (xmlNode.nodeType === 3) { // Text node
              const textContent = xmlNode.textContent || '';
              this.logger.debug(`[${index}] Text node content: "${textContent}"`);
              const escapedContent = this.escapeHtml(textContent);
              this.logger.debug(`[${index}] Adding escaped text node content: "${escapedContent}"`);
              html += escapedContent;
            } else {
              this.logger.warn(`[${index}] Unhandled node type with no processing method`);
            }
        }
      });

      this.logger.debug(`Fragment conversion complete. Final HTML length: ${html.length}`);
    } catch (error) {
      this.logger.error(`Error during XML fragment conversion: ${error instanceof Error ? error.message : String(error)}`);
      this.logger.error(`Error stack: ${error instanceof Error ? error.stack : 'No stack available'}`);
      return '<p>Error converting document content</p>';
    }

    return html;
  }

  /**
   * Process an individual XML node and convert it to HTML
   * @param xmlNode The XML node to process
   * @returns HTML string
   */
  private processXmlNode(xmlNode: any): string {
    const nodeType = typeof xmlNode;
    const nodeConstructor = xmlNode?.constructor?.name;
    this.logger.debug(`Processing node: type=${nodeType}, constructor=${nodeConstructor}`);

    if (!xmlNode) {
      this.logger.debug('Node is null/undefined, returning empty string.');
      return '';
    }

    // Handle Yjs Text nodes
    if (xmlNode instanceof XmlText) {
      try {
        const textContent = xmlNode.toString();
        this.logger.debug(`Processing XmlText, content: "${textContent}"`);
        const escapedContent = this.escapeHtml(textContent);
        this.logger.debug(`Returning escaped text: "${escapedContent}"`);
        return escapedContent;
      } catch (error) {
        this.logger.error(`Error processing XmlText node: ${error instanceof Error ? error.message : String(error)}`);
        return '';
      }
    }

    // Handle Yjs Element nodes
    if (xmlNode instanceof XmlElement) {
      try {
        const nodeName = xmlNode.nodeName;
        this.logger.debug(`Processing XmlElement: <${nodeName}>`);
        let content = '';

        // Log element attributes if available
        try {
          if (typeof xmlNode.getAttributes === 'function') {
            const attrs = xmlNode.getAttributes();
            this.logger.debug(`Element attributes: ${JSON.stringify(attrs)}`);
          }
        } catch (attrError) {
          this.logger.warn(`Failed to get attributes: ${attrError instanceof Error ? attrError.message : String(attrError)}`);
        }

        // Iterate through children using forEach if available
        if (typeof xmlNode.forEach === 'function') {
          this.logger.debug(`Iterating children of <${nodeName}>...`);
          let childCount = 0;

          xmlNode.forEach((child: any) => {
            this.logger.debug(`Processing child ${childCount} of <${nodeName}>`);
            try {
              const childHtml = this.processXmlNode(child);
              this.logger.debug(`Child ${childCount} of <${nodeName}> processed, content: "${childHtml}"`);
              content += childHtml;
              childCount++;
            } catch (childError) {
              this.logger.error(`Error processing child ${childCount} of <${nodeName}>: ${childError instanceof Error ? childError.message : String(childError)}`);
            }
          });

          this.logger.debug(`Processed ${childCount} children of <${nodeName}>. Accumulated content: "${content}"`);
        } else {
          this.logger.warn(`Cannot iterate over children of node: ${nodeName} (no forEach method)`);
        }

        // Convert node based on type (inline elements primarily)
        let resultHtml = '';
        switch (nodeName) {
          case 'strong':
            this.logger.debug(`Converting <strong> element with content: "${content}"`);
            resultHtml = `<strong>${content}</strong>`;
            break;
          case 'em':
            this.logger.debug(`Converting <em> element with content: "${content}"`);
            resultHtml = `<em>${content}</em>`;
            break;
          case 'link':
            try {
              const href = xmlNode.getAttribute('href') || '#';
              this.logger.debug(`Converting <link> element with href="${href}", content: "${content}"`);
              resultHtml = `<a href="${this.escapeHtml(href)}">${content}</a>`;
            } catch (linkError) {
              this.logger.error(`Error processing link attributes: ${linkError instanceof Error ? linkError.message : String(linkError)}`);
              resultHtml = content; // Fallback to just the content
            }
            break;
          case 'code': // Inline code
            this.logger.debug(`Converting <code> element with content: "${content}"`);
            resultHtml = `<code>${content}</code>`;
            break;
          case 'strike':
            this.logger.debug(`Converting <strike> element with content: "${content}"`);
            resultHtml = `<s>${content}</s>`;
            break;
          case 'underline':
            this.logger.debug(`Converting <underline> element with content: "${content}"`);
            resultHtml = `<u>${content}</u>`;
            break;
          case 'br': // Self-closing, no content
            this.logger.debug(`Converting <br> element`);
            resultHtml = '<br>';
            break;
          case 'image': // Self-closing, uses attributes
            try {
              const src = xmlNode.getAttribute('src') || '';
              const alt = xmlNode.getAttribute('alt') || '';
              this.logger.debug(`Converting <image> element with src="${src}", alt="${alt}"`);
              resultHtml = `<img src="${this.escapeHtml(src)}" alt="${this.escapeHtml(alt)}">`;
            } catch (imgError) {
              this.logger.error(`Error processing image attributes: ${imgError instanceof Error ? imgError.message : String(imgError)}`);
              resultHtml = '[image]'; // Fallback placeholder
            }
            break;
          // Block elements are handled in convertXmlFragmentToHtml,
          // but if encountered here, just return content.
          case 'paragraph':
          case 'heading':
          case 'horizontal_rule':
            this.logger.debug(`Passing content through for block element <${nodeName}>: "${content}"`);
            resultHtml = content; // Pass content through
            break;
          default:
            this.logger.warn(`Unhandled XML element type in processXmlNode: ${nodeName}, using content as-is`);
            resultHtml = content; // Return content for unhandled
        }

        this.logger.debug(`Processed <${nodeName}>, final HTML: "${resultHtml}"`);
        return resultHtml;
      } catch (elementError) {
        this.logger.error(`Error processing XML element: ${elementError instanceof Error ? elementError.message : String(elementError)}`);
        return '';
      }
    }

    // Fallback for unknown node types
    this.logger.warn(`Unknown node type encountered in processXmlNode: ${nodeType}, constructor: ${nodeConstructor}`);
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
