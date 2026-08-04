import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { config } from '../config/env';
import { FileStorageService } from './file-storage.service';
import { getProjectStorageSize, type CloudflareSizeEnv } from './storage-size.service';

// Minimal mocks for the Cloudflare Workers branch (Durable Object namespace).
interface MockStub {
  fetch: (input: Request | string) => Promise<Response>;
}
interface MockNamespace {
  idFromName: (name: string) => string;
  get: (id: string) => MockStub;
}
type MockEnv = Partial<CloudflareSizeEnv> & { YJS_PROJECTS?: MockNamespace };

function mockNamespace(response: Response, calls: string[] = []): MockNamespace {
  return {
    idFromName: (name: string) => {
      calls.push(`idFromName:${name}`);
      return name;
    },
    get: (id: string) => {
      calls.push(`get:${id}`);
      return {
        fetch: async (input: Request | string) => {
          const url = typeof input === 'string' ? input : (input as Request).url;
          calls.push(`fetch:${url}`);
          return response;
        },
      };
    },
  };
}

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

  it('queries Durable Object storage for data bytes on the Workers runtime', async () => {
    const calls: string[] = [];
    const namespace = mockNamespace(
      new Response(JSON.stringify({ projectId: 'bob:novel', bytes: 1234 })),
      calls
    );
    const env = { YJS_PROJECTS: namespace } as unknown as MockEnv;

    const size = await getProjectStorageSize('bob', 'novel', undefined, env, 'a-token');

    expect(size.dataBytes).toBe(1234);
    expect(size.mediaBytes).toBe(0);
    // The DO stub must be resolved for the project and hit /storage-size with
    // the caller's document id and bearer token.
    expect(calls.some((c) => c === 'idFromName:bob:novel')).toBe(true);
    expect(calls.some((c) => c === 'get:bob:novel')).toBe(true);
    expect(calls.some((c) => c.includes('documentId=bob%3Anovel%3Aelements'))).toBe(true);
  });

  it('returns 0 data bytes when the Workers DO returns a non-OK response', async () => {
    const namespace = mockNamespace(new Response('err', { status: 500 }));
    const env = { YJS_PROJECTS: namespace } as unknown as MockEnv;

    const size = await getProjectStorageSize('bob', 'novel', undefined, env, 't');
    expect(size.dataBytes).toBe(0);
  });

  it('returns 0 data bytes when the Workers DO fetch throws', async () => {
    const namespace = {
      idFromName: () => 'bob:novel',
      get: () => ({
        fetch: async () => {
          throw new Error('boom');
        },
      }),
    } as unknown as MockNamespace;
    const env = { YJS_PROJECTS: namespace } as unknown as MockEnv;

    const size = await getProjectStorageSize('bob', 'novel', undefined, env, 't');
    expect(size.dataBytes).toBe(0);
  });

  it('returns 0 data bytes when no token is provided on the Workers runtime', async () => {
    const namespace = mockNamespace(new Response(JSON.stringify({ bytes: 5 })));
    const env = { YJS_PROJECTS: namespace } as unknown as MockEnv;

    const size = await getProjectStorageSize('bob', 'novel', undefined, env);
    expect(size.dataBytes).toBe(0);
  });
});
