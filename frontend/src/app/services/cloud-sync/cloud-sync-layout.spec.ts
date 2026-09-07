import { describe, expect, it } from 'vitest';

import {
  documentDocId,
  documentPath,
  elementsPath,
  mediaIndexPath,
  mediaPath,
  parseRemotePath,
  projectFolder,
  projectJsonPath,
  projectKeyFromDocId,
  projectKeyOf,
  snapshotPath,
  splitProjectKey,
  worldbuildingDocId,
  worldbuildingPath,
} from './cloud-sync-layout';

describe('cloud-sync-layout', () => {
  it('builds the documented paths', () => {
    expect(projectFolder('bobby', 'novel')).toBe('/projects/bobby/novel');
    expect(projectJsonPath('bobby', 'novel')).toBe(
      '/projects/bobby/novel/project.json'
    );
    expect(elementsPath('bobby', 'novel')).toBe(
      '/projects/bobby/novel/elements.yjs'
    );
    expect(documentPath('bobby', 'novel', 'e1')).toBe(
      '/projects/bobby/novel/documents/e1.yjs'
    );
    expect(worldbuildingPath('bobby', 'novel', 'w1')).toBe(
      '/projects/bobby/novel/worldbuilding/w1.yjs'
    );
    expect(mediaIndexPath('bobby', 'novel')).toBe(
      '/projects/bobby/novel/media.json'
    );
    expect(mediaPath('bobby', 'novel', 'm1')).toBe(
      '/projects/bobby/novel/media/m1'
    );
  });

  it('builds local doc ids matching DocumentService conventions', () => {
    expect(documentDocId('bobby', 'novel', 'e1')).toBe('bobby:novel:e1');
    expect(worldbuildingDocId('bobby', 'novel', 'w1')).toBe(
      'worldbuilding:bobby:novel:w1'
    );
  });

  it('round-trips every path kind through parseRemotePath', () => {
    expect(parseRemotePath(projectJsonPath('b', 'n'))).toEqual({
      username: 'b',
      slug: 'n',
      kind: 'project',
    });
    expect(parseRemotePath(elementsPath('b', 'n'))).toEqual({
      username: 'b',
      slug: 'n',
      kind: 'elements',
    });
    expect(parseRemotePath(mediaIndexPath('b', 'n'))).toEqual({
      username: 'b',
      slug: 'n',
      kind: 'media-index',
    });
    expect(parseRemotePath(documentPath('b', 'n', 'e1'))).toEqual({
      username: 'b',
      slug: 'n',
      kind: 'document',
      id: 'e1',
    });
    expect(parseRemotePath(worldbuildingPath('b', 'n', 'w1'))).toEqual({
      username: 'b',
      slug: 'n',
      kind: 'worldbuilding',
      id: 'w1',
    });
    expect(parseRemotePath(mediaPath('b', 'n', 'm1'))).toEqual({
      username: 'b',
      slug: 'n',
      kind: 'media',
      id: 'm1',
    });
    expect(snapshotPath('b', 'n', 'e1', 's1')).toBe(
      '/projects/b/n/snapshots/e1/s1.json'
    );
    expect(parseRemotePath(snapshotPath('b', 'n', 'e1', 's1'))).toEqual({
      username: 'b',
      slug: 'n',
      kind: 'snapshot',
      id: 'e1',
      snapshotId: 's1',
    });
    expect(parseRemotePath('/projects/b/n/snapshots/e1/s1.txt')).toBeNull();
    expect(parseRemotePath('/projects/b/n/other/e1/s1.json')).toBeNull();
  });

  it('ignores files outside the layout', () => {
    expect(parseRemotePath('/manifest.json')).toBeNull();
    expect(parseRemotePath('/projects/b/n')).toBeNull();
    expect(parseRemotePath('/projects/b/n/notes.txt')).toBeNull();
    expect(parseRemotePath('/projects/b/n/documents/e1.txt')).toBeNull();
    expect(parseRemotePath('/projects/b/n/documents/.yjs')).toBeNull();
    expect(parseRemotePath('/projects/b/n/other/x.yjs')).toBeNull();
    expect(parseRemotePath('/projects/b/n/media/x/y')).toBeNull();
  });

  it('project keys', () => {
    expect(projectKeyOf('b', 'n')).toBe('b/n');
    expect(splitProjectKey('b/n')).toEqual({ username: 'b', slug: 'n' });
    expect(splitProjectKey('b/')).toBeNull();
    expect(splitProjectKey('/n')).toBeNull();
    expect(splitProjectKey('bn')).toBeNull();
    expect(projectKeyFromDocId('b:n:e1')).toBe('b/n');
    expect(projectKeyFromDocId('worldbuilding:b:n:w1')).toBe('b/n');
    expect(projectKeyFromDocId('b:n')).toBeNull();
  });
});
