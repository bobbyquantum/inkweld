import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LevelDBManagerService } from './leveldb-manager.service.js';
import * as fs from 'fs';
import * as path from 'path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test';

// Mock the y-leveldb module before importing
const mockDB = {
  close: mock(() => Promise.resolve()),
  get: mock(() => undefined),
  set: mock(() => undefined),
  del: mock(() => undefined),
};

// Mock the LeveldbPersistence constructor
const mockLeveldbPersistence = mock(() => mockDB);

// Use Bun's module mocking system
mock.module('y-leveldb', () => ({
  LeveldbPersistence: mockLeveldbPersistence,
}));

describe('LevelDBManagerService', () => {
  let service: LevelDBManagerService;
  let mockConfigService: Partial<ConfigService>;
  const testBasePath = './test-data';

  beforeEach(async () => {
    // Reset mocks
    mockLeveldbPersistence.mockClear();

    // Mock the ConfigService
    mockConfigService = {
      get: mock((key: string, defaultValue?: any) => {
        if (key === 'DATA_PATH') return testBasePath;
        if (key === 'LEVELDB_MAX_IDLE_TIME') return 1000; // 1 second for faster tests
        return defaultValue;
      }),
    };

    // Mock the fs module
    spyOn(fs, 'existsSync').mockImplementation((dirPath: string) => {
      // Base path already exists
      if (dirPath === testBasePath || dirPath.includes('leveldb')) return true;
      // Project paths don't exist initially
      return false;
    });
    spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    spyOn(fs, 'readdirSync').mockReturnValue([
      'user1',
      'user2',
    ] as unknown as fs.Dirent[]);
    spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as unknown as fs.Stats);
    spyOn(fs, 'rmSync').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LevelDBManagerService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<LevelDBManagerService>(LevelDBManagerService);
  });

  afterEach(() => {
    // Clean up any mocks
    mock.restore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create the base directory if it does not exist', () => {
    spyOn(fs, 'existsSync').mockReturnValueOnce(false);

    // Re-initialize the service
    service = new LevelDBManagerService(mockConfigService as ConfigService);

    expect(fs.mkdirSync).toHaveBeenCalledWith(testBasePath, {
      recursive: true,
    });
  });

  it('should get a project database and cache it', async () => {
    // Get the database for the first time
    const db1 = await service.getProjectDatabase('user1', 'project1');

    // Verify a new database was created
    expect(mockLeveldbPersistence).toHaveBeenCalledWith(
      path.join(testBasePath, 'user1', 'project1', 'leveldb'),
      expect.objectContaining({
        levelOptions: expect.objectContaining({
          createIfMissing: true,
          errorIfExists: false,
        }),
      }),
    );
    expect(db1).toBe(mockDB);

    // Get the same database again
    const db2 = await service.getProjectDatabase('user1', 'project1');

    // Verify it uses the cached instance
    expect(mockLeveldbPersistence).toHaveBeenCalledTimes(1);
    expect(db2).toBe(mockDB);
  });

  it('should sanitize usernames and slugs for path safety', async () => {
    // Use a username and slug with special characters
    await service.getProjectDatabase('user@1', 'project/1');

    // Verify the path was sanitized
    expect(mockLeveldbPersistence).toHaveBeenCalledWith(
      path.join(testBasePath, 'user_1', 'project_1', 'leveldb'),
      expect.anything(),
    );
  });

  it('should list all projects', async () => {
    // Mock to simulate the directory structure
    spyOn(fs, 'readdirSync')
      .mockReturnValueOnce(['user1', 'user2'] as any) // Top level dirs
      .mockReturnValueOnce(['project1', 'project2'] as any); // Projects in user1

    const projects = await service.listProjects();

    expect(fs.readdirSync).toHaveBeenCalledWith(testBasePath);
    // The current implementation simply returns the top-level directories
    // We may need to update the service.listProjects() method to handle the new structure
    expect(projects).toEqual(['user1', 'user2']);
  });

  it('should close project databases', async () => {
    // Get a database so it's cached
    await service.getProjectDatabase('user1', 'project1');

    // Reset mock count after initial setup
    mockLeveldbPersistence.mockClear();

    // Close the database
    await service.closeProjectDatabase('user1', 'project1');

    // Get the same database again
    await service.getProjectDatabase('user1', 'project1');

    // Verify a new database was created
    expect(mockLeveldbPersistence).toHaveBeenCalledTimes(1);
  });

  it('should delete project databases', async () => {
    // Get a database so it's cached
    await service.getProjectDatabase('user1', 'project1');

    // Mock existsSync to return true for the project path
    spyOn(fs, 'existsSync').mockReturnValueOnce(true);

    // Delete the database
    await service.deleteProjectDatabase('user1', 'project1');

    // Verify fs.rmSync was called with the project path
    expect(fs.rmSync).toHaveBeenCalledWith(
      path.join(testBasePath, 'user1', 'project1', 'leveldb'),
      { recursive: true, force: true },
    );
  });

  it('should clean up idle databases', async () => {
    // Get a database so it's cached
    await service.getProjectDatabase('user1', 'project1');

    // Clear the mock counts from initial setup
    mockLeveldbPersistence.mockClear();

    // Fast-forward time to make the database idle
    // Use Date.now mocking instead of advanceTimersByTime
    const currentTime = Date.now();
    spyOn(Date, 'now').mockReturnValue(currentTime + 1500); // 1.5 seconds later

    // Manually trigger cleanup
    await (service as any).cleanupIdleDatabases();

    // Get the same database again
    await service.getProjectDatabase('user1', 'project1');

    // Verify a new database was created
    expect(mockLeveldbPersistence).toHaveBeenCalledTimes(1);
  });
});
