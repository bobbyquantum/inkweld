/**
 * Integration tests for lint-review routes.
 *
 * Uses the startTestServer pattern like document.routes.test.ts. Mocks the
 * OpenAILintService and YjsService to avoid LLM calls and LevelDB.
 */

import { describe, it, expect, beforeAll, afterAll, spyOn } from 'bun:test';
import * as Y from 'yjs';
import { getDatabase } from '../src/db/index';
import { users, projects } from '../src/db/schema/index';
import { config } from '../src/db/schema/config';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import {
  startTestServer,
  stopTestServer,
  TestClient,
  enablePasswordLoginForTests,
} from './server-test-helper';
import { TEST_PASSWORDS } from './test-credentials';
import { openAILintService } from '../src/services/openai-lint.service';
import { yjsService } from '../src/services/yjs.service';

describe('Lint Review Routes', () => {
  let ownerClient: TestClient;
  let ownerUsername: string;
  let projectSlug: string;
  let baseUrl: string;
  let isAiEnabledSpy: ReturnType<typeof spyOn>;
  let getDocumentSpy: ReturnType<typeof spyOn>;
  let processDocSpy: ReturnType<typeof spyOn>;

  beforeAll(async () => {
    const server = await startTestServer();
    await enablePasswordLoginForTests();
    baseUrl = server.baseUrl;
    ownerClient = new TestClient(baseUrl);

    const db = getDatabase();

    // Clean up any existing test users
    await db.delete(users).where(eq(users.username, 'lreview-user'));
    await db.delete(projects).where(eq(projects.slug, 'lreview-test-project'));

    const hashedPassword = await bcrypt.hash(TEST_PASSWORDS.DEFAULT, 10);
    const [testUser] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: 'lreview-user',
        email: 'lreview@example.com',
        password: hashedPassword,
        approved: true,
        enabled: true,
      })
      .returning();

    ownerUsername = testUser.username ?? 'lreview-user';

    // Set a fake AI_OPENAI_API_KEY in the config table so isAiEnabled returns true
    await db
      .insert(config)
      .values({
        key: 'AI_OPENAI_API_KEY',
        value: 'test-key',
      })
      .onConflictDoUpdate({
        target: config.key,
        set: { value: 'test-key' },
      });

    // Login
    const loggedIn = await ownerClient.login('lreview-user', TEST_PASSWORDS.DEFAULT);
    expect(loggedIn).toBe(true);

    // Create a test project
    const { json } = await ownerClient.request('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'lreview-test-project',
        title: 'Lint Review Test Project',
      }),
    });
    projectSlug = json.slug ?? 'lreview-test-project';

    // Mock OpenAILintService to avoid real LLM calls
    isAiEnabledSpy = spyOn(openAILintService, 'isAiEnabled').mockResolvedValue(true);
    processDocSpy = spyOn(openAILintService, 'processDocument').mockResolvedValue({
      corrections: [],
      style_recommendations: [],
      source: 'openai',
    } as never);

    // Mock yjsService.getDocument to return an in-memory Y.Doc
    getDocumentSpy = spyOn(yjsService, 'getDocument').mockImplementation(
      async (documentId: string) => {
        const ydoc = new Y.Doc();
        const fragment = ydoc.getXmlFragment('prosemirror');
        const para = new Y.XmlElement('paragraph');
        const ytext = new Y.XmlText();
        ytext.insert(0, 'This is a test.');
        para.insert(0, [ytext]);
        fragment.insert(0, [para]);
        return {
          name: documentId,
          doc: ydoc,
          awareness: {} as never,
          conns: new Map(),
          wsUserIds: new Map(),
        } as never;
      }
    );
  });

  afterAll(async () => {
    isAiEnabledSpy?.mockRestore();
    getDocumentSpy?.mockRestore();
    processDocSpy?.mockRestore();

    const db = getDatabase();
    await db.delete(projects).where(eq(projects.slug, projectSlug));
    await db.delete(users).where(eq(users.username, 'lreview-user'));
    await db.delete(config).where(eq(config.key, 'AI_OPENAI_API_KEY'));

    await stopTestServer();
  });

  it('should return 404 for non-existent project on review', async () => {
    const { response } = await ownerClient.request(
      '/api/v1/projects/nonexistent/no-such-project/docs/doc-1/auto-review/review',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style: 'general', level: 'medium' }),
      }
    );
    expect(response.status).toBe(404);
  });

  it('should run a lint review and return suggestions', async () => {
    processDocSpy.mockResolvedValueOnce({
      corrections: [
        {
          paragraph_index: 0,
          start_pos: 0,
          end_pos: 4,
          original_text: 'This',
          corrected_text: 'These',
          error_type: 'grammar',
          recommendation: 'Subject-verb agreement',
        },
      ],
      style_recommendations: [],
      source: 'openai',
    } as never);

    const { response, json } = await ownerClient.request(
      `/api/v1/projects/${ownerUsername}/${projectSlug}/docs/doc-1/auto-review/review`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style: 'general', level: 'medium' }),
      }
    );
    expect(response.status).toBe(200);
    const body = (await json()) as { suggestions: unknown[]; clearedMarks: number };
    expect(body.suggestions).toBeInstanceOf(Array);
    expect(body.clearedMarks).toBeDefined();
  });

  it('should clear all lint marks', async () => {
    const { response, json } = await ownerClient.request(
      `/api/v1/projects/${ownerUsername}/${projectSlug}/docs/doc-1/auto-review/clear`,
      {
        method: 'POST',
      }
    );
    expect(response.status).toBe(200);
    const body = (await json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('should accept a suggestion', async () => {
    const { response } = await ownerClient.request(
      `/api/v1/projects/${ownerUsername}/${projectSlug}/docs/doc-1/auto-review/accept`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestionId: 'nonexistent',
          replacement: 'test',
        }),
      }
    );
    // Should return 404 since the suggestion doesn't exist
    expect(response.status).toBe(404);
  });

  it('should reject a suggestion', async () => {
    const { response } = await ownerClient.request(
      `/api/v1/projects/${ownerUsername}/${projectSlug}/docs/doc-1/auto-review/reject`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId: 'nonexistent' }),
      }
    );
    expect(response.status).toBe(404);
  });

  it('should require authentication', async () => {
    const anonClient = new TestClient(baseUrl);
    const { response } = await anonClient.request(
      `/api/v1/projects/${ownerUsername}/${projectSlug}/docs/doc-1/auto-review/review`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style: 'general', level: 'medium' }),
      }
    );
    expect(response.status).toBe(401);
  });
});
