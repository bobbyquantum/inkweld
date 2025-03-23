import {
  Controller,
  Get,
  Param,
  UseGuards,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  Header,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiParam,
  ApiCookieAuth,
  ApiProduces,
} from '@nestjs/swagger';
import { LevelDBManagerService } from '../common/persistence/leveldb-manager.service.js';
import { DocumentDto } from './document.dto.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { Doc } from 'yjs';

@ApiTags('Document API')
@ApiCookieAuth()
@Controller('api/v1/projects')
export class DocumentController {
  private readonly logger = new Logger(DocumentController.name);

  constructor(private readonly levelDBManager: LevelDBManagerService) {}

  /**
   * List all documents in a specific project
   * @param username The owner of the project
   * @param projectSlug The project identifier
   * @returns Array of document metadata
   */
  @UseGuards(SessionAuthGuard)
  @Get(':username/:projectSlug/docs')
  @ApiOperation({
    summary: 'List all documents in a project',
    description: 'Retrieves a list of all documents in the specified project.'
  })
  @ApiParam({
    name: 'username',
    required: true,
    description: 'The username of the project owner',
    example: 'testuser'
  })
  @ApiParam({
    name: 'projectSlug',
    required: true,
    description: 'The slug identifier of the project',
    example: 'my-project'
  })
  @ApiOkResponse({
    description: 'Successfully retrieved the list of documents',
    type: [DocumentDto],
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing authentication'
  })
  @ApiForbiddenResponse({
    description: 'User does not have permission to access this project'
  })
  @ApiNotFoundResponse({
    description: 'Project not found'
  })
  async listDocuments(
    @Param('username') username: string,
    @Param('projectSlug') projectSlug: string,
  ): Promise<DocumentDto[]> {
    try {
      this.logger.log(`Listing documents for project ${username}/${projectSlug}`);

      // Get documents directly from the LevelDB database using the manager
      const documentIds = await this.levelDBManager.listProjectDocuments(username, projectSlug);

      if (documentIds.length === 0) {
        return [] ; // No documents found
      }

      // Get the database for this project to access metadata
      const db = await this.levelDBManager.getProjectDatabase(username, projectSlug);
      const documents: DocumentDto[] = [];

      // For each document ID, fetch metadata and create DocumentDto objects
      for (const docId of documentIds) {
        try {
          // Try to get metadata for the document
          const ownerId = await db.getMeta(docId, 'ownerId');
          const lastModified = await db.getMeta(docId, 'lastModified') || new Date().toISOString();

          // Parse the document ID to extract components
          const parts = docId.split(':');
          const name = parts.length === 3 ? parts[2] : 'Untitled';

          // Create the document dto
          const docDto = new DocumentDto({
            id: docId,
            ownerId: ownerId || username, // Default to username if no owner is set
            name,
            lastModified,
            username,
            projectSlug
          });

          documents.push(docDto);
        } catch (err: any) {
          this.logger.warn(`Error retrieving document ${docId}: ${err.message}`);
          // Continue with other documents - don't fail the whole request
        }
      }

      return documents;
    } catch (error) {
      this.logger.error(
        `Failed to list documents for ${username}/${projectSlug}:`,
        error,
      );
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to list documents');
    }
  }

