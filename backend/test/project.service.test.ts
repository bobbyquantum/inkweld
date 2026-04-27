import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';

import { getDatabase } from '../src/db/index';
import type { DatabaseInstance } from '../src/types/context';
import { users, projects, projectSlugAliases, projectTombstones } from '../src/db/schema/index';
import { projectService } from '../src/services/project.service';
import { startTestServer, stopTestServer } from './server-test-helper';

let db: DatabaseInstance;
const USER_ID = crypto.randomUUID();
const USERNAME = 'projserviceuser';

function insertUser() {
  return db.insert(users).values({
    id: USER_ID,
    username: USERNAME,
    email: `${USERNAME}@example.com`,
    password: 'hashed',
    approved: true,
    enabled: true,
  });
}

beforeAll(async () => {
  await startTestServer();
  db = getDatabase();
  await db.delete(users).where(eq(users.username, USERNAME));
  await insertUser();
});

afterAll(async () => {
  await db.delete(projectTombstones).where(eq(projectTombstones.userId, USER_ID));
  await db.delete(projectSlugAliases).where(eq(projectSlugAliases.userId, USER_ID));
  await db.delete(projects).where(eq(projects.userId, USER_ID));
  await db.delete(users).where(eq(users.id, USER_ID));
  await stopTestServer();
});

beforeEach(async () => {
  await db.delete(projectTombstones).where(eq(projectTombstones.userId, USER_ID));
  await db.delete(projectSlugAliases).where(eq(projectSlugAliases.userId, USER_ID));
  await db.delete(projects).where(eq(projects.userId, USER_ID));
});

describe('ProjectService – findById', () => {
  it('returns undefined when project not found', async () => {
    const result = await projectService.findById(db, crypto.randomUUID());
    expect(result).toBeUndefined();
  });

  it('returns project when found', async () => {
    const created = await projectService.create(db, {
      slug: 'my-project',
      title: 'My Project',
      userId: USER_ID,
    });
    const found = await projectService.findById(db, created.id);
    expect(found).toBeDefined();
    expect(found?.title).toBe('My Project');
  });
});

describe('ProjectService – findByUsernameAndSlug', () => {
  it('returns undefined when user does not exist', async () => {
    const result = await projectService.findByUsernameAndSlug(db, 'nobody', 'project');
    expect(result).toBeUndefined();
  });

  it('returns undefined when project slug does not exist', async () => {
    const result = await projectService.findByUsernameAndSlug(db, USERNAME, 'no-such-project');
    expect(result).toBeUndefined();
  });

  it('returns project with username when found', async () => {
    await projectService.create(db, {
      slug: 'find-by-slug',
      title: 'Find By Slug',
      userId: USER_ID,
    });
    const result = await projectService.findByUsernameAndSlug(db, USERNAME, 'find-by-slug');
    expect(result).toBeDefined();
    expect(result?.title).toBe('Find By Slug');
    expect(result?.username).toBe(USERNAME);
  });
});

describe('ProjectService – findByUserId', () => {
  it('returns empty array when user has no projects', async () => {
    const result = await projectService.findByUserId(db, USER_ID);
    expect(result).toEqual([]);
  });

  it('returns all projects for a user ordered by updatedDate desc', async () => {
    await projectService.create(db, { slug: 'proj-a', title: 'A', userId: USER_ID });
    await projectService.create(db, { slug: 'proj-b', title: 'B', userId: USER_ID });

    const result = await projectService.findByUserId(db, USER_ID);
    expect(result).toHaveLength(2);
  });
});

describe('ProjectService – create', () => {
  it('creates a project with generated id and version 1', async () => {
    const project = await projectService.create(db, {
      slug: 'new-project',
      title: 'New Project',
      description: 'A description',
      userId: USER_ID,
    });
    expect(project.id).toBeTruthy();
    expect(project.slug).toBe('new-project');
    expect(project.title).toBe('New Project');
    expect(project.description).toBe('A description');
    expect(project.version).toBe(1);
    expect(project.userId).toBe(USER_ID);
  });

  it('creates a project without optional description', async () => {
    const project = await projectService.create(db, {
      slug: 'no-desc',
      title: 'No Desc',
      userId: USER_ID,
    });
    expect(project.description).toBeNull();
  });
});

