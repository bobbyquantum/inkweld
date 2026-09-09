import { describe, expect, it } from 'vitest';

import {
  CLOUD_MANIFEST_VERSION,
  type CloudManifestProject,
  createCloudManifest,
  findManifestProfile,
  manifestProjectsFor,
  manifestsEquivalent,
  mergeCloudManifests,
  mergeManifestProjects,
  parseCloudManifest,
  upsertManifestProject,
  withManifestProfile,
} from './cloud-manifest';

describe('cloud-manifest', () => {
  const owner = { provider: 'dropbox' as const, accountId: 'dbid:abc' };
  const profile = { name: 'Bobby Quantum', username: 'bobby' };

  describe('createCloudManifest', () => {
    it('creates an empty manifest at revision 1', () => {
      const manifest = createCloudManifest(owner, profile);
      expect(manifest.version).toBe(CLOUD_MANIFEST_VERSION);
      expect(manifest.owner).toEqual(owner);
      expect(manifest.profile).toEqual(profile);
      expect(manifest.projects).toEqual([]);
      expect(manifest.revision).toBe(1);
      expect(manifest.createdAt).toBe(manifest.updatedAt);
    });
  });

  describe('parseCloudManifest', () => {
    it('round-trips a created manifest', () => {
      const manifest = createCloudManifest(owner, profile);
      expect(parseCloudManifest(JSON.stringify(manifest))).toEqual(manifest);
    });

    it('returns null for invalid JSON', () => {
      expect(parseCloudManifest('{not json')).toBeNull();
    });

    it('returns null for non-object JSON', () => {
      expect(parseCloudManifest('"string"')).toBeNull();
      expect(parseCloudManifest('null')).toBeNull();
    });

    it('returns null for an unknown version', () => {
      const manifest = { ...createCloudManifest(owner, profile), version: 99 };
      expect(parseCloudManifest(JSON.stringify(manifest))).toBeNull();
    });

    it('returns null when owner or profile is missing', () => {
      const base = createCloudManifest(owner, profile);
      expect(
        parseCloudManifest(JSON.stringify({ ...base, owner: undefined }))
      ).toBeNull();
      expect(
        parseCloudManifest(JSON.stringify({ ...base, profile: { name: 'x' } }))
      ).toBeNull();
    });

    it('repairs missing optional fields with safe defaults', () => {
      const parsed = parseCloudManifest(
        JSON.stringify({
          version: 1,
          owner,
          profile,
          projects: 'not-an-array',
          revision: -3,
        })
      );
      expect(parsed).not.toBeNull();
      expect(parsed!.projects).toEqual([]);
      expect(parsed!.revision).toBe(1);
      expect(typeof parsed!.createdAt).toBe('string');
      expect(typeof parsed!.updatedAt).toBe('string');
    });
  });
  describe('mergeManifestProjects', () => {
    const entry = (
      key: string,
      updatedAt: string,
      extra: Partial<CloudManifestProject> = {}
    ): CloudManifestProject => ({
      key,
      slug: key.split('/')[1],
      title: `title@${updatedAt}`,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt,
      ...extra,
    });

    it('unions by key and keeps the later entry', () => {
      const merged = mergeManifestProjects(
        [
          entry('b/a', '2026-02-01T00:00:00.000Z'),
          entry('b/x', '2026-01-05T00:00:00.000Z'),
        ],
        [
          entry('b/a', '2026-03-01T00:00:00.000Z'),
          entry('b/y', '2026-01-06T00:00:00.000Z'),
        ]
      );
      expect(merged.map(e => e.key)).toEqual(['b/a', 'b/x', 'b/y']);
      expect(merged[0].title).toBe('title@2026-03-01T00:00:00.000Z');
    });

    it('lets a tombstone beat an older edit, but not a newer one', () => {
      const dead = entry('b/a', '2026-01-01T00:00:00.000Z', {
        deletedAt: '2026-02-01T00:00:00.000Z',
      });
      const olderEdit = entry('b/a', '2026-01-15T00:00:00.000Z');
      const newerEdit = entry('b/a', '2026-02-15T00:00:00.000Z');
      expect(mergeManifestProjects([olderEdit], [dead])[0].deletedAt).toBe(
        dead.deletedAt
      );
      expect(
        mergeManifestProjects([dead], [newerEdit])[0].deletedAt
      ).toBeUndefined();
    });

    it('prefers the tombstone on an exact tie', () => {
      const t = '2026-02-01T00:00:00.000Z';
      const dead = entry('b/a', t, { deletedAt: t });
      const edit = entry('b/a', t);
      expect(mergeManifestProjects([edit], [dead])[0].deletedAt).toBe(t);
      expect(mergeManifestProjects([dead], [edit])[0].deletedAt).toBe(t);
    });
  });

  describe('multiple authors', () => {
    it('lists the legacy profile and any extra profiles, deduplicated', () => {
      const manifest = createCloudManifest(owner, profile);
      expect(manifest.profiles).toEqual([profile]);

      const parsed = parseCloudManifest(
        JSON.stringify({
          ...manifest,
          profiles: [
            { name: 'Bobby Quantum', username: 'BOBBY' },
            { name: 'Bee', username: 'bee' },
            { name: 'broken' },
          ],
        })
      );
      expect(parsed?.profiles).toEqual([
        profile,
        { name: 'Bee', username: 'bee' },
      ]);
    });

    it('withManifestProfile appends or renames without touching the first author', () => {
      const base = createCloudManifest(owner, profile);
      const withBee = withManifestProfile(base, {
        name: 'Bee',
        username: 'bee',
      });
      expect(withBee.profiles.map(p => p.username)).toEqual(['bobby', 'bee']);
      expect(withBee.profile).toEqual(profile);
      expect(withBee.revision).toBe(2);

      const renamed = withManifestProfile(withBee, {
        name: 'Bee Two',
        username: 'BEE',
      });
      expect(findManifestProfile(renamed, 'bee')?.name).toBe('Bee Two');
      expect(renamed.profiles).toHaveLength(2);
      // Same data again is a no-op
      expect(
        withManifestProfile(renamed, { name: 'Bee Two', username: 'bee' })
      ).toBe(renamed);
    });

    it("manifestProjectsFor returns one author's live projects", () => {
      const base = createCloudManifest(owner, profile);
      const at = '2026-01-01T00:00:00Z';
      const project = (key: string) => ({
        key,
        slug: key.split('/')[1],
        title: key,
        createdAt: at,
        updatedAt: at,
      });
      const manifest = {
        ...base,
        projects: [
          project('bobby/a'),
          project('bee/b'),
          { ...project('bobby/c'), deletedAt: '2026-01-02T00:00:00Z' },
        ],
      };
      expect(manifestProjectsFor(manifest, 'BOBBY').map(p => p.slug)).toEqual([
        'a',
      ]);
    });

    it('merging unions the authors from both sides', () => {
      const local = withManifestProfile(createCloudManifest(owner, profile), {
        name: 'Bee',
        username: 'bee',
      });
      const remote = {
        ...withManifestProfile(createCloudManifest(owner, profile), {
          name: 'Cee',
          username: 'cee',
        }),
        revision: 9,
      };
      const merged = mergeCloudManifests(local, remote);
      expect(merged.profiles.map(p => p.username)).toEqual([
        'bobby',
        'cee',
        'bee',
      ]);
      expect(merged.profile).toEqual(profile);
    });
  });

  describe('mergeCloudManifests / upsert / equivalence', () => {
    it('takes the profile from the higher revision and bumps past both', () => {
      const local = { ...createCloudManifest(owner, profile), revision: 3 };
      const remote = {
        ...createCloudManifest(owner, { name: 'Renamed', username: 'bobby' }),
        revision: 5,
      };
      const merged = mergeCloudManifests(local, remote);
      expect(merged.profile.name).toBe('Renamed');
      expect(merged.revision).toBe(6);
    });

    it('upsert replaces an entry and bumps the revision', () => {
      const base = createCloudManifest(owner, profile);
      const withA = upsertManifestProject(base, {
        key: 'bobby/a',
        slug: 'a',
        title: 'A',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      const withA2 = upsertManifestProject(withA, {
        key: 'bobby/a',
        slug: 'a',
        title: 'A2',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      });
      expect(withA2.projects).toHaveLength(1);
      expect(withA2.projects[0].title).toBe('A2');
      expect(withA2.revision).toBe(3);
    });

    it('equivalence ignores revision and timestamps but not content', () => {
      const a = createCloudManifest(owner, profile);
      const b = { ...a, revision: 9, updatedAt: 'later' };
      expect(manifestsEquivalent(a, b)).toBe(true);
      expect(
        manifestsEquivalent(a, { ...b, profile: { ...profile, name: 'X' } })
      ).toBe(false);
      expect(
        manifestsEquivalent(
          a,
          upsertManifestProject(a, {
            key: 'bobby/a',
            slug: 'a',
            title: 'A',
            createdAt: 'c',
            updatedAt: 'u',
          })
        )
      ).toBe(false);
    });
  });
});
