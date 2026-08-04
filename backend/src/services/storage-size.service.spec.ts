import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { config } from '../config/env';
import { FileStorageService } from './file-storage.service';
import { getProjectStorageSize } from './storage-size.service';

// The services read config.dataPath at construction, so we retarget it to a
// throwaway temp dir for the duration of these tests.
let tempRoot = '';
const originalDataPath = config.dataPath;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), 'inkweld-size-'));
  (config as unknown as { dataPath: string }).dataPath = tempRoot;
});

afterEach(async () => {
  (config as unknown as { dataPath: string }).dataPath = originalDataPath;
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('FileStorageService.getProjectDirectorySize', () => {
  let service: FileStorageService;

  beforeEach(async () => {
    service = new FileStorageService();
  });

  it('returns 0 when the project directory does not exist', async () => {
    expect(await service.getProjectDirectorySize('alice', 'missing')).toBe(0);
  });

  it('sums top-level files and nested subdirectories', async () => {
    const projectPath = path.join(tempRoot, 'alice', 'my-book');
    await mkdir(path.join(projectPath, '.yjs'), { recursive: true });
    await writeFile(path.join(projectPath, 'cover.jpg'), Buffer.alloc(100));
    await writeFile(path.join(projectPath, '.yjs', 'log.level'), Buffer.alloc(50));

    expect(await service.getProjectDirectorySize('alice', 'my-book')).toBe(150);
  });
});

describe('getProjectStorageSize', () => {
  it('reports data + media bytes on the filesystem runtime', async () => {
    const projectPath = path.join(tempRoot, 'bob', 'novel');
    await mkdir(path.join(projectPath, '.yjs'), { recursive: true });
    await writeFile(path.join(projectPath, 'chapter.level'), Buffer.alloc(40)); // LevelDB-ish
    await writeFile(path.join(projectPath, '.yjs', 'state.level'), Buffer.alloc(20));
    await writeFile(path.join(projectPath, 'cover.jpg'), Buffer.alloc(30)); // media
    await writeFile(path.join(projectPath, 'scene.png'), Buffer.alloc(70)); // media

    const size = await getProjectStorageSize('bob', 'novel');
    // dataBytes = 40 + 20 (project dir incl .yjs). mediaBytes = 30 + 70.
    expect(size.dataBytes).toBe(60);
    expect(size.mediaBytes).toBe(100);
  });
});
