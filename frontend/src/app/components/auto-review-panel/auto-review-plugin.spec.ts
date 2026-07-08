import {
  type AutoReviewPluginCallbacks,
  autoReviewPluginKey,
  createAutoReviewPlugin,
} from '@components/auto-review-panel/auto-review-plugin';
import { autoReviewMarkSpec } from '@inkweld/prosemirror/schema';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';

function createSchemaWithAutoReview() {
  return new Schema({
    nodes: {
      doc: { content: 'text*' },
      text: { inline: true },
    },
    marks: {
      auto_review: autoReviewMarkSpec,
    },
  });
}

function createViewWithPlugin(
  callbacks: AutoReviewPluginCallbacks = {},
  content = 'This are a test.'
) {
  const schema = createSchemaWithAutoReview();
  const plugin = createAutoReviewPlugin(callbacks);

  const doc = schema.node('doc', null, [schema.text(content)]);

  const state = EditorState.create({
    doc,
    plugins: [plugin],
  });

  const container = document.createElement('div');
  document.body.appendChild(container);
  const view = new EditorView(container, { state });
  return { view, schema, container };
}

describe('createAutoReviewPlugin', () => {
  let container: HTMLElement;

  afterEach(() => {
    container?.remove();
  });

  it('should create a plugin with the correct key', () => {
    const plugin = createAutoReviewPlugin();
    expect(plugin.spec.key).toBe(autoReviewPluginKey);
  });

  it('should initialise with activeSuggestionId as null', () => {
    const result = createViewWithPlugin();
    container = result.container;
    const pluginState = autoReviewPluginKey.getState(result.view.state);
    expect(pluginState?.activeSuggestionId).toBeNull();
  });

  it('should update activeSuggestionId via meta', () => {
    const result = createViewWithPlugin();
    container = result.container;
    const { view } = result;

    view.dispatch(
      view.state.tr.setMeta(autoReviewPluginKey, {
        activeSuggestionId: 'sug-1',
      })
    );

    const pluginState = autoReviewPluginKey.getState(view.state);
    expect(pluginState?.activeSuggestionId).toBe('sug-1');
  });

  it('should clear activeSuggestionId via meta', () => {
    const result = createViewWithPlugin();
    container = result.container;
    const { view } = result;

    view.dispatch(
      view.state.tr.setMeta(autoReviewPluginKey, {
        activeSuggestionId: 'sug-1',
      })
    );
    view.dispatch(
      view.state.tr.setMeta(autoReviewPluginKey, {
        activeSuggestionId: null,
      })
    );

    const pluginState = autoReviewPluginKey.getState(view.state);
    expect(pluginState?.activeSuggestionId).toBeNull();
  });

  it('should keep state when a transaction has no plugin meta', () => {
    const result = createViewWithPlugin();
    container = result.container;
    const { view } = result;

    view.dispatch(
      view.state.tr.setMeta(autoReviewPluginKey, {
        activeSuggestionId: 'sug-1',
      })
    );

    // No-op transaction (no meta)
    view.dispatch(view.state.tr);

    const pluginState = autoReviewPluginKey.getState(view.state);
    expect(pluginState?.activeSuggestionId).toBe('sug-1');
  });

  describe('handleClick', () => {
    it('should detect a click on an auto-review mark and call onSuggestionClick', () => {
      const onSuggestionClick = vi.fn();
      const result = createViewWithPlugin(
        { onSuggestionClick },
        'This are a test.'
      );
      container = result.container;
      const { view, schema } = result;

      const markType = schema.marks['auto_review'];
      const mark = markType.create({
        id: 'click-test',
        message: 'Subject-verb disagreement',
        suggestion: 'This is',
        category: 'grammar',
        severity: 'error',
      });
      view.dispatch(view.state.tr.addMark(0, 4, mark));

      const plugin = createAutoReviewPlugin({ onSuggestionClick });
      const handleClick = plugin.spec.props!.handleClick!.bind(plugin);
      const event = new MouseEvent('click', { clientX: 100, clientY: 200 });

      const handled = handleClick(view, 2, event);

      expect(handled).toBe(true);
      expect(onSuggestionClick).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'click-test',
          suggestion: 'This is',
          category: 'grammar',
        }),
        { x: 100, y: 200 }
      );

      // The plugin should also have activated the suggestion id in its state.
      const pluginState = autoReviewPluginKey.getState(view.state);
      expect(pluginState?.activeSuggestionId).toBe('click-test');
    });

    it('should return false (and not call back) when the mark has no id', () => {
      const onSuggestionClick = vi.fn();
      const result = createViewWithPlugin(
        { onSuggestionClick },
        'This are a test.'
      );
      container = result.container;
      const { view, schema } = result;

      const markType = schema.marks['auto_review'];
      // Mark with empty id (the default) — should be ignored.
      const mark = markType.create({ id: '' });
      view.dispatch(view.state.tr.addMark(0, 4, mark));

      const plugin = createAutoReviewPlugin({ onSuggestionClick });
      const handleClick = plugin.spec.props!.handleClick!.bind(plugin);
      const event = new MouseEvent('click');

      const handled = handleClick(view, 2, event);

      expect(handled).toBe(false);
      expect(onSuggestionClick).not.toHaveBeenCalled();
    });

    it('should deactivate when clicking outside an auto-review mark', () => {
      const result = createViewWithPlugin({}, 'This are a test.');
      container = result.container;
      const { view, schema } = result;

      const markType = schema.marks['auto_review'];
      const mark = markType.create({ id: 'deact-test' });
      view.dispatch(view.state.tr.addMark(0, 4, mark));

      // Activate manually
      view.dispatch(
        view.state.tr.setMeta(autoReviewPluginKey, {
          activeSuggestionId: 'deact-test',
        })
      );

      // Click outside the marked range (position 8, "a test")
      const plugin = createAutoReviewPlugin();
      const handleClick = plugin.spec.props!.handleClick!.bind(plugin);
      const event = new MouseEvent('click');
      handleClick(view, 8, event);

      const pluginState = autoReviewPluginKey.getState(view.state);
      expect(pluginState?.activeSuggestionId).toBeNull();
    });

    it('should return false when clicking outside a mark with no active suggestion', () => {
      const result = createViewWithPlugin({}, 'This are a test.');
      container = result.container;
      const { view } = result;

      const plugin = createAutoReviewPlugin();
      const handleClick = plugin.spec.props!.handleClick!.bind(plugin);
      const event = new MouseEvent('click');

      const handled = handleClick(view, 2, event);
      expect(handled).toBe(false);
    });

    it('should handle a schema without the auto_review mark gracefully', () => {
      // A schema that has no auto_review mark registered.
      const schema = new Schema({
        nodes: {
          doc: { content: 'text*' },
          text: { inline: true },
        },
        marks: {},
      });
      const plugin = createAutoReviewPlugin();
      const state = EditorState.create({
        doc: schema.node('doc', null, [schema.text('hello')]),
        plugins: [plugin],
      });
      const host = document.createElement('div');
      document.body.appendChild(host);
      container = host;
      const view = new EditorView(host, { state });

      const handleClick = plugin.spec.props!.handleClick!.bind(plugin);
      const event = new MouseEvent('click');

      const handled = handleClick(view, 1, event);
      expect(handled).toBe(false);
    });
  });
});
