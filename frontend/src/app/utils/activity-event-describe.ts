import type { ProjectActivityEvent } from '@models/activity-event';

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
 * A single piece of an activity description. `text` is the localized string.
 * When `kind` is `'entity'` the piece is the referenced entity's name and may
 * be rendered as an interactive link (see the project activity tab); the other
 * kinds are plain prose.
 */
export interface ActivityDescriptionSegment {
  text: string;
  kind: 'who' | 'entity' | 'text';
}

/** Resolve the "who" display label shared by every description. */
function resolveWho(
  event: Pick<ProjectActivityEvent, 'username' | 'actorLabel'>,
  t: ActivityTranslateFn
): string {
  return event.username ?? event.actorLabel ?? t('someone');
}

/**
 * Determine which translation key describes `event`. Each event type has a
 * "named" variant (used when `entityName` is known) and a `*_generic`
 * fallback (used when it isn't). Events that don't reference a specific
 * entity (collaborator_joined, elements_reorganized) use a single key.
 */
function resolveKey(
  event: Pick<ProjectActivityEvent, 'eventType' | 'entityName'>
): string {
  const name = event.entityName ?? '';
  const named = (n: string, g: string) =>
    name ? `${KEY_PREFIX}.${n}` : `${KEY_PREFIX}.${g}`;
  const single = (k: string) => `${KEY_PREFIX}.${k}`;

  switch (event.eventType) {
    case 'document_edit':
      return named('document_edit', 'document_edit_generic');
    case 'snapshot_created':
      return named('snapshot_created', 'snapshot_created_generic');
    case 'comment_thread_created':
      return named('comment_thread_created', 'comment_thread_created_generic');
    case 'comment_reply_added':
      return named('comment_reply_added', 'comment_reply_added_generic');
    case 'file_published':
      return named('file_published', 'file_published_generic');
    case 'collaborator_invited':
      return named('collaborator_invited', 'collaborator_invited_generic');
    case 'collaborator_joined':
      return single('collaborator_joined');
    case 'collaborator_role_changed':
      return named(
        'collaborator_role_changed',
        'collaborator_role_changed_generic'
      );
    case 'collaborator_removed':
      return named('collaborator_removed', 'collaborator_removed_generic');
    case 'element_created':
      return named('element_created', 'element_created_generic');
    case 'element_renamed':
      return named('element_renamed', 'element_renamed_generic');
    case 'element_deleted':
      return named('element_deleted', 'element_deleted_generic');
    case 'elements_reorganized':
      return single('elements_reorganized');
    case 'element_tagged':
      return named('element_tagged', 'element_tagged_generic');
    case 'worldbuilding_updated':
      return named('worldbuilding_updated', 'worldbuilding_updated_generic');
    case 'relationship_created':
      return named('relationship_created', 'relationship_created_generic');
    case 'relationship_deleted':
      return named('relationship_deleted', 'relationship_deleted_generic');
    default: {
      // Compile-time exhaustiveness guard: the `never` assignment fails to
      // type-check if a new ActivityEventType is added without a
      // corresponding case above. We throw at runtime so an unexpected
      // event type (e.g. a newer backend talking to an older frontend)
      // surfaces loudly instead of silently rendering the "unknown" key.
      const _exhaustive: never = event.eventType;
      throw new Error(`Unhandled activity event type: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Build a human-readable, localized description for a single activity event as
 * a list of segments. A renderer can turn the `'entity'` segment into an
 * interactive element link without parsing free-form prose.
 *
 * Used by both the project-scoped activity tab and the cross-project home
 * "what's new" widget so the two renderers never drift apart. The `who`
 * placeholder is the resolved username, the MCP key display name, or the
 * localized "Someone" fallback (looked up via the bare `someone` key).
 *
 * @param event - The activity event to describe.
 * @param t - Transloco-style translate function.
 */
export function describeActivityEventSegments(
  event: Pick<
    ProjectActivityEvent,
    'username' | 'actorLabel' | 'entityName' | 'eventType'
  >,
  t: ActivityTranslateFn
): ActivityDescriptionSegment[] {
  const who = resolveWho(event, t);
  const entityName = event.entityName ?? '';
  const key = resolveKey(event);

  // Swap both the resolved actor label and the entity name for distinct
  // sentinels before translating, so we can deterministically recover the
  // structured who/entity/text contract from the localized string regardless
  // of where each placeholder appears in the translation.
  const template = t(key, { who: WHO_MARKER, name: ENTITY_MARKER });

  const segments: ActivityDescriptionSegment[] = [];
  let cursor = 0;
  let nextWho = template.indexOf(WHO_MARKER, cursor);
  let nextEntity = template.indexOf(ENTITY_MARKER, cursor);

  while (nextWho !== -1 || nextEntity !== -1) {
    const takeWho =
      nextEntity === -1 || (nextWho !== -1 && nextWho < nextEntity);
    const marker = takeWho ? WHO_MARKER : ENTITY_MARKER;
    const at = takeWho ? nextWho : nextEntity;

    if (at > cursor) {
      segments.push({ text: template.slice(cursor, at), kind: 'text' });
    }
    segments.push({
      text: takeWho ? who : entityName,
      kind: takeWho ? 'who' : 'entity',
    });

    cursor = at + marker.length;
    nextWho = template.indexOf(WHO_MARKER, cursor);
    nextEntity = template.indexOf(ENTITY_MARKER, cursor);
  }

  if (cursor < template.length) {
    segments.push({ text: template.slice(cursor), kind: 'text' });
  }

  return segments;
}

/** Unique sentinel unlikely to collide with real translations. */
const ENTITY_MARKER = '\u0000ENTITY\u0000';

/** Unique sentinel for the resolved actor label, distinct from the entity. */
const WHO_MARKER = '\u0000WHO\u0000';

/**
 * Build a human-readable, localized description for a single activity event as
 * a plain string (the joined segments). Kept in sync with
 * {@link describeActivityEventSegments} so callers can switch between a flat
 * string and the segmented form without changing keys or translations.
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
  return describeActivityEventSegments(event, t)
    .map(s => s.text)
    .join('');
}
