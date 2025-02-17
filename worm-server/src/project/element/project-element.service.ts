// project-element.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { getPersistence } from '../../ws/y-websocket-utils.js';
import { LeveldbPersistence } from 'y-leveldb';
import * as Y from 'yjs';
import { ImageStorageService } from './image-storage.service.js'; // Import ImageStorageService

@Injectable()
export class ProjectElementService {
  private readonly logger = new Logger(ProjectElementService.name);

  constructor(
    private readonly imageStorageService: ImageStorageService, // Inject ImageStorageService
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
  private async persistDoc(doc: Y.Doc): Promise<void> {
    const ldb = getPersistence()?.provider as LeveldbPersistence;
    if (!ldb) {
      throw new Error('No LevelDB persistence found for Yjs project elements');
    }
    const update = Y.encodeStateAsUpdate(doc);
    await ldb.storeUpdate(doc.guid, update);
  }

  /**
   * Get the elements from the Y.Doc as a JSON array.
   */
  async getProjectElements(username: string, slug: string) {
    const docId = this.getDocId(username, slug);
    const doc = await this.loadDoc(docId);
    const dataMap = doc.getMap<any>('data');
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

    await this.persistDoc(doc);
    return incomingElements; // Return updated data
  }

  private getDocId(username: string, slug: string): string {
    return `projectElements:${username}:${slug}`;
  }

  async uploadImage(
    username: string,
    slug: string,
    elementId: string,
    file: Buffer,
    filename: string,
  ): Promise<void> {
    await this.imageStorageService.saveImage(username, slug, elementId, file, filename);

    // TODO: Update project element metadata in LevelDB
    this.logger.log(`Image uploaded for element ${elementId} in project ${username}/${slug}`);

    // Metadata update logic will be added here
    // Example: update element metadata in Yjs doc with image details (version, size, etc.)
  }

  async downloadImage(
    username: string,
    slug: string,
    elementId: string,
  ): Promise<NodeJS.ReadableStream> {
    return this.imageStorageService.readImage(username, slug, elementId);
  }

  async deleteImage(
    username: string,
    slug: string,
    elementId: string,
  ): Promise<void> {
    await this.imageStorageService.deleteImage(username, slug, elementId);

    // TODO: Update project element metadata in LevelDB
    this.logger.log(`Image deleted for element ${elementId} in project ${username}/${slug}`);

    // Metadata update logic will be added here
    // Example: update element metadata in Yjs doc to remove image details
  }
}
