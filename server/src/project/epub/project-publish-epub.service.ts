import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Epub, ManifestItem } from '@smoores/epub';
import { randomUUID } from 'crypto';
import { ProjectElementService } from '../element/project-element.service.js';
import { FileStorageService, FileMetadata } from '../files/file-storage.service.js';
import { ProjectService } from '../project.service.js';
import { ElementType } from '../element/element-type.enum.js';
import { ProjectElementDto } from '../element/project-element.dto.js';

@Injectable()
export class ProjectPublishEpubService {
  private readonly logger = new Logger(ProjectPublishEpubService.name);

  constructor(
    private readonly projectElementService: ProjectElementService,
    private readonly fileStorageService: FileStorageService,
    private readonly projectService: ProjectService,
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
    const language = {
      toString: () => "en-US",
      textInfo: { direction: "ltr" }
    } as Intl.Locale;
    // Create a new EPUB
    const epub = await Epub.create({
      title: project.title || `${username}/${slug}`,
      language: language,
      identifier: randomUUID(),
      // creators: [({ name: username } as DcCreator)],
      // date: new Date(),
    });

    // Add cover page
    // await this.addCoverPage(epub, project.title || `${username}/${slug}`);

    // // Add table of contents
    // await this.addTableOfContents(epub, elements);

    // Add chapters from project elements
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
   * Adds a cover page to the EPUB
   */
  private async addCoverPage(epub: Epub, title: string): Promise<void> {
    const coverItem: ManifestItem = {
      id: 'cover',
      href: 'XHTML/cover.xhtml',
      mediaType: 'application/xhtml+xml',
      properties: ['cover-image'],
    };

    const coverContent = await epub.createXhtmlDocument([
      Epub.createXmlElement('div', { style: 'text-align: center; padding-top: 20%' }, [
        Epub.createXmlElement('h1', { style: 'font-size: 2em' }, [
          Epub.createXmlTextNode(title),
        ]),
        Epub.createXmlElement('p', { style: 'margin-top: 2em' }, [
          Epub.createXmlTextNode('Created with InkWeld'),
        ]),
      ]),
    ]);

    await epub.addManifestItem(coverItem, coverContent, 'xml');
    await epub.addSpineItem(coverItem.id);
  }

  /**
   * Adds a table of contents to the EPUB
   */
  private async addTableOfContents(
    epub: Epub,
    elements: ProjectElementDto[]
  ): Promise<void> {
    const tocItem: ManifestItem = {
      id: 'toc',
      href: 'XHTML/toc.xhtml',
      mediaType: 'application/xhtml+xml',
      properties: ['nav'],
    };

    // Create TOC content with links to chapters
    const tocListItems = elements
      .filter(element => element.type === ElementType.ITEM)
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
   */
  private async addChaptersFromElements(
    epub: Epub,
    elements: ProjectElementDto[],
  ): Promise<void> {
    // Filter to only include ITEM elements (chapters)
    const chapterElements = elements.filter(
      (element) => element.type === ElementType.ITEM,
    );

    // Add each chapter
    for (let i = 0; i < chapterElements.length; i++) {
      const element = chapterElements[i];
      const chapterId = `chapter-${i + 1}`;
      const chapterTitle = element.name || `Chapter ${i + 1}`;

      const chapterItem: ManifestItem = {
        id: chapterId,
        href: `XHTML/${chapterId}.xhtml`,
        mediaType: 'application/xhtml+xml',
      };

      // For now, we'll create simple chapter content
      // In a real implementation, you would fetch the actual content from a document store
      const chapterContent = await epub.createXhtmlDocument([
        Epub.createXmlElement('h1', {}, [
          Epub.createXmlTextNode(chapterTitle),
        ]),
        Epub.createXmlElement('p', {}, [
          Epub.createXmlTextNode(
            `This is the content for ${chapterTitle}. In a real implementation, this would be fetched from the document store.`,
          ),
        ]),
      ]);

      await epub.addManifestItem(chapterItem, chapterContent, 'xml');
      await epub.addSpineItem(chapterItem.id);
    }
  }
}
