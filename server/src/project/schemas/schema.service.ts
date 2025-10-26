import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as Y from 'yjs';
import type {
  ElementTypeSchema,
  ProjectSchemaLibrary,
} from './worldbuilding-schema.interface.js';
import { LevelDBManagerService } from '../../common/persistence/leveldb-manager.service.js';

/**
 * Service for managing worldbuilding element schemas
 * Handles both project-level schema libraries and element-level schema snapshots
 */
@Injectable()
export class SchemaService {
  private readonly logger = new Logger(SchemaService.name);

  // Document ID for the schema library in LevelDB
  private readonly SCHEMA_DOC_ID = '__schemas__';

  constructor(private readonly levelDBManager: LevelDBManagerService) {}

  /**
   * Get a schema from a project's library
   */
  getSchemaFromLibrary(
    library: ProjectSchemaLibrary,
    elementType: string,
  ): ElementTypeSchema {
    const schema = library.schemas[elementType];
    if (!schema) {
      throw new NotFoundException(
        `Schema for element type ${elementType} not found`,
      );
    }
    return schema;
  }

  /**
   * Create a snapshot of a schema to embed in an element
   * This creates a copy so future template changes don't affect the element
   */
  createSchemaSnapshot(schema: ElementTypeSchema): ElementTypeSchema {
    // Deep clone the schema
    return JSON.parse(JSON.stringify(schema)) as ElementTypeSchema;
  }

  /**
   * Store schema library in a Yjs document
   * Used for collaborative editing of schemas
   */
  storeLibraryInYDoc(
    ydoc: Y.Doc,
    library: ProjectSchemaLibrary,
  ): Y.Map<unknown> {
    const schemaMap = ydoc.getMap('schemaLibrary');

    ydoc.transact(() => {
      schemaMap.set('projectId', library.projectId);
      schemaMap.set('createdAt', library.createdAt);
      schemaMap.set('updatedAt', library.updatedAt);

      // Store each schema
      const schemasMap = new Y.Map<unknown>();
      Object.entries(library.schemas).forEach(([type, schema]) => {
        const schemaData = new Y.Map<unknown>();
        schemaData.set('id', schema.id);
        schemaData.set('type', schema.type);
        schemaData.set('name', schema.name);
        schemaData.set('icon', schema.icon);
        schemaData.set('description', schema.description);
        schemaData.set('version', schema.version);
        schemaData.set('isBuiltIn', schema.isBuiltIn);
        schemaData.set('tabs', JSON.stringify(schema.tabs));
        if (schema.defaultValues) {
          schemaData.set('defaultValues', JSON.stringify(schema.defaultValues));
        }
        if (schema.createdAt) {
          schemaData.set('createdAt', schema.createdAt);
        }
        if (schema.updatedAt) {
          schemaData.set('updatedAt', schema.updatedAt);
        }

        schemasMap.set(type, schemaData);
      });

      schemaMap.set('schemas', schemasMap);
    });

    return schemaMap;
  }

  /**
   * Load schema library from a Yjs document
   */
  loadLibraryFromYDoc(ydoc: Y.Doc): ProjectSchemaLibrary | null {
    const schemaMap = ydoc.getMap('schemaLibrary');

    if (!schemaMap.has('projectId')) {
      return null;
    }

    const projectId = schemaMap.get('projectId') as string;
    const createdAt = schemaMap.get('createdAt') as string;
    const updatedAt = schemaMap.get('updatedAt') as string;
    const schemasMap = schemaMap.get('schemas') as Y.Map<unknown>;

    const schemas: Record<string, ElementTypeSchema> = {};

    if (schemasMap) {
      schemasMap.forEach((schemaData, type) => {
        const data = schemaData as Y.Map<unknown>;
        schemas[type] = {
          id: data.get('id') as string,
          type: data.get('type') as string,
          name: data.get('name') as string,
          icon: data.get('icon') as string,
          description: data.get('description') as string,
          version: data.get('version') as number,
          isBuiltIn: data.get('isBuiltIn') as boolean,
          tabs: JSON.parse(data.get('tabs') as string),
          defaultValues: data.has('defaultValues')
            ? JSON.parse(data.get('defaultValues') as string)
            : undefined,
          createdAt: data.has('createdAt')
            ? (data.get('createdAt') as string)
            : undefined,
          updatedAt: data.has('updatedAt')
            ? (data.get('updatedAt') as string)
            : undefined,
        };
      });
    }

    return {
      projectId,
      schemas,
      createdAt,
      updatedAt,
    };
  }

