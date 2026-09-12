import { describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { getDatabase } from '../src/db/index';

/**
 * Guards the hot-path indexes added in migration 0033 and keeps the Drizzle
 * schema declarations and the SQL migration from drifting apart: the test
 * database is built by running the migrations (test/setup.ts), and the
 * expected shapes below are what the schema files declare.
 */

const EXPECTED: Record<string, { table: string; columns: string[] }> = {
  projects_user_id_slug_idx: { table: 'projects', columns: ['user_id', 'slug'] },
  project_collaborators_user_status_idx: {
    table: 'project_collaborators',
    columns: ['user_id', 'status'],
  },
  document_snapshots_project_document_idx: {
    table: 'document_snapshots',
    columns: ['project_id', 'document_id'],
  },
  project_tombstones_user_id_idx: { table: 'project_tombstones', columns: ['user_id'] },
  published_files_project_id_idx: { table: 'published_files', columns: ['project_id'] },
  published_files_share_token_idx: { table: 'published_files', columns: ['share_token'] },
};

interface IndexRow {
  name: string;
  tbl_name: string;
}
interface IndexInfoRow {
  seqno: number;
  name: string;
}

describe('hot-path indexes (migration 0033)', () => {
  const db = getDatabase();

  it('exist on the migrated database with the declared columns', async () => {
    const rows = (await db.all(
      sql`SELECT name, tbl_name FROM sqlite_master WHERE type = 'index'`
    )) as IndexRow[];
    const byName = new Map(rows.map((r) => [r.name, r.tbl_name]));

    for (const [name, expected] of Object.entries(EXPECTED)) {
      expect(byName.get(name)).toBe(expected.table);
      const info = (await db.all(sql.raw(`PRAGMA index_info(\`${name}\`)`))) as IndexInfoRow[];
      const columns = info.sort((a, b) => a.seqno - b.seqno).map((c) => c.name);
      expect(columns).toEqual(expected.columns);
    }
  });

  it('are used by the username/slug project lookup instead of a scan', async () => {
    const plan = (await db.all(
      sql`EXPLAIN QUERY PLAN
          SELECT p.id FROM projects p
          LEFT JOIN users u ON p.user_id = u.id
          WHERE u.username = 'alice' AND p.slug = 'novel'`
    )) as Array<{ detail: string }>;
    const details = plan.map((r) => r.detail).join('\n');
    expect(details).toContain('projects_user_id_slug_idx');
    expect(details).not.toMatch(/SCAN (TABLE )?(p|projects)\b/);
  });

  it('are used by the collaborator-side listing instead of a scan', async () => {
    const plan = (await db.all(
      sql`EXPLAIN QUERY PLAN
          SELECT id FROM project_collaborators
          WHERE user_id = 'user-1' AND status = 'accepted'`
    )) as Array<{ detail: string }>;
    const details = plan.map((r) => r.detail).join('\n');
    expect(details).toContain('project_collaborators_user_status_idx');
  });
});
