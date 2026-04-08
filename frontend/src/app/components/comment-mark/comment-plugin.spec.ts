import { commentMarkSpec } from '@components/comment-mark/comment-mark-schema';
import {
  type CommentPluginCallbacks,
  commentPluginKey,
  createCommentPlugin,
} from '@components/comment-mark/comment-plugin';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';

function createSchemaWithComment() {
  return new Schema({
    nodes: {
      doc: { content: 'text*' },
      text: { inline: true },
    },
    marks: {
      comment: commentMarkSpec,
    },
  });
}

function createViewWithPlugin(
  callbacks: CommentPluginCallbacks = {},
  content = 'Hello world'
) {
  const schema = createSchemaWithComment();
  const plugin = createCommentPlugin(callbacks);

  const doc = schema.text(content)
    ? schema.node('doc', null, [schema.text(content)])
    : schema.node('doc');

  const state = EditorState.create({
    doc,
    plugins: [plugin],
  });

  const container = document.createElement('div');
  document.body.appendChild(container);
  const view = new EditorView(container, { state });
  return { view, schema, container };
}

describe('createCommentPlugin', () => {
  let container: HTMLElement;

  afterEach(() => {
    container?.remove();
  });

  it('should create a plugin with the correct key', () => {
    const plugin = createCommentPlugin();
    expect(plugin.spec.key).toBe(commentPluginKey);
  });

  it('should initialise with activeCommentId as null', () => {
    const result = createViewWithPlugin();
    container = result.container;
    const pluginState = commentPluginKey.getState(result.view.state);
    expect(pluginState?.activeCommentId).toBeNull();
  });

  it('should update activeCommentId via meta', () => {
    const result = createViewWithPlugin();
    container = result.container;
    const { view } = result;

    const tr = view.state.tr.setMeta(commentPluginKey, {
      activeCommentId: 'abc',
    });
    view.dispatch(tr);

    const pluginState = commentPluginKey.getState(view.state);
    expect(pluginState?.activeCommentId).toBe('abc');
  });

  it('should clear activeCommentId via meta', () => {
    const result = createViewWithPlugin();
    container = result.container;
    const { view } = result;

    // Set then clear
    view.dispatch(
      view.state.tr.setMeta(commentPluginKey, { activeCommentId: 'abc' })
    );
    view.dispatch(
      view.state.tr.setMeta(commentPluginKey, { activeCommentId: null })
    );

    const pluginState = commentPluginKey.getState(view.state);
    expect(pluginState?.activeCommentId).toBeNull();
  });

  it('should keep state when no meta is set', () => {
    const result = createViewWithPlugin();
    container = result.container;
    const { view } = result;

    view.dispatch(
      view.state.tr.setMeta(commentPluginKey, { activeCommentId: 'abc' })
    );

    // Dispatch a no-op transaction
    view.dispatch(view.state.tr);

    const pluginState = commentPluginKey.getState(view.state);
    expect(pluginState?.activeCommentId).toBe('abc');
  });

  describe('handleClick', () => {
    it('should detect a click on a comment mark and call onCommentClick', () => {
      const onCommentClick = vi.fn();
      const result = createViewWithPlugin({ onCommentClick }, 'Hello world');
      container = result.container;
      const { view, schema } = result;

      // Apply a comment mark to "Hello" (positions 0-5)
      const commentType = schema.marks['comment'];
      const mark = commentType.create({
        commentId: 'click-test',
        authorName: 'Tester',
      });
      const tr = view.state.tr.addMark(0, 5, mark);
      view.dispatch(tr);

      // Simulate handleClick at position 2 (inside "Hello")
      const plugin = createCommentPlugin({ onCommentClick });
      const handleClick = plugin.spec.props!.handleClick!.bind(plugin);
      const event = new MouseEvent('click', { clientX: 100, clientY: 200 });

      const handled = handleClick(view, 2, event);

      expect(handled).toBe(true);
      expect(onCommentClick).toHaveBeenCalledWith(
        expect.objectContaining({ commentId: 'click-test' }),
        { x: 100, y: 200 }
      );
    });

    it('should deactivate when clicking outside a comment mark', () => {
      const result = createViewWithPlugin({}, 'Hello world');
      container = result.container;
      const { view, schema } = result;

      // Apply a comment mark to "Hello" (positions 0-5)
      const commentType = schema.marks['comment'];
      const mark = commentType.create({ commentId: 'deact-test' });
      view.dispatch(view.state.tr.addMark(0, 5, mark));

      // Activate
      view.dispatch(
        view.state.tr.setMeta(commentPluginKey, {
          activeCommentId: 'deact-test',
        })
      );

      // Click outside at position 8 ("orl")
      const plugin = createCommentPlugin();
      const handleClick = plugin.spec.props!.handleClick!.bind(plugin);
      const event = new MouseEvent('click');
      handleClick(view, 8, event);

      const pluginState = commentPluginKey.getState(view.state);
      expect(pluginState?.activeCommentId).toBeNull();
    });

    it('should return false when clicking outside a comment with no active comment', () => {
      const result = createViewWithPlugin();
      container = result.container;
      const { view } = result;

      const plugin = createCommentPlugin();
      const handleClick = plugin.spec.props!.handleClick!.bind(plugin);
      const event = new MouseEvent('click');

      const handled = handleClick(view, 2, event);
      expect(handled).toBe(false);
    });
  });
});
