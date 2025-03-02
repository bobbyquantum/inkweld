import { describe, expect, it } from 'bun:test';
import { DatabaseModule } from './database.module.js';
import { DatabaseConfigService } from './database.config.js';

describe('DatabaseModule', () => {
  it('should be defined', () => {
    // Simple test to verify the module can be instantiated
    const databaseModule = new DatabaseModule();
    expect(databaseModule).toBeDefined();
  });

  it('should have correct structure', () => {
    // Check that the module exports DatabaseConfigService
    const moduleDefinition = Reflect.getMetadata('exports', DatabaseModule);
    expect(moduleDefinition).toContain(DatabaseConfigService);
  });
});