  /**
   * Get a document by ID within a project
   */
  @UseGuards(SessionAuthGuard)
  @Get(':username/:projectSlug/docs/:docId')
  @ApiOperation({
    summary: 'Get document information',
    description: 'Retrieves metadata for a specific document in a project.'
  })
  @ApiParam({
    name: 'username',
    required: true,
    description: 'The username of the project owner',
    example: 'testuser'
  })
  @ApiParam({
    name: 'projectSlug',
    required: true,
    description: 'The slug identifier of the project',
    example: 'my-project'
  })
  @ApiParam({
    name: 'docId',
    required: true,
    description: 'The document identifier',
    example: 'document1'
  })
  @ApiOkResponse({
    description: 'Successfully retrieved the document information',
    type: DocumentDto
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing authentication'
  })
  @ApiNotFoundResponse({
    description: 'Document not found'
  })
  async getDocumentInfo(
    @Param('username') username: string,
    @Param('projectSlug') projectSlug: string,
    @Param('docId') docId: string,
  ) {
    try {
      this.logger.log(`Getting document info for ${docId} in project ${username}/${projectSlug}`);

      // Construct the full document ID
      const documentId = `${docId}:${username}:${projectSlug}`;

      // Get the database for this project
      const db = await this.levelDBManager.getProjectDatabase(username, projectSlug);

      // Try to get document metadata
      try {
        const ownerId = await db.getMeta(documentId, 'ownerId');
        const lastModified = await db.getMeta(documentId, 'lastModified') || new Date().toISOString();

        // If we can get metadata, the document exists
        return new DocumentDto({
          id: documentId,
          ownerId: ownerId || username,
          name: docId || 'Untitled',
          lastModified,
          username,
          projectSlug
        });
      } catch (err: any) {
        this.logger.warn(`Document ${documentId} not found or error: ${err.message}`);
        throw new NotFoundException(`Document ${documentId} not found`);
      }
    } catch (error) {
      this.logger.error(`Failed to get document ${docId}:`, error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to get document');
    }
  }

  /**
   * Render a document as static HTML
   * @param username The owner of the project
   * @param projectSlug The project identifier
   * @param docId The document identifier
   * @returns HTML representation of the document
   */
  @UseGuards(SessionAuthGuard)
  @Get(':username/:projectSlug/docs/:docId/html')
  @ApiOperation({
    summary: 'Render document as HTML',
    description: 'Renders a ProseMirror document as static HTML.'
  })
  @ApiParam({
    name: 'username',
    required: true,
    description: 'The username of the project owner',
    example: 'testuser'
  })
  @ApiParam({
    name: 'projectSlug',
    required: true,
    description: 'The slug identifier of the project',
    example: 'my-project'
  })
  @ApiParam({
    name: 'docId',
    required: true,
    description: 'The document identifier',
    example: 'document1'
  })
  @ApiProduces('text/html')
  @ApiOkResponse({
    description: 'Successfully rendered the document as HTML',
    type: String
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing authentication'
  })
  @ApiNotFoundResponse({
    description: 'Document not found'
  })
  @Header('Content-Type', 'text/html')
  async renderHtml(
    @Param('username') username: string,
    @Param('projectSlug') projectSlug: string,
    @Param('docId') docId: string,
    @Res() response,
  ): Promise<void> {
    try {
      this.logger.log(`Rendering HTML for document ${docId} in project ${username}/${projectSlug}`);

      // Get the doc from database
      const documentId = `${username}:${projectSlug}:${docId}`;
      let ydoc: Doc;

      try {
        // Get access to project database
        const db = await this.levelDBManager.getProjectDatabase(username, projectSlug);

        // Check if document exists
        try {
          // This will throw if the document doesn't exist
          await db.getMeta(documentId, 'ownerId');
        } catch (_err) {
          throw new NotFoundException(`Document ${documentId} not found`);
        }

        // Load the Y.Doc from database
        ydoc = await db.getYDoc(documentId);
      } catch (error) {
        if (error instanceof NotFoundException) {
          throw error;
        }
        this.logger.error(`Failed to retrieve document ${documentId}:`, error);
        throw new InternalServerErrorException('Failed to retrieve document');
      }

      const prosemirrorXmlFragment = ydoc.getXmlFragment('prosemirror');
      //log to debug
      this.logger.debug(`Prosemirror XML Fragment: ${prosemirrorXmlFragment}`);
      if (!prosemirrorXmlFragment) {
        this.logger.warn(`Document ${documentId} does not contain content`);
        response.send('<div class="document-content">No content available</div>');
        return;
      }

      // Convert Yjs XML fragment to HTML
      let htmlContent = '';

      try {
        const xmlString = prosemirrorXmlFragment.toString();
        htmlContent = this.parseAndConvertXml(xmlString);
      } catch (e) {
        this.logger.error(`Failed to convert XML fragment to HTML: ${e}`);
        htmlContent = '<p>Error rendering document content</p>';
      }

      // Build final HTML
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${this.escapeHtml(docId)}</title>
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
    ${htmlContent}
  </div>
</body>
</html>
      `;

      // Send HTML response
      response.send(html);
    } catch (error) {
      this.logger.error(`Failed to render HTML for document ${docId}:`, error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to render document as HTML');
    }
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

        // ... rest of cases ...
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
