import { type CloudProvider } from '@services/core/storage-context.service';

/** Current manifest schema version */
export const CLOUD_MANIFEST_VERSION = 1;

/** Path of the manifest inside the provider app folder */
export const CLOUD_MANIFEST_PATH = '/manifest.json';

/**
 * Per-project entry in the cloud manifest. Lightweight metadata only: enough
 * to render a project card and decide whether to pull the full project.
 */
export interface CloudManifestProject {
  /** "username/slug" */
  key: string;
  slug: string;
  title: string;
  description?: string;
  /** Media id of the cover image, if any */
  coverMediaId?: string;
  createdAt: string;
  updatedAt: string;
  /** Set when the project has been deleted on some device */
  deletedAt?: string;
}

/**
 * The manifest is the one file every device reads first and writes last.
 * It carries the profile (so a second device needs no setup questions), the
 * project list, and deletion tombstones. Per-file version tags for change
 * detection live alongside the project data, not here.
 */
export interface CloudManifest {
  version: typeof CLOUD_MANIFEST_VERSION;
  /** Which provider account owns this folder */
  owner: {
    provider: CloudProvider;
    accountId: string;
  };
  /**
   * First author profile in this folder. Kept for older clients; the full
   * list, including this one, is `profiles`.
   */
  profile: CloudManifestProfile;
  /**
   * Every author profile that syncs through this account. One cloud account
   * can hold several authors; each owns the projects under its username.
   */
  profiles: CloudManifestProfile[];
  projects: CloudManifestProject[];
  createdAt: string;
  updatedAt: string;
  /** Monotonic counter bumped on every write, used for last-writer-wins */
  revision: number;
}

/** One author identity stored in the manifest */
export interface CloudManifestProfile {
  name: string;
  username: string;
}

/** Build a fresh manifest for a newly connected account */
export function createCloudManifest(
  owner: CloudManifest['owner'],
  profile: CloudManifestProfile
): CloudManifest {
  const now = new Date().toISOString();
  return {
    version: CLOUD_MANIFEST_VERSION,
    owner,
    profile,
    profiles: [profile],
    projects: [],
    createdAt: now,
    updatedAt: now,
    revision: 1,
  };
}

/**
 * Parse and validate manifest JSON. Returns null for anything that is not a
 * manifest we understand, so callers can treat a corrupt file as "absent"
 * rather than crash the setup flow.
 */
export function parseCloudManifest(text: string): CloudManifest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const candidate = parsed as Partial<CloudManifest>;
  if (candidate.version !== CLOUD_MANIFEST_VERSION) return null;
  if (
    typeof candidate.owner?.provider !== 'string' ||
    typeof candidate.owner?.accountId !== 'string'
  ) {
    return null;
  }
  if (
    typeof candidate.profile?.name !== 'string' ||
    typeof candidate.profile?.username !== 'string'
  ) {
    return null;
  }
  const profile: CloudManifestProfile = {
    name: candidate.profile.name,
    username: candidate.profile.username,
  };
  const extra = Array.isArray(candidate.profiles)
    ? candidate.profiles.filter(
        (p): p is CloudManifestProfile =>
          typeof p?.name === 'string' && typeof p.username === 'string'
      )
    : [];
  return {
    version: CLOUD_MANIFEST_VERSION,
    owner: {
      provider: candidate.owner.provider,
      accountId: candidate.owner.accountId,
    },
    profile,
    profiles: dedupeProfiles([profile, ...extra]),
    projects: Array.isArray(candidate.projects) ? candidate.projects : [],
    createdAt:
      typeof candidate.createdAt === 'string'
        ? candidate.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof candidate.updatedAt === 'string'
        ? candidate.updatedAt
        : new Date().toISOString(),
    revision:
      typeof candidate.revision === 'number' && candidate.revision > 0
        ? candidate.revision
        : 1,
  };
}

/** Latest of updatedAt/deletedAt, used for last-writer-wins on entries */
function entryClock(entry: CloudManifestProject): string {
  return entry.deletedAt && entry.deletedAt > entry.updatedAt
    ? entry.deletedAt
    : entry.updatedAt;
}

/**
 * Merge two project lists by key. The entry with the later clock wins; a
 * tombstone beats any edit made before the deletion. Result is sorted by key
 * so repeated merges are stable.
 */
