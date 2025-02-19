// project-element.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { getPersistence } from '../../ws/y-websocket-utils.js';
import { LeveldbPersistence } from 'y-leveldb';
import * as Y from 'yjs';
import * as path from 'path';
import { ElementType } from './element-type.enum.js';
import { ImageStorageService } from './image-storage.service.js';

@Injectable()
export class ProjectElementService {
  private readonly logger = new Logger(ProjectElementService.name);

  constructor(
    private readonly imageStorageService: ImageStorageService,
  ) {}

  /**
   * Load the Y.Doc for the given project.
   * If it doesn't exist, it is implicitly created by leveldb when we store an update.
   */
  private async loadDoc(docId: string): Promise<Y.Doc> {
    const ldb = getPersistence()?.provider as LeveldbPersistence;
    if (!ldb) {
      throw new Error('No LevelDB persistence found for Yjs project elements');
    }
    return await ldb.getYDoc(docId);
  }

  /**
   * Save a given doc's current state back to LevelDB.
   */
  private async persistDoc(doc: Y.Doc, docId: string): Promise<void> {
    const ldb = getPersistence()?.provider as LeveldbPersistence;
    if (!ldb) {
      throw new Error('No LevelDB persistence found for Yjs project elements');
    }
    await ldb.storeUpdate(docId, Y.encodeStateAsUpdate(doc));
    this.logger.debug(`Persisted doc ${docId}, state: ${JSON.stringify(doc.getMap('data').toJSON())}`);
  }

  /**
   * Get the elements from the Y.Doc as a JSON array.
   */
  async getProjectElements(username: string, slug: string) {
    const docId = this.getDocId(username, slug);
    const doc = await this.loadDoc(docId);
    const dataMap = doc.getMap<any>('data');
    this.logger.debug(`Loading doc ${docId}, current state: ${JSON.stringify(dataMap.toJSON())}`);
    if (!dataMap.has('elements')) {
      dataMap.set('elements', new Y.Array());
    }
    const elementsArray = dataMap.get('elements') as Y.Array<any>;
    return elementsArray.toArray();
  }

  /**
   * Replace project elements (similar to dinsert).
   */
  async replaceProjectElements(username: string, slug: string, incomingElements: any[]) {
    const docId = this.getDocId(username, slug);
    const doc = await this.loadDoc(docId);

    doc.transact(() => {
      const dataMap = doc.getMap<any>('data');
      if (!dataMap.has('elements')) {
        dataMap.set('elements', new Y.Array());
      }
      const elementsArray = dataMap.get('elements') as Y.Array<any>;
      elementsArray.delete(0, elementsArray.length); // Clear existing
      for (const elem of incomingElements) {
        elementsArray.push([elem]); // Insert incoming
      }
    });

    await this.persistDoc(doc, docId);
    return incomingElements; // Return updated data
  }

  private getDocId(username: string, slug: string): string {
    return `projectElements:${username}:${slug}`;
  }

  private async findElementById(doc: Y.Doc, elementId: string): Promise<{ element: any; index: number }> {
    this.logger.debug(`Finding element with ID: ${elementId}`);
    const dataMap = doc.getMap<any>('data');
    if (!dataMap.has('elements')) {
      this.logger.debug('No elements array found, initializing empty array');
      dataMap.set('elements', new Y.Array());
    }

    const elementsArray = dataMap.get('elements') as Y.Array<any>;
    const elements = elementsArray.toArray();
    this.logger.debug(`Found ${elements.length} elements in array`);
    elements.forEach((e, i) => {
      this.logger.debug(`Element ${i}: id=${e?.id}, type=${e?.type}, raw=${JSON.stringify(e)}`);
    });
    const index = elements.findIndex(e => e.id === elementId);
    if (index === -1) {
      throw new Error(`Element not found: ${elementId}`);
    }
    return { element: elements[index], index };
  }