  /**
   * Update a schema in the library
   */
  updateSchemaInLibrary(
    library: ProjectSchemaLibrary,
    elementType: string,
    updates: Partial<ElementTypeSchema>,
  ): ProjectSchemaLibrary {
    const existingSchema = library.schemas[elementType];
    if (!existingSchema) {
      throw new NotFoundException(
        `Schema for element type ${elementType} not found`,
      );
    }

    const updatedSchema: ElementTypeSchema = {
      ...existingSchema,
      ...updates,
      updatedAt: new Date().toISOString(),
      version: (updates.version ?? existingSchema.version) + 1,
    };

    return {
      ...library,
      schemas: {
        ...library.schemas,
        [elementType]: updatedSchema,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Add a new custom schema to the library
   */
  addSchemaToLibrary(
    library: ProjectSchemaLibrary,
    schema: ElementTypeSchema,
  ): ProjectSchemaLibrary {
    if (library.schemas[schema.type]) {
      throw new Error(
        `Schema for element type ${schema.type} already exists`,
      );
    }

    const now = new Date().toISOString();
    const newSchema: ElementTypeSchema = {
      ...schema,
      createdAt: now,
      updatedAt: now,
      isBuiltIn: false,
    };

    return {
      ...library,
      schemas: {
        ...library.schemas,
        [schema.type]: newSchema,
      },
      updatedAt: now,
    };
  }

  /**
   * Load a project's schema library from LevelDB
   */
  async loadProjectSchemas(
    username: string,
    slug: string,
  ): Promise<ProjectSchemaLibrary | null> {
    try {
      const db = await this.levelDBManager.getProjectDatabase(username, slug);
      // Use the project-prefixed document ID format: username:slug:__schemas__
      const docId = `${username}:${slug}:${this.SCHEMA_DOC_ID}`;
      const ydoc = await db.getYDoc(docId);

      return this.loadLibraryFromYDoc(ydoc);
    } catch (error) {
      this.logger.error(
        `Failed to load schemas for project ${username}/${slug}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Get a specific schema from a project's library
   */
  async getProjectSchema(
    username: string,
    slug: string,
    elementType: string,
  ): Promise<ElementTypeSchema | null> {
    const library = await this.loadProjectSchemas(username, slug);
    if (!library) {
      return null;
    }

    return library.schemas[elementType] || null;
  }

  /**
   * Create a schema snapshot for embedding in a worldbuilding element
   * This loads the schema from the project's template library
   */
  async createSchemaSnapshotForElement(
    username: string,
    slug: string,
    elementType: string,
  ): Promise<ElementTypeSchema | null> {
    const schema = await this.getProjectSchema(username, slug, elementType);
    if (!schema) {
      this.logger.warn(
        `No schema found for ${elementType} in project ${username}/${slug}`,
      );
      return null;
    }

    return this.createSchemaSnapshot(schema);
  }

  /**
   * Embed a schema snapshot into a worldbuilding element's Y.Doc
   */
  embedSchemaInElementDoc(
    ydoc: Y.Doc,
    schema: ElementTypeSchema,
  ): void {
    const schemaMap = ydoc.getMap('__schema__');

    ydoc.transact(() => {
      schemaMap.set('id', schema.id);
      schemaMap.set('type', schema.type);
      schemaMap.set('name', schema.name);
      schemaMap.set('icon', schema.icon);
      schemaMap.set('description', schema.description);
      schemaMap.set('version', schema.version);
      schemaMap.set('isBuiltIn', schema.isBuiltIn || false);
      schemaMap.set('tabs', JSON.stringify(schema.tabs));
      if (schema.defaultValues) {
        schemaMap.set('defaultValues', JSON.stringify(schema.defaultValues));
      }
      if (schema.createdAt) {
        schemaMap.set('createdAt', schema.createdAt);
      }
      if (schema.updatedAt) {
        schemaMap.set('updatedAt', schema.updatedAt);
      }
    });
  }

  /**
   * Load schema from a worldbuilding element's Y.Doc
   */
  loadSchemaFromElementDoc(ydoc: Y.Doc): ElementTypeSchema | null {
    const schemaMap = ydoc.getMap('__schema__');

    if (!schemaMap.has('type')) {
      return null;
    }

    return {
      id: schemaMap.get('id') as string,
      type: schemaMap.get('type') as string,
      name: schemaMap.get('name') as string,
      icon: schemaMap.get('icon') as string,
      description: schemaMap.get('description') as string,
      version: schemaMap.get('version') as number,
      isBuiltIn: schemaMap.get('isBuiltIn') as boolean,
      tabs: JSON.parse(schemaMap.get('tabs') as string),
      defaultValues: schemaMap.has('defaultValues')
        ? JSON.parse(schemaMap.get('defaultValues') as string)
        : undefined,
      createdAt: schemaMap.has('createdAt')
        ? (schemaMap.get('createdAt') as string)
        : undefined,
      updatedAt: schemaMap.has('updatedAt')
        ? (schemaMap.get('updatedAt') as string)
        : undefined,
    };
  }
}
