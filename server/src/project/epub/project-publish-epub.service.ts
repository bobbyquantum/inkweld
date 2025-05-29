import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Epub, ManifestItem } from '@smoores/epub';
import { randomUUID } from 'crypto';
import { ProjectElementService } from '../element/project-element.service.js';
import {
  FileStorageService,
  FileMetadata,
} from '../files/file-storage.service.js';
import { ProjectService } from '../project.service.js';
import { ElementType } from '../element/element-type.enum.js';
import { ProjectElementDto } from '../element/project-element.dto.js';
import { DocumentRendererService } from '../document/document-renderer.service.js';
import { LevelDBManagerService } from '../../common/persistence/leveldb-manager.service.js';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ProjectPublishEpubService {
  private readonly logger = new Logger(ProjectPublishEpubService.name);
  private currentUsername = '';
  private currentSlug = '';

  constructor(
    private readonly projectElementService: ProjectElementService,
    private readonly fileStorageService: FileStorageService,
    private readonly projectService: ProjectService,
    private readonly documentRenderer: DocumentRendererService,
    private readonly levelDBManager: LevelDBManagerService,
  ) {}

  /**
   * Publishes a project as an EPUB file
   * @param username The owner of the project
   * @param slug The project slug
   * @returns Metadata about the published EPUB file
   */
  async publishProjectAsEpub(
    username: string,
    slug: string,
  ): Promise<FileMetadata> {
    this.logger.log(`Publishing project ${username}/${slug} as EPUB`);

    // Store the current username and slug for use in other methods
    this.currentUsername = username;
    this.currentSlug = slug;

    // Get project details to use as metadata
    const project = await this.projectService.findByUsernameAndSlug(
      username,
      slug,
    );

    if (!project) {
      throw new NotFoundException(`Project ${username}/${slug} not found`);
    }

    // Get all elements for the project
    const elements = await this.projectElementService.getProjectElements(
      username,
      slug,
    );
    this.logger.log(
      `Found ${elements.length} elements for project ${username}/${slug}`,
    );
    const language = {
      toString: () => 'en-US',
      textInfo: { direction: 'ltr' },
    } as Intl.Locale;

    // Create a new EPUB
    const epub = await Epub.create({
      title: project.title || `${username}/${slug}`,
      language: language,
      identifier: randomUUID(),
    });

    // Add cover image if it exists
    const projectPath = this.projectService.getProjectPath(username, slug);
    const coverImagePath = path.join(projectPath, 'cover.jpg');

    if (fs.existsSync(coverImagePath)) {
      const coverImageBuffer = await fs.promises.readFile(coverImagePath);
      await epub.setCoverImage(
        'Images/cover.jpg',
        new Uint8Array(coverImageBuffer),
      );
      this.logger.log('Added cover image to EPUB');
    }

    // Add table of contents first
    // await this.addTableOfContents(epub, elements);

    // // Add chapters from project elements
    await this.addChaptersFromElements(epub, elements);

    // Generate EPUB file as byte array
    const epubData = await epub.writeToArray();

    // Create a Buffer from the Uint8Array
    const buffer = Buffer.from(epubData);

    // Save the EPUB file using the file storage service
    const filename = `${slug}-${new Date().toISOString().slice(0, 10)}.epub`;

    // Store the file in the project's file directory
    const fileMetadata = await this.fileStorageService.saveFile(
      username,
      slug,
      buffer,
      filename,
    );

    this.logger.log(
      `EPUB file published successfully for ${username}/${slug}: ${fileMetadata.storedName}`,
    );

    return fileMetadata;
  }

  /**
   * Adds a table of contents to the EPUB
   */
  private async addTableOfContents(
    epub: Epub,
    elements: ProjectElementDto[],
  ): Promise<void> {
    const tocItem: ManifestItem = {
      id: 'toc',
      href: 'XHTML/toc.xhtml',
      mediaType: 'application/xhtml+xml',
      properties: ['nav'],
    };

    // Create TOC content with links to chapters
    const tocListItems = elements
      .filter((element) => element.type === ElementType.ITEM)
      .map((element, index) => {
        const chapterId = `chapter-${index + 1}`;
        const chapterTitle = element.name || `Chapter ${index + 1}`;

        return Epub.createXmlElement('li', {}, [
          Epub.createXmlElement('a', { href: `XHTML/${chapterId}.xhtml` }, [
            Epub.createXmlTextNode(chapterTitle),
          ]),
        ]);
      });

    const tocContent = await epub.createXhtmlDocument([
      Epub.createXmlElement('nav', { 'epub:type': 'toc' }, [
        Epub.createXmlElement('h1', {}, [
          Epub.createXmlTextNode('Table of Contents'),
        ]),
        Epub.createXmlElement('ol', {}, tocListItems),
      ]),
    ]);

    await epub.addManifestItem(tocItem, tocContent, 'xml');
    await epub.addSpineItem(tocItem.id);
  }

  /**
   * Adds chapters to the EPUB from project elements
   * @param epub The EPUB object to add chapters to
   * @param elements The project elements to process
   */
  private async addChaptersFromElements(
    epub: Epub,
    elements: ProjectElementDto[],
  ): Promise<void> {
    // Filter to only include ITEM elements (chapters)
    const chapterElements = elements.filter(
      (element) => element.type === ElementType.ITEM,
    );

    this.logger.log(`Adding ${chapterElements.length} chapters to EPUB`);

    // Get the database for this project to access document content
    const db = await this.levelDBManager.getProjectDatabase(
      this.currentUsername,
      this.currentSlug,
    );

    // Add each chapter
    for (let i = 0; i < chapterElements.length; i++) {
      const element = chapterElements[i];
      const chapterId = `chapter-${i + 1}`;
      const chapterTitle = element.name || `Chapter ${i + 1}`;

      this.logger.log(
        `Processing chapter ${i + 1}: ${chapterTitle} (Element ID: ${element.id})`,
      );

      const chapterItem: ManifestItem = {
        id: chapterId,
        href: `XHTML/${chapterId}.xhtml`,
        mediaType: 'application/xhtml+xml',
      };

      const documentId = `${this.currentUsername}:${this.currentSlug}:${element.id}`;

      try {
        // Load the Y.Doc for this chapter from the database
        const ydoc = await db.getYDoc(documentId);
        this.logger.debug(`Successfully retrieved document: ${documentId}`);

        const htmlString = this.documentRenderer.renderDocumentAsHtml(
          ydoc,
          chapterTitle,
        );

        await epub.addManifestItem(chapterItem, htmlString, 'utf-8');
        await epub.addSpineItem(chapterId);
        this.logger.debug(
          `Successfully created XHTML content for chapter: ${chapterTitle}`,
        );
      } catch (error) {
        this.logger.warn(
          `Error retrieving content for chapter ${chapterTitle}`,
          error,
        );
      }
    }
  }
}
