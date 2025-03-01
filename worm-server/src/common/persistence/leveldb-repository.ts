import { Logger } from '@nestjs/common';
import { LevelDBManagerService } from './leveldb-manager.service.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Base interface for all entities stored in LevelDB
 */
export interface BaseEntity {
  id: string;
  [key: string]: any;
}

/**
 * Generic repository for LevelDB entities
 * Provides CRUD operations for entities stored in LevelDB
 */
export class LevelDBRepository<T extends BaseEntity> {
  private readonly logger: Logger;
  private readonly dbPrefix: string;
  private readonly indexFields: string[];

  /**
   * Creates a new LevelDB repository
   * @param levelDBManager The LevelDB manager service
   * @param entityName The name of the entity (used for logging and as DB prefix)
   * @param indexFields Fields to create secondary indexes for (e.g. 'username', 'email')
   */
  constructor(
    private readonly levelDBManager: LevelDBManagerService,
    private readonly entityName: string,
    indexFields: string[] = [],
  ) {
    this.logger = new Logger(`LevelDBRepository:${entityName}`);
    this.dbPrefix = entityName.toLowerCase();
    this.indexFields = indexFields;
  }

  /**
   * Generates a key for an entity
   * @param id The entity ID
   * @returns The entity key
   */
  protected getEntityKey(id: string): string {
    return `${this.dbPrefix}:${id}`;
  }

  /**
   * Generates an index key for an entity field
   * @param field The field name
   * @param value The field value
   * @returns The index key
   */
  protected getIndexKey(field: string, value: string): string {
    return `${this.dbPrefix}:index:${field}:${value}`;
  }

  /**
   * Creates a new entity
   * @param data The entity data
   * @returns The created entity
   */
  async create(data: Partial<T>): Promise<T> {
    const id = data.id || uuidv4();
    const entity = { ...data, id } as T;

    try {
      const db = await this.levelDBManager.getProjectDatabase('_system', 'users');

      // Check if db and db.db are properly initialized
      if (!db || !db.db) {
        this.logger.error(`Database not properly initialized for ${this.entityName}`);

        // Instead of throwing, return the entity directly for auth flows
        // This allows authentication to proceed even with DB issues
        if (data.githubId) {
          this.logger.warn(`Returning unsaved entity for github user ${data.githubId} due to DB initialization issues`);
          return entity;
        }

        throw new Error(`Database not initialized for ${this.entityName}`);
      }

      // Start a batch operation
      const batch = [];

      // Add the main entity
      const entityKey = this.getEntityKey(id);
      batch.push({ type: 'put', key: entityKey, value: JSON.stringify(entity) });

      // Add indexes
      for (const field of this.indexFields) {
        if (entity[field]) {
          const indexKey = this.getIndexKey(field, entity[field]);
          batch.push({ type: 'put', key: indexKey, value: id });
        }
      }

      // Execute the batch
      await db.db.batch(batch);

      this.logger.debug(`Created ${this.entityName} with ID ${id}`);
    } catch (error) {
      this.logger.error(`Error creating ${this.entityName}:`, error);

      // For GitHub auth, allow auth to proceed even with DB errors
      if (data.githubId) {
        this.logger.warn(`Returning unsaved entity for github user ${data.githubId} due to error: ${error.message}`);
        return entity;
      }

      throw error;
    }

    return entity;
  }

