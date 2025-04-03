// project-element.service.ts - Updated for per-project LevelDB implementation

import { Injectable, Logger } from '@nestjs/common';
import * as Y from 'yjs';
import { LevelDBManagerService } from '../../common/persistence/leveldb-manager.service.js';
import { LeveldbPersistence } from 'y-leveldb';

@Injectable()
export class ProjectElementService {
  private readonly logger = new Logger(ProjectElementService.name);

  constructor(private readonly levelDBManager: LevelDBManagerService) {}

  /**
   * Load the Y.Doc for the given project using per-project LevelDB.
   * If it doesn't exist, it is implicitly created by leveldb when we store an update.
   */
  private async loadDoc(username: string, slug: string): Promise<Y.Doc> {
    const docId = this.getDocId(username, slug);
    const ldb = await this.getProjectLevelDB(username, slug);
    if (!ldb) {
      throw new Error('No LevelDB persistence found for Yjs project elements');
    }
    return await ldb.getYDoc(docId);
  }

  /**
   * Get the LevelDB instance for a specific project.
   */
  private async getProjectLevelDB(
    username: string,
    slug: string,
  ): Promise<LeveldbPersistence> {
    return await this.levelDBManager.getProjectDatabase(username, slug);
  }

  /**
   * Save a given doc's current state back to LevelDB.
   */
  private async persistDoc(
    doc: Y.Doc,
    username: string,
    slug: string,
  ): Promise<void> {
    const docId = this.getDocId(username, slug);
    const ldb = await this.getProjectLevelDB(username, slug);
    if (!ldb) {
      throw new Error('No LevelDB persistence found for Yjs project elements');
    }

    await ldb.storeUpdate(docId, Y.encodeStateAsUpdate(doc));
    this.logger.debug(
      `Persisted doc ${docId}, state: ${JSON.stringify(doc.getMap('data').toJSON())}`,
    );
  }

  /**
   * Get the elements from the Y.Doc as a JSON array.
   */
  async getProjectElements(username: string, slug: string) {
    const doc = await this.loadDoc(username, slug);
    const dataMap = doc.getArray<any>('elements');
    return dataMap.toArray();
  }

  /**
   * Replace project elements (similar to dinsert).
   */
  async replaceProjectElements(
    _username: string,
    _slug: string,
    _incomingElements: any[],
  ) {
    throw new Error('Not implemented yet');
  }

  private getDocId(username: string, slug: string): string {
    return `${username}:${slug}:elements`;
  }

  private async findElementById(
    doc: Y.Doc,
    elementId: string,
  ): Promise<{ element: any; index: number }> {
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
      this.logger.debug(
        `Element ${i}: id=${e?.id}, type=${e?.type}, raw=${JSON.stringify(e)}`,
      );
    });
    const index = elements.findIndex((e) => e.id === elementId);
    if (index === -1) {
      throw new Error(`Element not found: ${elementId}`);
    }
    return { element: elements[index], index };
  }
}