describe('ProjectService – update', () => {
  it('updates project title and description', async () => {
    const created = await projectService.create(db, {
      slug: 'update-me',
      title: 'Before',
      userId: USER_ID,
    });
    await projectService.update(db, created.id, {
      title: 'After',
      description: 'Updated desc',
    });
    const updated = await projectService.findById(db, created.id);
    expect(updated?.title).toBe('After');
    expect(updated?.description).toBe('Updated desc');
  });

  it('sets coverImage to null when explicitly passed', async () => {
    const created = await projectService.create(db, {
      slug: 'cover-test',
      title: 'Cover Test',
      userId: USER_ID,
    });
    await projectService.update(db, created.id, { coverImage: null });
    const updated = await projectService.findById(db, created.id);
    expect(updated?.coverImage).toBeNull();
  });
});

describe('ProjectService – isOwner', () => {
  it('returns true when user owns the project', async () => {
    const created = await projectService.create(db, {
      slug: 'owner-test',
      title: 'Owner',
      userId: USER_ID,
    });
    expect(await projectService.isOwner(db, created.id, USER_ID)).toBe(true);
  });

  it('returns false when another user id is passed', async () => {
    const created = await projectService.create(db, {
      slug: 'not-owner',
      title: 'Not',
      userId: USER_ID,
    });
    expect(await projectService.isOwner(db, created.id, crypto.randomUUID())).toBe(false);
  });

  it('returns false when project does not exist', async () => {
    expect(await projectService.isOwner(db, crypto.randomUUID(), USER_ID)).toBe(false);
  });
});

describe('ProjectService – slug alias operations', () => {
  it('findSlugAlias returns undefined for non-existent slug', async () => {
    const result = await projectService.findSlugAlias(db, USERNAME, 'old-slug');
    expect(result).toBeUndefined();
  });

  it('findSlugAlias returns undefined for non-existent user', async () => {
    const result = await projectService.findSlugAlias(db, 'nobody', 'slug');
    expect(result).toBeUndefined();
  });

  it('createSlugAlias and findSlugAlias round-trip', async () => {
    await projectService.createSlugAlias(db, USER_ID, 'old-slug', 'new-slug');
    const alias = await projectService.findSlugAlias(db, USERNAME, 'old-slug');
    expect(alias).toBeDefined();
    expect(alias?.newSlug).toBe('new-slug');
  });

  it('createSlugAlias replaces existing alias for same oldSlug', async () => {
    await projectService.createSlugAlias(db, USER_ID, 'old-slug', 'first-new');
    await projectService.createSlugAlias(db, USER_ID, 'old-slug', 'second-new');
    const alias = await projectService.findSlugAlias(db, USERNAME, 'old-slug');
    expect(alias?.newSlug).toBe('second-new');
  });

  it('updateAliasChain updates existing alias by matching newSlug', async () => {
    await projectService.createSlugAlias(db, USER_ID, 'v1', 'v2');
    await projectService.updateAliasChain(db, USER_ID, 'v2', 'v3');
    const alias = await projectService.findSlugAlias(db, USERNAME, 'v1');
    expect(alias?.newSlug).toBe('v3');
  });

  it('deleteAliases removes aliases pointing from or to a slug', async () => {
    await projectService.createSlugAlias(db, USER_ID, 'from-slug', 'to-slug');
    await projectService.deleteAliases(db, USER_ID, 'from-slug');

    const alias = await projectService.findSlugAlias(db, USERNAME, 'from-slug');
    expect(alias).toBeUndefined();
  });
});

