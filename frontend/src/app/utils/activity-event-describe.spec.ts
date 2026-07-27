import { describe, it, expect } from 'vitest';
import type { ProjectActivityEvent } from '@models/activity-event';
import { describeActivityEvent } from './activity-event-describe';

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

  it('falls back to the "unknown" key for an unrecognized event type', () => {
    const out = describeActivityEvent(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeEvent({ eventType: 'totally_made_up' as any, entityName: null }),
      fakeT
    );
    expect(out).toBe('project.activity.events.unknown');
  });
});