export function mergeManifestProjects(
  a: CloudManifestProject[],
  b: CloudManifestProject[]
): CloudManifestProject[] {
  const byKey = new Map<string, CloudManifestProject>();
  for (const entry of [...a, ...b]) {
    const existing = byKey.get(entry.key);
    if (!existing) {
      byKey.set(entry.key, entry);
      continue;
    }
    const existingClock = entryClock(existing);
    const incomingClock = entryClock(entry);
    // Later clock wins; on an exact tie prefer the tombstone so a delete is
    // never resurrected.
    const incomingWins =
      incomingClock > existingClock ||
      (incomingClock === existingClock && !!entry.deletedAt);
    if (incomingWins) {
      byKey.set(entry.key, entry);
    }
  }
  return [...byKey.values()].sort((x, y) => x.key.localeCompare(y.key));
}

/**
 * Merge a locally modified manifest with the current remote one. Authors
 * are unioned; project lists merge entry by entry; the
 * result gets a revision above both so the next writer sees it as newer.
 */
export function mergeCloudManifests(
  local: CloudManifest,
  remote: CloudManifest
): CloudManifest {
  const newer = remote.revision > local.revision ? remote : local;
  // Authors are a union: two devices may each have added one concurrently
  const profiles = dedupeProfiles([
    ...newer.profiles,
    ...(newer === remote ? local : remote).profiles,
  ]);
  return {
    version: CLOUD_MANIFEST_VERSION,
    owner: newer.owner,
    profile: { ...(profiles[0] ?? newer.profile) },
    profiles,
    projects: mergeManifestProjects(remote.projects, local.projects),
    createdAt:
      local.createdAt < remote.createdAt ? local.createdAt : remote.createdAt,
    updatedAt: new Date().toISOString(),
    revision: Math.max(local.revision, remote.revision) + 1,
  };
}

/** Return a copy of the manifest with one project entry replaced or added */
export function upsertManifestProject(
  manifest: CloudManifest,
  entry: CloudManifestProject
): CloudManifest {
  return {
    ...manifest,
    projects: mergeManifestProjects(manifest.projects, [entry]),
    updatedAt: new Date().toISOString(),
    revision: manifest.revision + 1,
  };
}

/** Structural equality on the parts that matter for "do we need to push" */
export function manifestsEquivalent(
  a: CloudManifest,
  b: CloudManifest
): boolean {
  if (a.profile.name !== b.profile.name) return false;
  if (a.profile.username !== b.profile.username) return false;
  if (a.projects.length !== b.projects.length) return false;
  const sortedA = mergeManifestProjects(a.projects, []);
  const sortedB = mergeManifestProjects(b.projects, []);
  return JSON.stringify(sortedA) === JSON.stringify(sortedB);
}

/** Usernames compare case-insensitively */
export function sameUsername(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function dedupeProfiles(
  profiles: CloudManifestProfile[]
): CloudManifestProfile[] {
  const out: CloudManifestProfile[] = [];
  for (const p of profiles) {
    if (!out.some(o => sameUsername(o.username, p.username))) out.push(p);
  }
  return out;
}

/** The profile in a manifest with this username, if any */
export function findManifestProfile(
  manifest: CloudManifest,
  username: string
): CloudManifestProfile | undefined {
  return manifest.profiles.find(p => sameUsername(p.username, username));
}

/**
 * Return a manifest that lists `profile`. An existing entry with the same
 * username is updated (display name may change); otherwise it is appended.
 * `profile` (the legacy single field) is left pointing at the first author.
 */
export function withManifestProfile(
  manifest: CloudManifest,
  profile: CloudManifestProfile
): CloudManifest {
  const existing = findManifestProfile(manifest, profile.username);
  if (existing && existing.name === profile.name) return manifest;
  const profiles = existing
    ? manifest.profiles.map(p =>
        sameUsername(p.username, profile.username) ? { ...p, ...profile } : p
      )
    : [...manifest.profiles, profile];
  const first = profiles[0];
  return {
    ...manifest,
    profile: first,
    profiles,
    updatedAt: new Date().toISOString(),
    revision: manifest.revision + 1,
  };
}

/** Project keys in a manifest that belong to one author and are not deleted */
export function manifestProjectsFor(
  manifest: CloudManifest,
  username: string
): CloudManifestProject[] {
  return manifest.projects.filter(
    p => !p.deletedAt && sameUsername(p.key.split('/')[0] ?? '', username)
  );
}
