import { describe, expect, it } from 'bun:test';
import { matchProjectPath } from '../src/middleware/public-project-read';

describe('matchProjectPath', () => {
  it('splits a project path on every router that serves public reads', () => {
    expect(matchProjectPath('/api/v1/projects/alice/novel')).toEqual([
      '/api/v1/projects/alice/novel',
      'alice',
      'novel',
      '',
    ]);
    expect(matchProjectPath('/api/v1/media/alice/novel/cover.png')?.slice(1)).toEqual([
      'alice',
      'novel',
      '/cover.png',
    ]);
    expect(matchProjectPath('/api/v1/published-files/alice/novel/x')?.[3]).toBe('/x');
    expect(matchProjectPath('/api/v1/comments/alice/novel/unread')?.[3]).toBe('/unread');
    expect(matchProjectPath('/api/v1/activity/projects/a%20b/novel')?.slice(1, 3)).toEqual([
      'a%20b',
      'novel',
    ]);
  });

  it('names no project for other paths or a missing username or slug', () => {
    for (const path of [
      '/api/v1/users/alice/novel',
      '/api/v1/activity/alice/novel',
      '/api/v1/projects/',
      '/api/v1/projects/alice',
      '/api/v1/projects/alice/',
      '/api/v1/projects//novel',
      '/api/v1/projects',
    ]) {
      expect(matchProjectPath(path)).toBeNull();
    }
  });

  it('reads a long hostile path in linear time', () => {
    const path = `/api/v1/projects/${'a'.repeat(100_000)}/${'b/'.repeat(50_000)}`;
    const started = performance.now();
    expect(matchProjectPath(path)?.[1]).toBe('a'.repeat(100_000));
    expect(performance.now() - started).toBeLessThan(100);
  });
});