  async uploadImage(
    username: string,
    slug: string,
    elementId: string,
    file: Buffer,
    filename: string,
  ): Promise<void> {
    const docId = this.getDocId(username, slug);
    const doc = await this.loadDoc(docId);

    this.logger.debug(`Starting upload for doc ${docId}, current state: ${JSON.stringify(doc.getMap('data').toJSON())}`);
    let existingElement;
    let existingIndex = -1;
    try {
      const result = await this.findElementById(doc, elementId);
      existingElement = result.element;
      existingIndex = result.index;
    } catch (_error) {
      this.logger.debug(`Element ${elementId} not found, will create new element`);
    }

    // Save the image file
    const finalFilename = await this.imageStorageService.saveImage(username, slug, elementId, file, filename);
    this.logger.debug(`Saved image file with name: ${finalFilename}`);

    let wasUpdated = false;
    // Update the element metadata in Yjs
    doc.transact(() => {
      const dataMap = doc.getMap<any>('data');
      if (!dataMap.has('elements')) {
        dataMap.set('elements', new Y.Array());
      }
      const elementsArray = dataMap.get('elements') as Y.Array<any>;

      const metadata = {
        version: (existingElement?.metadata?.version || 0) + 1,
        contentType: path.extname(filename).slice(1),
        size: file.byteLength,
        lastModified: new Date(),
        originalFilename: filename,
        storedFilename: finalFilename
      };

      if (existingIndex >= 0) {
        const updatedElement = { ...existingElement, metadata };
        elementsArray.delete(existingIndex, 1);
        elementsArray.insert(existingIndex, [updatedElement]);
        this.logger.debug(`Updated existing element ${elementId} with new metadata`);
        wasUpdated = true;
      } else {
        const newElement = {
          id: elementId,
          type: ElementType.IMAGE,
          name: path.basename(filename),
          metadata,
          position: elementsArray.length,
          level: 0
        };
        elementsArray.push([newElement]);
        wasUpdated = true;
        this.logger.debug(`Created new element ${elementId} for uploaded image`);
      }
    });

    if (wasUpdated) {
      await this.persistDoc(doc, docId);
      this.logger.debug(`After update state: ${JSON.stringify(doc.getMap('data').toJSON())}`);
      this.logger.debug(`Persisted doc changes for element ${elementId} to doc ${docId}`);
    }
  }

  async downloadImage(
    username: string,
    slug: string,
    elementId: string,
  ): Promise<NodeJS.ReadableStream> {
    // Get the element metadata from Yjs
    this.logger.debug(`Attempting to download image for element ${elementId}`);
    const docId = this.getDocId(username, slug);
    this.logger.debug(`Loading doc with ID: ${docId}`);
    const doc = await this.loadDoc(docId);

    const dataMap = doc.getMap<any>('data');
    const elementsArray = dataMap.get('elements');
    const elements = elementsArray?.toArray() || [];
    this.logger.debug(`Found ${elements.length} elements in doc`);
    this.logger.debug(`Elements: ${JSON.stringify(elements)}`);

    const { element } = await this.findElementById(doc, elementId);
    this.logger.debug(`Found element: ${JSON.stringify(element)}`);

    if (!element.metadata?.storedFilename) {
      throw new Error('No image file associated with this element');
    }

    this.logger.debug(`Attempting to read image with filename: ${element.metadata.storedFilename}`);
    return this.imageStorageService.readImage(username, slug, element.metadata.storedFilename);
  }

  async deleteImage(
    username: string,
    slug: string,
    elementId: string,
  ): Promise<void> {
    // Get the element metadata from Yjs
    const docId = this.getDocId(username, slug);
    const doc = await this.loadDoc(docId);
    const { element, index } = await this.findElementById(doc, elementId);

    if (!element.metadata?.storedFilename) {
      throw new Error('No image file associated with this element');
    }

    // Delete the image file
    await this.imageStorageService.deleteImage(username, slug, element.metadata.storedFilename);

    // Update the element metadata in Yjs
    doc.transact(() => {
      const dataMap = doc.getMap<any>('data');
      if (!dataMap.has('elements')) {
        dataMap.set('elements', new Y.Array());
      }

      const elementsArray = dataMap.get('elements') as Y.Array<any>;

      // Remove image-related metadata but keep other metadata fields
      const { storedFilename, contentType, size, ...remainingMetadata } = element.metadata;
      element.metadata = {
        ...remainingMetadata,
        version: (element.metadata.version || 0) + 1,
        lastModified: new Date()
      };

      elementsArray.delete(index, 1);
      elementsArray.insert(index, [element]);
    });

    await this.persistDoc(doc, docId);
    this.logger.debug(`Deleted image for element ${elementId}`);
  }
}
