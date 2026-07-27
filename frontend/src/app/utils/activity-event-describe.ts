import type {
  ActivityEventType,
  ProjectActivityEvent,
} from '@models/activity-event';

/**
 * Translate function shape expected by {@link describeActivityEvent}.
 *
 * Mirrors `TranslocoService.translate(key, params)` so this helper stays
 * UI-framework-agnostic and unit-testable without Transloco plumbing.
 */
export type ActivityTranslateFn = (
  key: string,
  params?: Record<string, unknown>
) => string;

/** Key under which each event type's description is stored. */
const KEY_PREFIX = 'project.activity.events';

/**
 * Build a human-readable, localized description for a single activity event.
 *
 * Used by both the project-scoped activity tab and the cross-project home
 * "what's new" widget so the two renderers never drift apart. Each event
 * type has a "named" variant (used when `entityName` is known) and a
 * `*_generic` fallback (used when it isn't). The `who` placeholder is the
 * resolved username, the MCP key display name, or the localized "Someone"
 * fallback (looked up via the bare `someone` translation key).
 *
 * @param event - The activity event to describe.
 * @param t - Transloco-style translate function.
 */
export function describeActivityEvent(
  event: Pick<
    ProjectActivityEvent,
    'username' | 'actorLabel' | 'entityName' | 'eventType'
  >,
  t: ActivityTranslateFn
): string {
  const who = event.username ?? event.actorLabel ?? t('someone');
  const name = event.entityName ?? '';
  const params = { who, name };
  // When the entity has a name we use the "named" key, otherwise the
  // "*_generic" fallback. Events that don't reference a specific entity
  // (collaborator_joined, elements_reorganized) ignore `name` and use a
  // single key.
  const named = (n: string, g: string) =>
    name ? `${KEY_PREFIX}.${n}` : `${KEY_PREFIX}.${g}`;
  const single = (k: string) => `${KEY_PREFIX}.${k}`;

  switch (event.eventType) {
    case 'document_edit':
      return t(named('document_edit', 'document_edit_generic'), params);
    case 'snapshot_created':
      return t(named('snapshot_created', 'snapshot_created_generic'), params);
    case 'comment_thread_created':
      return t(
        named('comment_thread_created', 'comment_thread_created_generic'),
        params
      );
    case 'comment_reply_added':
      return t(
        named('comment_reply_added', 'comment_reply_added_generic'),
        params
      );
    case 'file_published':
      return t(named('file_published', 'file_published_generic'), params);
    case 'collaborator_invited':
      return t(
        named('collaborator_invited', 'collaborator_invited_generic'),
        params
      );
    case 'collaborator_joined':
      return t(single('collaborator_joined'), params);
    case 'collaborator_role_changed':
      return t(
        named('collaborator_role_changed', 'collaborator_role_changed_generic'),
        params
      );
    case 'collaborator_removed':
      return t(
        named('collaborator_removed', 'collaborator_removed_generic'),
        params
      );
    case 'element_created':
      return t(named('element_created', 'element_created_generic'), params);
    case 'element_renamed':
      return t(named('element_renamed', 'element_renamed_generic'), params);
    case 'element_deleted':
      return t(named('element_deleted', 'element_deleted_generic'), params);
    case 'elements_reorganized':
      return t(single('elements_reorganized'), params);
    case 'element_tagged':
      return t(named('element_tagged', 'element_tagged_generic'), params);
    case 'worldbuilding_updated':
      return t(
        named('worldbuilding_updated', 'worldbuilding_updated_generic'),
        params
      );
    case 'relationship_created':
      return t(
        named('relationship_created', 'relationship_created_generic'),
        params
      );
    case 'relationship_deleted':
      return t(
        named('relationship_deleted', 'relationship_deleted_generic'),
        params
      );
    default:
      return t(single('unknown'), params);
  }
}

// Ensure the union stays exhaustive — a new ActivityEventType that isn't
// handled above will fail to compile here.
export type _AssertExhaustiveActivityEvent = ActivityEventType;
