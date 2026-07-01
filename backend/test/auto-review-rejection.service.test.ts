/**
 * Unit tests for AutoReviewRejectionService.
 *
 * Exercises the real DB layer (in-memory SQLite) instead of spying on the
 * service, so the actual insert/select/delete logic is covered. Other
 * suites (`auto-review.service.test.ts`, `auto-review.routes.test.ts`)
 * spy on this service, which left it at 0% coverage.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';

import { getDatabase } from '../src/db/index';
import type { DatabaseInstance } from '../src/types/context';
import { users, projects, autoReviewRejections } from '../src/db/schema/index';
import { autoReviewRejectionService } from '../src/services/auto-review-rejection.service';
import { projectService } from '../src/services/project.service';
import { startTestServer, stopTestServer } from './server-test-helper';

let db: DatabaseInstance;
const USER_ID = crypto.randomUUID();
const USERNAME = 'arrej-user';
let PROJECT_ID: string;
const DOCUMENT_ID = 'arrej-user:proj:doc/';
const ELEMENT_ID = 'arrej-user:proj:doc';

const baseRejection = {
  originalText: 'This are wrong.',
  suggestionText: 'This is wrong.',
  category: 'grammar',
  message: 'Subject-verb disagreement.',
};

beforeAll(async () => {
  await startTestServer();
  db = getDatabase();

  await db.delete(users).where(eq(users.username, USERNAME));
  await db.insert(users).values({
    id: USER_ID,
    username: USERNAME,
    email: `${USERNAME}@example.com`,
    password: 'hashed',
    approved: true,
    enabled: true,
  });

  const p = await projectService.create(db, {
    slug: 'arrej-proj',
    title: 'AR Rej Proj',
    userId: USER_ID,
  });
  PROJECT_ID = p.id;
});

afterAll(async () => {
  await db.delete(autoReviewRejections).where(eq(autoReviewRejections.projectId, PROJECT_ID));
  await db.delete(projects).where(eq(projects.id, PROJECT_ID));
  await db.delete(users).where(eq(users.id, USER_ID));
  await stopTestServer();
});

beforeEach(async () => {
  await db.delete(autoReviewRejections).where(eq(autoReviewRejections.projectId, PROJECT_ID));
});

describe('AutoReviewRejectionService', () => {
  describe('addRejection + getRejections round-trip', () => {
    it('stores a rejection and returns it mapped to RejectionContext', async () => {
      await autoReviewRejectionService.addRejection(db, {
        projectId: PROJECT_ID,
        documentId: DOCUMENT_ID,
        elementId: ELEMENT_ID,
        rejection: baseRejection,
        userId: USER_ID,
      });

      const rows = await autoReviewRejectionService.getRejections(db, PROJECT_ID, ELEMENT_ID);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        originalText: 'This are wrong.',
        suggestionText: 'This is wrong.',
        category: 'grammar',
        message: 'Subject-verb disagreement.',
      });
    });

    it('returns rejections scoped to the element (not other elements)', async () => {
      await autoReviewRejectionService.addRejection(db, {
        projectId: PROJECT_ID,
        documentId: DOCUMENT_ID,
        elementId: ELEMENT_ID,
        rejection: baseRejection,
        userId: USER_ID,
      });
      await autoReviewRejectionService.addRejection(db, {
        projectId: PROJECT_ID,
        documentId: 'arrej-user:proj:other/',
        elementId: 'arrej-user:proj:other',
        rejection: { ...baseRejection, originalText: 'Other text.' },
        userId: USER_ID,
      });

      const rows = await autoReviewRejectionService.getRejections(db, PROJECT_ID, ELEMENT_ID);

      expect(rows).toHaveLength(1);
      expect(rows[0].originalText).toBe('This are wrong.');
    });

    it('coerces null category/message columns to empty strings', async () => {
      // Insert a row directly with null category/message to exercise the
      // `?? ''` fallback in getRejections().
      await db.insert(autoReviewRejections).values({
        projectId: PROJECT_ID,
        documentId: DOCUMENT_ID,
        elementId: ELEMENT_ID,
        originalText: 'x',
        suggestionText: 'y',
        category: null,
        message: null,
        rejectedBy: USER_ID,
        rejectedAt: Math.floor(Date.now() / 1000),
      });

      const rows = await autoReviewRejectionService.getRejections(db, PROJECT_ID, ELEMENT_ID);

      expect(rows).toHaveLength(1);
      expect(rows[0].category).toBe('');
      expect(rows[0].message).toBe('');
    });
  });

  describe('deleteMatchingRejections', () => {
    it('removes only rejections whose originalText matches', async () => {
      await autoReviewRejectionService.addRejection(db, {
        projectId: PROJECT_ID,
        documentId: DOCUMENT_ID,
        elementId: ELEMENT_ID,
        rejection: baseRejection,
        userId: USER_ID,
      });
      await autoReviewRejectionService.addRejection(db, {
        projectId: PROJECT_ID,
        documentId: DOCUMENT_ID,
        elementId: ELEMENT_ID,
        rejection: { ...baseRejection, originalText: 'Keep me.' },
        userId: USER_ID,
      });

      await autoReviewRejectionService.deleteMatchingRejections(
        db,
        PROJECT_ID,
        ELEMENT_ID,
        'This are wrong.'
      );

      const rows = await autoReviewRejectionService.getRejections(db, PROJECT_ID, ELEMENT_ID);
      expect(rows).toHaveLength(1);
      expect(rows[0].originalText).toBe('Keep me.');
    });

    it('is a no-op when no rejection matches', async () => {
      await autoReviewRejectionService.addRejection(db, {
        projectId: PROJECT_ID,
        documentId: DOCUMENT_ID,
        elementId: ELEMENT_ID,
        rejection: baseRejection,
        userId: USER_ID,
      });

      await autoReviewRejectionService.deleteMatchingRejections(
        db,
        PROJECT_ID,
        ELEMENT_ID,
        'Nothing matches.'
      );

      const count = await autoReviewRejectionService.countRejections(db, PROJECT_ID, ELEMENT_ID);
      expect(count).toBe(1);
    });
  });

  describe('countRejections', () => {
    it('counts rows for the element', async () => {
      await autoReviewRejectionService.addRejection(db, {
        projectId: PROJECT_ID,
        documentId: DOCUMENT_ID,
        elementId: ELEMENT_ID,
        rejection: baseRejection,
        userId: USER_ID,
      });
      await autoReviewRejectionService.addRejection(db, {
        projectId: PROJECT_ID,
        documentId: DOCUMENT_ID,
        elementId: ELEMENT_ID,
        rejection: { ...baseRejection, originalText: 'Second.' },
        userId: USER_ID,
      });

      const count = await autoReviewRejectionService.countRejections(db, PROJECT_ID, ELEMENT_ID);
      expect(count).toBe(2);
    });

    it('returns zero for an element with no rejections', async () => {
      const count = await autoReviewRejectionService.countRejections(
        db,
        PROJECT_ID,
        'arrej-user:proj:empty'
      );
      expect(count).toBe(0);
    });
  });

  describe('deleteAllRejections', () => {
    it('removes every rejection for the element (reset)', async () => {
      await autoReviewRejectionService.addRejection(db, {
        projectId: PROJECT_ID,
        documentId: DOCUMENT_ID,
        elementId: ELEMENT_ID,
        rejection: baseRejection,
        userId: USER_ID,
      });
      await autoReviewRejectionService.addRejection(db, {
        projectId: PROJECT_ID,
        documentId: DOCUMENT_ID,
        elementId: ELEMENT_ID,
        rejection: { ...baseRejection, originalText: 'Second.' },
        userId: USER_ID,
      });

      await autoReviewRejectionService.deleteAllRejections(db, PROJECT_ID, ELEMENT_ID);

      const count = await autoReviewRejectionService.countRejections(db, PROJECT_ID, ELEMENT_ID);
      expect(count).toBe(0);
    });
  });
});
