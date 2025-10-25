import { Injectable, Logger } from '@nestjs/common';
import * as Y from 'yjs';
import { LevelDBManagerService } from '../../common/persistence/leveldb-manager.service.js';
import { SchemaService } from '../schemas/schema.service.js';

/**
 * Service for managing worldbuilding elements
 * Handles initialization and schema embedding for worldbuilding documents
 */
@Injectable()
export class WorldbuildingService {
  private readonly logger = new Logger(WorldbuildingService.name);

  constructor(
    private readonly levelDBManager: LevelDBManagerService,
    private readonly schemaService: SchemaService,
  ) {}

  /**
   * Initialize a new worldbuilding element with its schema
   * This is called when a worldbuilding element is created
   */
  async initializeWorldbuildingElement(
    username: string,
    slug: string,
    elementId: string,
    elementType: string,
  ): Promise<void> {
    try {
      // Get the schema snapshot from the project's template library
      const schema = await this.schemaService.createSchemaSnapshotForElement(
        username,
        slug,
        elementType,
      );

      if (!schema) {
        this.logger.warn(
          `No schema found for ${elementType}, skipping schema embedding`,
        );
        return;
      }

      // Get the LevelDB instance for this project
      const db = await this.levelDBManager.getProjectDatabase(username, slug);

      // Get the Y.Doc for this element
      const docId = `${username}:${slug}:${elementId}`;
      const ydoc = await db.getYDoc(docId);

      // Embed the schema snapshot in the Y.Doc
      this.schemaService.embedSchemaInElementDoc(ydoc, schema);

      // Initialize default data based on schema
      this.initializeDefaultData(ydoc, schema);

      // Persist to LevelDB
      await db.storeUpdate(docId, Y.encodeStateAsUpdate(ydoc));

      this.logger.log(
        `Initialized worldbuilding element ${elementId} (${elementType}) with schema v${schema.version}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to initialize worldbuilding element ${elementId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Initialize default data for a worldbuilding element based on its schema
   */
  private initializeDefaultData(ydoc: Y.Doc, schema: any): void {
    const dataMap = ydoc.getMap('data');

    ydoc.transact(() => {
      // Set the type
      dataMap.set('type', schema.type);

      // Set any default values from the schema
      if (schema.defaultValues) {
        Object.entries(schema.defaultValues).forEach(([key, value]) => {
          dataMap.set(key, value);
        });
      }

      // Set timestamps
      const now = new Date().toISOString();
      dataMap.set('createdDate', now);
      dataMap.set('lastModified', now);

      // Initialize empty arrays for array fields
      schema.tabs?.forEach((tab: any) => {
        tab.fields?.forEach((field: any) => {
          if (field.type === 'array') {
            // Create a Y.Array for array fields
            const yArray = new Y.Array();
            dataMap.set(field.key, yArray);
          }
        });
      });
    });
  }

  /**
   * Get the schema for a worldbuilding element
   */
  async getElementSchema(
    username: string,
    slug: string,
    elementId: string,
  ): Promise<any> {
    try {
      const db = await this.levelDBManager.getProjectDatabase(username, slug);
      const docId = `${username}:${slug}:${elementId}`;
      const ydoc = await db.getYDoc(docId);

      return this.schemaService.loadSchemaFromElementDoc(ydoc);
    } catch (error) {
      this.logger.error(
        `Failed to load schema for element ${elementId}:`,
        error,
      );
      return null;
    }
  }
}
