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
  protected readonly dbPrefix: string;
  protected readonly indexFields: string[];

  // Flag indicating if this is a system repository (users, projects, etc.)
  // or a project-specific repository
  private readonly isSystemRepository: boolean;

  /**
   * Creates a new LevelDB repository
   * @param levelDBManager The LevelDB manager service
   * @param entityName The name of the entity (used for logging and as DB prefix)
   * @param indexFields Fields to create secondary indexes for (e.g. 'username', 'email')
   * @param isSystemRepository Whether this repository stores system-level entities
   */
  constructor(
    private readonly levelDBManager: LevelDBManagerService,
    private readonly entityName: string,
    indexFields: string[] = [],
    isSystemRepository: boolean = false,
  ) {
    this.logger = new Logger(`LevelDBRepository:${entityName}`);
    this.isSystemRepository =
      isSystemRepository ||
      ['users', 'sessions', 'projects'].includes(entityName);
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
   * Get the appropriate database based on whether this is a system repository or not
   * @param username Optional username for project databases
   * @param projectSlug Optional project slug for project databases
   * @returns The database instance
   */
  protected async getDatabase(username?: string, projectSlug?: string) {
    if (this.isSystemRepository) {
      this.logger.debug(`Getting system database for ${this.entityName}`);
      return this.levelDBManager.getSystemDatabase(this.dbPrefix);
    }

    if (!username || !projectSlug) {
      throw new Error(
        `Username and projectSlug are required for project database access: ${this.entityName}`,
      );
    }

    this.logger.debug(
      `Getting project database for ${username}/${projectSlug}/${this.entityName}`,
    );
    const db = await this.levelDBManager.getProjectDatabase(
      username,
      projectSlug,
    );
    return db;
  }

  /**
   * Check if a database is ready and retry getting it if not
   * @param db The database to check
   * @returns The checked database
   */
  private async ensureDatabaseReady(db: any): Promise<any> {
    // For system databases (Level instances), check if the database is open
    if (!db || db.status !== 'open') {
      this.logger.warn(
        `Database for ${this.entityName} is not open (status: ${db?.status}), waiting...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 500)); // Short delay
      return this.levelDBManager.getSystemDatabase(this.dbPrefix);
    }
    return db;
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
      let db;
      if (this.isSystemRepository) {
        // Get system database for system entities
        db = await this.levelDBManager.getSystemDatabase(this.dbPrefix);
        db = await this.ensureDatabaseReady(db);

        // Start a batch operation for system DB
        const batch = db.batch();

        // Add the main entity
        const entityKey = this.getEntityKey(id);
        await batch.put(entityKey, JSON.stringify(entity));

        // Add indexes
        for (const field of this.indexFields) {
          if (entity[field]) {
            const indexKey = this.getIndexKey(field, entity[field]);
            await batch.put(indexKey, id);
          }
        }

        // Execute the batch
        await batch.write();
      } else {
        // Get project database for project-specific entities
        // This case should include the username and projectSlug from the repository context
        throw new Error('Project-specific entity operations not implemented');
      }

      const entityType = this.isSystemRepository ? 'system' : 'project';
      this.logger.debug(
        `Created ${entityType} ${this.entityName} with ID ${id}`,
      );
    } catch (error) {
      this.logger.error(`Error creating ${this.entityName}:`, error);

      // For GitHub auth, allow auth to proceed even with DB errors
      if (data.githubId) {
        this.logger.warn(
          `Returning unsaved entity for github user ${data.githubId} due to DB initialization issues`,
        );
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
      if (!this.isSystemRepository) {
        throw new Error('Project-specific findById operations not implemented');
      }

      // Get system database for system entities
      const db = await this.levelDBManager.getSystemDatabase(this.dbPrefix);

      // Make sure the database is ready
      await this.ensureDatabaseReady(db);

      this.logger.log('Database status', db.status);

      const entityKey = this.getEntityKey(id);
      const data = await db.get(entityKey);
      if (!data) return null;
      return JSON.parse(data);
    } catch (error) {
      if (error && error.type === 'NotFoundError') {
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
        // Special case for GitHub authentication
        try {
          if (!this.isSystemRepository) {
            throw new Error(
              'Project-specific findByField operations not implemented',
            );
          }

          // Get system database for system entities
          const db = await this.levelDBManager.getSystemDatabase(this.dbPrefix);

          // Make sure the database is ready
          await this.ensureDatabaseReady(db);

          const indexKey = this.getIndexKey(field, value);
          const id = await db.get(indexKey);
          return this.findById(id);
        } catch (_error) {
          return null;
        }
      } else if (this.indexFields.includes(field)) {
        if (!this.isSystemRepository) {
          throw new Error(
            'Project-specific findByField operations not implemented',
          );
        }

        // Get system database for system entities
        const db = await this.levelDBManager.getSystemDatabase(this.dbPrefix);

        // Make sure the database is ready
        await this.ensureDatabaseReady(db);

        const indexKey = this.getIndexKey(field, value);
        const id = await db.get(indexKey);
        return this.findById(id);
      }

      // Otherwise, scan all entities
      return this.findOne({ [field]: value } as Partial<T>);
    } catch (error) {
      if (error && error.type === 'NotFoundError') {
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
    if (!this.isSystemRepository) {
      throw new Error('Project-specific find operations not implemented');
    }

    // Get system database for system entities
    const db = await this.levelDBManager.getSystemDatabase(this.dbPrefix);

    // Make sure the database is ready
    await this.ensureDatabaseReady(db);

    const results: T[] = [];

    // Get all keys with the entity prefix
    const prefix = `${this.entityName.toLowerCase()}:`;

    // Use the LevelDB iterator to get all entities
    for await (const [key, value] of db.iterator({
      gte: prefix,
      lte: prefix + '\uffff',
      keys: true,
      values: true,
    }) as any) {
      // Skip index keys
      if (key.toString().includes(':index:')) continue;

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
      throw new Error(`${this.entityName} with ID ${id} not found for update`);
    }

    const updatedEntity = { ...entity, ...data, id };

    if (!this.isSystemRepository) {
      throw new Error('Project-specific update operations not implemented');
    }

    // Get system database for system entities
    const db = await this.levelDBManager.getSystemDatabase(this.dbPrefix);

    // Make sure the database is ready
    await this.ensureDatabaseReady(db);

    // Start a batch operation
    const batch = db.batch();

    // Update the main entity
    const entityKey = this.getEntityKey(id);
    await batch.put(entityKey, JSON.stringify(updatedEntity));

    // Update indexes
    for (const field of this.indexFields) {
      // If the field value has changed, update the index
      if (data[field] !== undefined && entity[field] !== data[field]) {
        // Delete old index if it exists
        if (entity[field]) {
          const oldIndexKey = this.getIndexKey(field, entity[field]);
          await batch.del(oldIndexKey);
        }

        // Add new index if it exists
        if (data[field]) {
          const newIndexKey = this.getIndexKey(field, data[field]);
          await batch.put(newIndexKey, id);
        }
      }
    }

    // Execute the batch
    await batch.write();

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

    if (!this.isSystemRepository) {
      throw new Error('Project-specific delete operations not implemented');
    }

    // Get system database for system entities
    const db = await this.levelDBManager.getSystemDatabase(this.dbPrefix);

    // Make sure the database is ready
    await this.ensureDatabaseReady(db);

    // Start a batch operation
    const batch = db.batch();

    // Delete the main entity
    const entityKey = this.getEntityKey(id);
    await batch.del(entityKey);

    // Delete indexes
    for (const field of this.indexFields) {
      if (entity[field]) {
        const indexKey = this.getIndexKey(field, entity[field]);
        await batch.del(indexKey);
      }
    }

    // Execute the batch
    await batch.write();

    this.logger.debug(`Deleted ${this.entityName} with ID ${id}`);
  }
}
