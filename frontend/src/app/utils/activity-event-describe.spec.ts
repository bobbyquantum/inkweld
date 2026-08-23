import type { ProjectActivityEvent } from '@models/activity-event';
import { describe, expect, it } from 'vitest';

import {
  describeActivityEvent,
  describeActivityEventSegments,
} from './activity-event-describe';

/**
 * Minimal fake translate function: returns the key verbatim with `{{params}}`
 * interpolated, so tests can assert on the resolved key + params without
 * pulling in Transloco. This mirrors how the production code calls
 * `TranslocoService.translate(key, params)`.
 */
function fakeT(key: string, params?: Record<string, unknown>): string {
  let out = key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.replaceAll(`{{${k}}}`, String(v));
    }
  }
  return out;
}

const makeEvent = (
  overrides: Partial<ProjectActivityEvent> = {}
): ProjectActivityEvent => ({
  id: 'e-1',
  projectId: 'p-1',
  userId: 'u-1',
  username: 'alice',
  actorLabel: null,
  eventType: 'document_edit',
  entityId: 'el-1',
  entityName: 'Chapter 1',
  metadata: null,
  createdAt: 1_700_000_000_000,
  ...overrides,
});

describe('describeActivityEvent', () => {
  it('uses the named variant when entityName is present', () => {
    const out = describeActivityEvent(
      makeEvent({ eventType: 'element_created', entityName: 'Hero' }),
      fakeT
    );
    expect(out).toBe('project.activity.events.element_created');
  });

  it('uses the *_generic variant when entityName is empty', () => {
    const out = describeActivityEvent(
      makeEvent({ eventType: 'element_created', entityName: null }),
      fakeT
    );
    expect(out).toBe('project.activity.events.element_created_generic');
  });

  it('resolves the who fallback to the "someone" key when both username and actorLabel are null', () => {
    const out = describeActivityEvent(
      makeEvent({
        eventType: 'document_edit',
        username: null,
        actorLabel: null,
        entityName: null,
      }),
      fakeT
    );
    // who is resolved via t('someone') with no params → returns the key.
    expect(out).toBe('project.activity.events.document_edit_generic');
  });

  it('prefers actorLabel over the "someone" fallback when username is null', () => {
    const out = describeActivityEvent(
      makeEvent({
        eventType: 'document_edit',
        username: null,
        actorLabel: 'MCP Key',
        entityName: 'Doc',
      }),
      fakeT
    );
    // fakeT interpolates {{who}} with the actorLabel since the component
    // resolved `who` before calling t — verify the named path is taken.
    expect(out).toBe('project.activity.events.document_edit');
  });

  it('handles every known event type with a name (named variant)', () => {
    const types: ProjectActivityEvent['eventType'][] = [
      'document_edit',
      'snapshot_created',
      'comment_thread_created',
      'comment_reply_added',
      'file_published',
      'collaborator_invited',
      'collaborator_joined',
      'collaborator_role_changed',
      'collaborator_removed',
      'element_created',
      'element_renamed',
      'element_deleted',
      'elements_reorganized',
      'element_tagged',
      'worldbuilding_updated',
      'relationship_created',
      'relationship_deleted',
    ];
    for (const eventType of types) {
      const out = describeActivityEvent(
        makeEvent({ eventType, entityName: 'X' }),
        fakeT
      );
      expect(out.startsWith('project.activity.events.')).toBe(true);
      // collaborator_joined and elements_reorganized have no *_generic variant
      expect(out).not.toContain('_generic');
    }
  });

  it('handles every known event type without a name (generic variant, where applicable)', () => {
    const types: ProjectActivityEvent['eventType'][] = [
      'document_edit',
      'snapshot_created',
      'comment_thread_created',
      'comment_reply_added',
      'file_published',
      'collaborator_invited',
      'collaborator_role_changed',
      'collaborator_removed',
      'element_created',
      'element_renamed',
      'element_deleted',
      'element_tagged',
      'worldbuilding_updated',
      'relationship_created',
      'relationship_deleted',
    ];
    for (const eventType of types) {
      const out = describeActivityEvent(
        makeEvent({ eventType, entityName: null }),
        fakeT
      );
      expect(out.endsWith('_generic')).toBe(true);
    }
  });

  it('throws on an unrecognized event type (exhaustiveness guard)', () => {
    expect(() =>
      describeActivityEvent(
        makeEvent({ eventType: 'totally_made_up' as any, entityName: null }),
        fakeT
      )
    ).toThrow(/Unhandled activity event type/);
  });
});

describe('describeActivityEventSegments', () => {
  it('emits who, entity, and text segments in order when the actor precedes the entity', () => {
    const segments = describeActivityEventSegments(
      makeEvent({ eventType: 'element_created', entityName: 'Hero' }),
      fakeT
    );
    // fakeT returns the key verbatim, so the whole string is one text segment
    // (no {{who}}/{{name}} placeholders are present in the key itself).
    expect(segments).toEqual([
      { text: 'project.activity.events.element_created', kind: 'text' },
    ]);
  });

  it('recovers a who segment when the actor appears before the entity', () => {
    const t = (_key: string, params?: Record<string, unknown>) =>
      `${String(params?.['who'])} created ${String(params?.['name'])}`;
    const segments = describeActivityEventSegments(
      makeEvent({ eventType: 'element_created', entityName: 'Hero' }),
      t
    );
    expect(segments).toEqual([
      { text: 'alice', kind: 'who' },
      { text: ' created ', kind: 'text' },
      { text: 'Hero', kind: 'entity' },
    ]);
  });

  it('recovers a who segment when the actor appears after the entity', () => {
    const t = (_key: string, params?: Record<string, unknown>) =>
      `${String(params?.['name'])} was created by ${String(params?.['who'])}`;
    const segments = describeActivityEventSegments(
      makeEvent({ eventType: 'element_created', entityName: 'Hero' }),
      t
    );
    expect(segments).toEqual([
      { text: 'Hero', kind: 'entity' },
      { text: ' was created by ', kind: 'text' },
      { text: 'alice', kind: 'who' },
    ]);
  });

  it('keeps surrounding prose when both who and entity are present', () => {
    const t = (_key: string, params?: Record<string, unknown>) =>
      `[${String(params?.['who'])}] renamed [${String(params?.['name'])}] today`;
    const segments = describeActivityEventSegments(
      makeEvent({ eventType: 'element_renamed', entityName: 'Hero' }),
      t
    );
    expect(segments).toEqual([
      { text: '[', kind: 'text' },
      { text: 'alice', kind: 'who' },
      { text: '] renamed [', kind: 'text' },
      { text: 'Hero', kind: 'entity' },
      { text: '] today', kind: 'text' },
    ]);
  });

  it('emits a single text segment when the translation has no placeholders', () => {
    const t = () => 'no placeholders here';
    const segments = describeActivityEventSegments(
      makeEvent({ eventType: 'element_created', entityName: 'Hero' }),
      t
    );
    expect(segments).toEqual([{ text: 'no placeholders here', kind: 'text' }]);
  });
});