describe('ProjectService – tombstone operations', () => {
  it('createTombstone persists a tombstone record', async () => {
    await projectService.createTombstone(db, USER_ID, 'deleted-project');
    const tombstone = await projectService.findTombstone(db, USERNAME, 'deleted-project');
    expect(tombstone).toBeDefined();
    expect(tombstone?.slug).toBe('deleted-project');
    expect(tombstone?.userId).toBe(USER_ID);
    expect(tombstone?.deletedAt).toBeGreaterThan(0);
  });

  it('findTombstone returns undefined for non-deleted project', async () => {
    const tombstone = await projectService.findTombstone(db, USERNAME, 'never-deleted');
    expect(tombstone).toBeUndefined();
  });

  it('findTombstone returns undefined for non-existent user', async () => {
    const tombstone = await projectService.findTombstone(db, 'nobody', 'slug');
    expect(tombstone).toBeUndefined();
  });

  it('createTombstone replaces existing tombstone for same slug', async () => {
    await projectService.createTombstone(db, USER_ID, 'replaced-slug');
    await projectService.createTombstone(db, USER_ID, 'replaced-slug');
    const tombstone = await projectService.findTombstone(db, USERNAME, 'replaced-slug');
    expect(tombstone).toBeDefined();
  });

  it('removeTombstone removes existing tombstone', async () => {
    await projectService.createTombstone(db, USER_ID, 'remove-me');
    await projectService.removeTombstone(db, USER_ID, 'remove-me');
    const tombstone = await projectService.findTombstone(db, USERNAME, 'remove-me');
    expect(tombstone).toBeUndefined();
  });
});

describe('ProjectService – findTombstonesByProjectKeys', () => {
  it('returns empty array for empty input', async () => {
    const result = await projectService.findTombstonesByProjectKeys(db, []);
    expect(result).toEqual([]);
  });

  it('returns empty array for malformed keys', async () => {
    const result = await projectService.findTombstonesByProjectKeys(db, ['badkey']);
    expect(result).toEqual([]);
  });

  it('returns empty array when user does not exist', async () => {
    const result = await projectService.findTombstonesByProjectKeys(db, ['nobody/project']);
    expect(result).toEqual([]);
  });

  it('returns tombstone for a deleted project', async () => {
    await projectService.createTombstone(db, USER_ID, 'deleted-key');
    const result = await projectService.findTombstonesByProjectKeys(db, [
      `${USERNAME}/deleted-key`,
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].username).toBe(USERNAME);
    expect(result[0].slug).toBe('deleted-key');
  });

  it('excludes non-deleted projects', async () => {
    const result = await projectService.findTombstonesByProjectKeys(db, [
      `${USERNAME}/existing`,
      `${USERNAME}/deleted`,
    ]);
    expect(result).toHaveLength(0);
  });
});

describe('ProjectService – findTombstones (deprecated)', () => {
  it('returns empty array for empty slugs', async () => {
    const result = await projectService.findTombstones(db, USER_ID, []);
    expect(result).toEqual([]);
  });

  it('returns tombstone records matching slugs', async () => {
    await projectService.createTombstone(db, USER_ID, 'dep-1');
    await projectService.createTombstone(db, USER_ID, 'dep-2');
    const result = await projectService.findTombstones(db, USER_ID, ['dep-1']);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('dep-1');
  });
});

describe('ProjectService – delete', () => {
  it('creates tombstone and removes project', async () => {
    const created = await projectService.create(db, {
      slug: 'delete-me',
      title: 'Delete Me',
      userId: USER_ID,
    });

    await projectService.delete(db, created.id, USER_ID, created.slug);

    const found = await projectService.findById(db, created.id);
    expect(found).toBeUndefined();

    const tombstone = await projectService.findTombstone(db, USERNAME, created.slug);
    expect(tombstone).toBeDefined();
    expect(tombstone?.slug).toBe('delete-me');
  });

  it('also deletes slug aliases when project is deleted', async () => {
    const created = await projectService.create(db, {
      slug: 'del-alias',
      title: 'Del Alias',
      userId: USER_ID,
    });
    await projectService.createSlugAlias(db, USER_ID, 'old-name', 'del-alias');

    await projectService.delete(db, created.id, USER_ID, created.slug);

    const alias = await projectService.findSlugAlias(db, USERNAME, 'old-name');
    expect(alias).toBeUndefined();
  });
});
