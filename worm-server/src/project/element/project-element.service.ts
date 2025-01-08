// project-element-yjs.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { getPersistence } from '../../ws/y-websocket-utils.js'; // your existing y-websocket-utils
import { LeveldbPersistence } from 'y-leveldb';
import * as Y from 'yjs';

@Injectable()
export class ProjectElementService {
  private readonly logger = new Logger(ProjectElementService.name);

  /**
   * Load the Y.Doc for the given project.
   * If it doesn't exist, it is implicitly created by leveldb when we store an update.
   */
  private async loadDoc(docId: string): Promise<Y.Doc> {
    const ldb = getPersistence()?.provider as LeveldbPersistence;
    if (!ldb) {
      throw new Error('No LevelDB persistence found for Yjs project elements');
    }

    // Get or create the Y.Doc from the database
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
   * We assume we've stored them in a Y.Map called "data",
   * which has a field "elements" that is a Y.Array<json>.
   */
  async getProjectElements(username: string, slug: string) {
    const docId = this.getDocId(username, slug);
    const doc = await this.loadDoc(docId);

    // "data" is a Y.Map
    const dataMap = doc.getMap<any>('data');
    // If empty, initialize it
    if (!dataMap.has('elements')) {
      dataMap.set('elements', new Y.Array());
    }
    const elementsArray = dataMap.get('elements') as Y.Array<any>;

    // Convert the Y.Array back to JSON
    return elementsArray.toArray();
  }

  /**
   * Overwrite the entire array of elements in the doc with the provided new array.
   * This is conceptually similar to your "dinsert" approach.
   * Here, we just replace everything with the new data in a single transaction.
   */
  async replaceProjectElements(
    username: string,
    slug: string,
    incomingElements: any[],
  ) {
    const docId = this.getDocId(username, slug);
    const doc = await this.loadDoc(docId);

    doc.transact(() => {
      const dataMap = doc.getMap<any>('data');
      if (!dataMap.has('elements')) {
        dataMap.set('elements', new Y.Array());
      }
      const elementsArray = dataMap.get('elements') as Y.Array<any>;

      // Clear existing
      elementsArray.delete(0, elementsArray.length);

      // Insert incoming
      for (const elem of incomingElements) {
        elementsArray.push([elem]);
      }
    });

    await this.persistDoc(doc);

    // Return updated data
    return incomingElements;
  }

  private getDocId(username: string, slug: string): string {
    // e.g. "projectElements:bob:my-first-project"
    return `projectElements:${username}:${slug}`;
  }
}
