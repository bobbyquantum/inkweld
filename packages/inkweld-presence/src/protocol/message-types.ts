/**
 * Presence message-type tags used INSIDE the presence frame.
 *
 * Wire layout reminder:
 *
 *   [varUint: 100 (Y_MESSAGE_PRESENCE outer tag)]
 *   [varUint: PresenceMessageType (one of these)]
 *   [... message-specific body ...]
 *
 * The outer tag (100) is the responsibility of the multiplexer at the
 * Yjs WebSocket layer. The values below are the inner tag.
 */
export const PRESENCE_MSG_HELLO = 0;
export const PRESENCE_MSG_UPDATE = 1;
export const PRESENCE_MSG_LEAVE = 2;
export const PRESENCE_MSG_SNAPSHOT = 3;

/**
 * Outer Yjs WebSocket message-type tag claimed by the presence multiplexer.
 *
 * Yjs reserves 0 (sync) and 1 (awareness). Picking 100 leaves a comfortable
 * gap for any future Yjs protocol extensions and matches the existing pattern
 * in `backend/src/durable-objects/yjs-project.do.ts` where 0/1 are constants.
 */
export const Y_MESSAGE_PRESENCE = 100;

export type PresenceMessageType =
  | typeof PRESENCE_MSG_HELLO
  | typeof PRESENCE_MSG_UPDATE
  | typeof PRESENCE_MSG_LEAVE
  | typeof PRESENCE_MSG_SNAPSHOT;
