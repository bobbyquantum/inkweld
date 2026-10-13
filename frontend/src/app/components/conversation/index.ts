/**
 * Conversations — speech-bubble documents built from the `speech`,
 * `parenthetical` and `dialogue` nodes in `@inkweld/prosemirror/schema`.
 */
export * from './conversation-commands';
export * from './conversation-mode';
export {
  conversationDecorations,
  type ConversationPluginOptions,
  createConversationPlugin,
  SPEAKER_COLOR_COUNT,
  speakerColor,
} from './conversation-plugin';
export {
  initialsFor,
  type SpeakerClickEvent,
  type SpeechViewHost,
} from './speech-node-view';