  /**
   * Finds an entity by ID
   * @param id The entity ID
   * @returns The entity or null if not found
   */
  async findById(id: string): Promise<T | null> {
    try {
      const db = await this.levelDBManager.getProjectDatabase(
        '_system',
        'users',
      );

      // Check if db and db.db are properly initialized
      if (!db || !db.db) {
        this.logger.error(`Database not properly initialized for ${this.entityName}`);
        return null;
      }

      const entityKey = this.getEntityKey(id);
      const data = await db.db.get(entityKey);
      return JSON.parse(data);
    } catch (error) {
      if (error.type === 'NotFoundError') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Finds an entity by a field value
   * @param field The field name
   * @param value The field value
   * @returns The entity or null if not found
   */
  async findByField(field: string, value: string): Promise<T | null> {
    try {
      // If the field is indexed, use the index
      if (field === 'githubId' && value) {
        // Special case for GitHub authentication to prevent errors
        try {
          const db = await this.levelDBManager.getProjectDatabase(
            '_system',
            'users',
          );

          // Check if db and db.db are properly initialized
          if (!db || !db.db) {
            this.logger.error(`Database not properly initialized for ${this.entityName} when looking up GitHub ID ${value}`);
            return null;
          }

          const indexKey = this.getIndexKey(field, value);
          const id = await db.db.get(indexKey);
          return this.findById(id);
        } catch (error) {
          // Handle any errors during GitHub auth lookup gracefully
          this.logger.warn(`GitHub authentication lookup failed for ID ${value}:`, error);
          return null;
        }
      } else if (this.indexFields.includes(field)) {
        const db = await this.levelDBManager.getProjectDatabase(
          '_system',
          'users',
        );

        // Check if db and db.db are properly initialized
        if (!db || !db.db) {
          this.logger.error(`Database not properly initialized for ${this.entityName}`);
          return null;
        }

        const indexKey = this.getIndexKey(field, value);
        const id = await db.db.get(indexKey);
        return this.findById(id);
      }

      // Otherwise, scan all entities
      return this.findOne({ [field]: value } as Partial<T>);
    } catch (error) {
      if (error.type === 'NotFoundError') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Finds all entities matching a filter
   * @param filter The filter to apply
   * @returns An array of matching entities
   */
  async find(filter: Partial<T> = {}): Promise<T[]> {
    const db = await this.levelDBManager.getProjectDatabase('_system', 'users');

    // Check if db and db.db are properly initialized
    if (!db || !db.db) {
      this.logger.error(`Database not properly initialized for ${this.entityName}`);
      return [];
    }

    const results: T[] = [];

    // Get all keys with the entity prefix
    const prefix = `${this.dbPrefix}:`;

    // Use the LevelDB iterator to get all entities
    for await (const [key, value] of db.db.iterator({
      gte: prefix,
      lte: prefix + '\uffff',
      keys: true,
      values: true,
    })) {
      // Skip index keys
      if (key.includes(':index:')) continue;

      const entity = JSON.parse(value) as T;

      // Apply filter
      let match = true;
      for (const [filterKey, filterValue] of Object.entries(filter)) {
        if (entity[filterKey] !== filterValue) {
          match = false;
          break;
        }
      }

      if (match) {
        results.push(entity);
      }
    }

    return results;
  }

  /**
   * Finds the first entity matching a filter
   * @param filter The filter to apply
   * @returns The first matching entity or null if none found
   */
  async findOne(filter: Partial<T> = {}): Promise<T | null> {
    const results = await this.find(filter);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Updates an entity
   * @param id The entity ID
   * @param data The data to update
   * @returns The updated entity
   */
  async update(id: string, data: Partial<T>): Promise<T> {
    const entity = await this.findById(id);
    if (!entity) {
      throw new Error(`${this.entityName} with ID ${id} not found`);
    }

    const updatedEntity = { ...entity, ...data, id };
    const db = await this.levelDBManager.getProjectDatabase('_system', 'users');

    // Check if db and db.db are properly initialized
    if (!db || !db.db) {
      this.logger.error(`Database not properly initialized for ${this.entityName}`);
      throw new Error(`Database not initialized for ${this.entityName}`);
    }

    // Start a batch operation
    const batch = [];

    // Update the main entity
    const entityKey = this.getEntityKey(id);
    batch.push({
      type: 'put',
      key: entityKey,
      value: JSON.stringify(updatedEntity),
    });

    // Update indexes
    for (const field of this.indexFields) {
      // If the field has changed, update the index
      if (data[field] !== undefined && entity[field] !== data[field]) {
        // Delete old index if it exists
        if (entity[field]) {
          const oldIndexKey = this.getIndexKey(field, entity[field]);
          batch.push({ type: 'del', key: oldIndexKey });
        }

        // Add new index if it exists
        if (data[field]) {
          const newIndexKey = this.getIndexKey(field, data[field]);
          batch.push({ type: 'put', key: newIndexKey, value: id });
        }
      }
    }

    // Execute the batch
    await db.db.batch(batch);

    this.logger.debug(`Updated ${this.entityName} with ID ${id}`);
    return updatedEntity;
  }

  /**
   * Deletes an entity
   * @param id The entity ID
   */
  async delete(id: string): Promise<void> {
    const entity = await this.findById(id);
    if (!entity) {
      return; // Entity doesn't exist, nothing to delete
    }

    const db = await this.levelDBManager.getProjectDatabase('_system', 'users');

    // Check if db and db.db are properly initialized
    if (!db || !db.db) {
      this.logger.error(`Database not properly initialized for ${this.entityName}`);
      return;
    }

    // Start a batch operation
    const batch = [];

    // Delete the main entity
    const entityKey = this.getEntityKey(id);
    batch.push({ type: 'del', key: entityKey });

    // Delete indexes
    for (const field of this.indexFields) {
      if (entity[field]) {
        const indexKey = this.getIndexKey(field, entity[field]);
        batch.push({ type: 'del', key: indexKey });
      }
    }

    // Execute the batch
    await db.db.batch(batch);

    this.logger.debug(`Deleted ${this.entityName} with ID ${id}`);
  }
}
