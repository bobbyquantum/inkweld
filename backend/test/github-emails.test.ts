import { describe, expect, it } from 'bun:test';
import {
  fetchVerifiedGithubEmail,
  selectVerifiedGithubEmail,
  type GithubEmailEntry,
} from '../src/utils/github-emails';

const entry = (email: string, primary: boolean, verified: boolean): GithubEmailEntry => ({
  email,
  primary,
  verified,
});

describe('selectVerifiedGithubEmail', () => {
  it('prefers the verified primary address', () => {
    expect(
      selectVerifiedGithubEmail([
        entry('other@example.com', false, true),
        entry('me@example.com', true, true),
      ])
    ).toBe('me@example.com');
  });

  it('skips an unverified primary in favour of a verified secondary', () => {
    expect(
      selectVerifiedGithubEmail([
        entry('victim@example.com', true, false),
        entry('me@example.com', false, true),
      ])
    ).toBe('me@example.com');
  });

  it('returns null when nothing is verified', () => {
    expect(selectVerifiedGithubEmail([entry('victim@example.com', true, false)])).toBeNull();
    expect(selectVerifiedGithubEmail([])).toBeNull();
  });
});

describe('fetchVerifiedGithubEmail', () => {
  const fakeFetch = (status: number, body: unknown): typeof fetch =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('sends the token and returns the verified address', async () => {
    let seenAuth: string | null = null;
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      seenAuth = new Headers(init?.headers).get('Authorization');
      return new Response(JSON.stringify([entry('me@example.com', true, true)]), { status: 200 });
    }) as unknown as typeof fetch;

    expect(await fetchVerifiedGithubEmail('tok', fetchImpl)).toBe('me@example.com');
    expect(seenAuth).toBe('Bearer tok');
  });

  it('returns null on a non-2xx response, a non-array body, or a network error', async () => {
    expect(await fetchVerifiedGithubEmail('tok', fakeFetch(401, { message: 'bad' }))).toBeNull();
    expect(await fetchVerifiedGithubEmail('tok', fakeFetch(200, { not: 'an array' }))).toBeNull();
    const failing = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await fetchVerifiedGithubEmail('tok', failing)).toBeNull();
  });
});
