/**
 * @jest-environment jsdom
 */
import {
  type LintResponse,
  LintResponseSource,
} from '@inkweld/model/lint-response';
import { type LintApiService } from '@services/lint/lint-api.service';
import { Schema } from 'prosemirror-model';
import { EditorState, type Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { type MockedObject, vi } from 'vitest';

import { type ExtendedCorrectionDto } from './correction-dto.extension';
import { createLintPlugin, pluginKey, preserveWhitespace } from './lint-plugin';

// Test timeout configuration is handled by vitest.config.ts

// Basic schema for tests
const testSchema = new Schema({
  nodes: {
    doc: {
      content: 'paragraph+',
    },
    paragraph: {
      content: 'text*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() {
        return ['p', 0];
      },
    },
    text: {
      group: 'inline',
    },
  },
  marks: {},
});

describe('LintPlugin', () => {
  let plugin: Plugin;
  let mockLintApiService: MockedObject<LintApiService>;
  let editorView: EditorView;
  let editorState: EditorState;

  // Sample test document with some text
  const createTestDoc = () => {
    return testSchema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'This is a test paragraph with some grammar errors.',
            },
          ],
        },
      ],
    });
  };

  // Mock correction response
  const createMockLintResponse = (): LintResponse => {
    return {
      originalParagraph: 'This is a test paragraph with some grammar errors.',
      corrections: [
        {
          startPos: 10,
          endPos: 14,
          correctedText: 'test sentence',
          originalText: 'test',
          errorType: 'grammar',
          recommendation: 'Grammar improvement',
        },
      ],
      styleRecommendations: [
        {
          // Note: The real DTO might have different fields, adjusting to pass tests
          recommendation: 'Consider using active voice for clarity',
        } as any,
      ],
      source: LintResponseSource.Openai,
    };
  };

  beforeEach(() => {
    // Isolate rejected-suggestion storage between tests so a rejection in one
    // test never filters out suggestions in another.
    localStorage.clear();

    // Create mock for LintApiService
    mockLintApiService = {
      run: vi.fn().mockResolvedValue(createMockLintResponse()),
    } as unknown as MockedObject<LintApiService>;

    // Create the plugin
    plugin = createLintPlugin(mockLintApiService);

    // Set up the editor state with our plugin
    const doc = createTestDoc();
    editorState = EditorState.create({
      doc,
      schema: testSchema,
      plugins: [plugin],
    });

    // Set up real DOM node (required for EditorView)
    document.body.innerHTML = '<div id="editor"></div>';
    const editorElement = document.getElementById('editor');

    // Create a real EditorView with mocked dispatch
    editorView = new EditorView(editorElement, {
      state: editorState,
      dispatchTransaction: vi.fn(),
    });

    // Mock dispatch method for spying
    vi.spyOn(editorView, 'dispatch');
  });

  afterEach(() => {
    // Clean up
    editorView.destroy();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('should create the plugin successfully', () => {
    expect(plugin).toBeTruthy();
    expect(plugin.spec.key).toBe(pluginKey);
  });

  it('should initialize with empty decorations', () => {
    const pluginState = pluginKey.getState(editorState);
    expect(pluginState).toBeTruthy();
    expect(pluginState?.decos.find().length).toBe(0);
    expect(pluginState?.reqId).toBe(0);
  });

  it('should call the lint service when document changes', async () => {
    // Use fake timers to control the debounce timing
    vi.useFakeTimers();

    // Get the view handler from the plugin
    const viewHandler = plugin.spec.view!(editorView);

    if (viewHandler.update) {
      viewHandler.update(editorView, editorState);

      // Force document change to trigger the debounced lint
      const tr = editorState.tr.insertText('New text', 0, 0);
      const newState = editorState.apply(tr);

      // Update the view state
      editorView.updateState(newState);

      // Call update method with the new state
      viewHandler.update(editorView, newState);

      // Advance timers past the 500ms debounce threshold
      await vi.advanceTimersByTimeAsync(600);

      // Verify the lint service was called
      expect(mockLintApiService.run).toHaveBeenCalled();
    } else {
      throw new Error('Plugin view handler update method is not defined');
    }

    // Restore real timers
    vi.useRealTimers();
  });

  it('should ignore stale lint results', () => {
    const correction1: ExtendedCorrectionDto = {
      startPos: 10,
      endPos: 14,
      originalText: 'test',
      correctedText: 'test one',
      errorType: 'grammar',
      recommendation: 'r1',
      from: 11,
      to: 15,
      text: 'test',
    };
    const correction2: ExtendedCorrectionDto = {
      startPos: 20,
      endPos: 24,
      originalText: 'para',
      correctedText: 'paragraph',
      errorType: 'grammar',
      recommendation: 'r2',
      from: 21,
      to: 25,
      text: 'para',
    };

    const applyDecorations = (
      state: EditorState,
      corrections: ExtendedCorrectionDto[],
      reqId: number
    ): EditorState => {
      const next = state.apply(
        state.tr.setMeta(pluginKey, { type: 'decorations', corrections, reqId })
      );
      editorView.updateState(next);
      return next;
    };

    // reqId 1 -> correction1
    let state = applyDecorations(editorState, [correction1], 1);
    let ps = pluginKey.getState(state);
    expect(ps?.reqId).toBe(1);
    expect(ps?.suggestions.length).toBe(1);
    expect(ps?.suggestions[0].correctedText).toBe('test one');
    expect(ps?.decos.find().length).toBe(1);

    // reqId 2 -> correction2 (newer, replaces)
    state = applyDecorations(state, [correction2], 2);
    ps = pluginKey.getState(state);
    expect(ps?.reqId).toBe(2);
    expect(ps?.suggestions.length).toBe(1);
    expect(ps?.suggestions[0].correctedText).toBe('paragraph');

    // reqId 1 (stale) -> ignored, reqId 2 result preserved
    state = applyDecorations(state, [correction1], 1);
    ps = pluginKey.getState(state);
    expect(ps?.reqId).toBe(2);
    expect(ps?.suggestions[0].correctedText).toBe('paragraph');
  });

  it('should remove a suggestion after it is rejected via the lint-reject event', () => {
    const localPlugin = createLintPlugin(mockLintApiService);
    const correction: ExtendedCorrectionDto = {
      startPos: 10,
      endPos: 14,
      originalText: 'test',
      correctedText: 'test sentence',
      errorType: 'grammar',
      recommendation: 'fix',
      from: 11,
      to: 15,
      text: 'test',
    };

    const baseState = EditorState.create({
      doc: createTestDoc(),
      schema: testSchema,
      plugins: [localPlugin],
    });
    const el = document.createElement('div');
    document.body.appendChild(el);
    let state = baseState;
    const localView = new EditorView(el, {
      state: baseState,
      dispatchTransaction: tr => {
        state = state.apply(tr);
        localView.updateState(state);
      },
    });

    // Apply one suggestion
    localView.dispatch(
      baseState.tr.setMeta(pluginKey, {
        type: 'decorations',
        corrections: [correction],
        reqId: 1,
      })
    );
    expect(pluginKey.getState(localView.state)?.suggestions.length).toBe(1);
    expect(pluginKey.getState(localView.state)?.decos.find().length).toBe(1);

    // Rejecting via the event should re-filter and drop the suggestion
    document.dispatchEvent(
      new CustomEvent('lint-reject', { detail: correction })
    );
    expect(pluginKey.getState(localView.state)?.suggestions.length).toBe(0);
    expect(pluginKey.getState(localView.state)?.decos.find().length).toBe(0);

    localView.destroy();
    el.remove();
  });

  it('should apply an accepted correction via the lint-accept event', () => {
    const localPlugin = createLintPlugin(mockLintApiService);
    const baseState = EditorState.create({
      doc: createTestDoc(),
      schema: testSchema,
      plugins: [localPlugin],
    });
    const el = document.createElement('div');
    document.body.appendChild(el);
    const localView = new EditorView(el, {
      state: baseState,
      dispatchTransaction: tr =>
        localView.updateState(localView.state.apply(tr)),
    });
    const dispatchSpy = vi.spyOn(localView, 'dispatch');

    const correction: ExtendedCorrectionDto = {
      startPos: 10,
      endPos: 14,
      originalText: 'test',
      correctedText: 'test sentence',
      errorType: 'grammar',
      recommendation: 'fix',
      from: 11,
      to: 15,
      text: 'test',
    };

    document.dispatchEvent(
      new CustomEvent('lint-accept', { detail: correction })
    );
    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    localView.destroy();
    el.remove();
  });

  it('should remove document event listeners on destroy', () => {
    const localPlugin = createLintPlugin(mockLintApiService);
    const baseState = EditorState.create({
      doc: createTestDoc(),
      schema: testSchema,
      plugins: [localPlugin],
    });
    const el = document.createElement('div');
    document.body.appendChild(el);
    const localView = new EditorView(el, {
      state: baseState,
      dispatchTransaction: tr =>
        localView.updateState(localView.state.apply(tr)),
    });
    const dispatchSpy = vi.spyOn(localView, 'dispatch');

    const correction: ExtendedCorrectionDto = {
      startPos: 10,
      endPos: 14,
      originalText: 'test',
      correctedText: 'test sentence',
      errorType: 'grammar',
      recommendation: 'fix',
      from: 11,
      to: 15,
      text: 'test',
    };

    // EditorView ctor already invoked the plugin's view() -> listeners attached
    document.dispatchEvent(
      new CustomEvent('lint-accept', { detail: correction })
    );
    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    // Destroy the view -> plugin destroy -> listeners removed + view cleared
    localView.destroy();
    el.remove();

    document.dispatchEvent(
      new CustomEvent('lint-accept', { detail: correction })
    );
    expect(dispatchSpy).toHaveBeenCalledTimes(1); // still 1, not 2
  });

  it('should lint each textblock separately and map corrections to doc positions', async () => {
    vi.useFakeTimers();

    const twoParaDoc = testSchema.nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First teh.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second teh.' }] },
      ],
    });

    mockLintApiService.run.mockImplementation((text: string) => {
      const start = text.indexOf('teh');
      return Promise.resolve({
        originalParagraph: text,
        corrections: [
          {
            startPos: start,
            endPos: start + 3,
            originalText: 'teh',
            correctedText: 'the',
            errorType: 'spelling',
            recommendation: 'Spelling fix',
          },
        ],
        styleRecommendations: [],
        source: LintResponseSource.Openai,
      });
    });

    const localState = EditorState.create({
      doc: twoParaDoc,
      schema: testSchema,
      plugins: [plugin],
    });
    const el = document.createElement('div');
    document.body.appendChild(el);
    const localView = new EditorView(el, {
      state: localState,
      dispatchTransaction: tr =>
        localView.updateState(localView.state.apply(tr)),
    });

    // Trigger a lint cycle by reporting a "doc change" from an empty doc.
    const emptyState = EditorState.create({
      doc: testSchema.nodeFromJSON({
        type: 'doc',
        content: [{ type: 'paragraph' }],
      }),
      schema: testSchema,
      plugins: [plugin],
    });
    const viewHandler = plugin.spec.view!(localView);
    if (!viewHandler.update) {
      throw new Error('Plugin view handler update method is not defined');
    }
    viewHandler.update(localView, emptyState);

    await vi.advanceTimersByTimeAsync(600);

    // One API call per paragraph
    expect(mockLintApiService.run).toHaveBeenCalledTimes(2);
    expect(mockLintApiService.run).toHaveBeenNthCalledWith(1, 'First teh.');
    expect(mockLintApiService.run).toHaveBeenNthCalledWith(2, 'Second teh.');

    // "First teh." (10 chars): "teh" at index 6 -> para1 starts at doc pos 1 -> 7..10
    // "Second teh." (11 chars): para2 starts at doc pos 13 (after para1's nodeSize 12),
    //   "teh" at index 7 -> 20..23
    const ps = pluginKey.getState(localView.state);
    expect(ps?.suggestions.length).toBe(2);
    const positions = ps?.suggestions.map(s => `${s.from}-${s.to}`).sort();
    expect(positions).toEqual(['20-23', '7-10']);

    localView.destroy();
    el.remove();
    vi.useRealTimers();
  });

  it('should remap suggestion ranges through document edits', () => {
    const correction: ExtendedCorrectionDto = {
      startPos: 10,
      endPos: 14,
      originalText: 'test',
      correctedText: 'test sentence',
      errorType: 'grammar',
      recommendation: 'fix',
      from: 11,
      to: 15,
      text: 'test',
    };

    // Apply one suggestion at 11..15
    let state = editorState.apply(
      editorState.tr.setMeta(pluginKey, {
        type: 'decorations',
        corrections: [correction],
        reqId: 1,
      })
    );
    editorView.updateState(state);
    let ps = pluginKey.getState(state);
    expect(ps?.suggestions.length).toBe(1);
    expect(ps?.suggestions[0].from).toBe(11);
    expect(ps?.suggestions[0].to).toBe(15);

    // Insert 4 chars at the start of the document -> ranges shift by +4
    state = state.apply(state.tr.insertText('XXXX', 1, 1));
    editorView.updateState(state);

    ps = pluginKey.getState(state);
    expect(ps?.suggestions.length).toBe(1);
    expect(ps?.suggestions[0].from).toBe(15);
    expect(ps?.suggestions[0].to).toBe(19);
  });

  it('should skip corrections whose range spans inline non-text nodes', async () => {
    vi.useFakeTimers();

    // Schema with an inline image atom node
    const imgSchema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: '(text | image)*',
          group: 'block',
          parseDOM: [{ tag: 'p' }],
          toDOM() {
            return ['p', 0];
          },
        },
        text: { group: 'inline' },
        image: {
          inline: true,
          atom: true,
          group: 'inline',
          draggable: true,
          toDOM() {
            return ['img', { src: 'x' }];
          },
          parseDOM: [
            {
              tag: 'img',
              getAttrs: () => ({}),
            },
          ],
        },
      },
      marks: {},
    });

    // "ab" + image + "cd" : textContent is "abcd" (image contributes nothing)
    const doc = imgSchema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'ab' },
            { type: 'image' },
            { type: 'text', text: 'cd' },
          ],
        },
      ],
    });

    // LLM returns a correction spanning the whole "abcd" (0..4), which maps to
    // a range containing the image -> must be skipped.
    mockLintApiService.run.mockResolvedValue({
      originalParagraph: 'abcd',
      corrections: [
        {
          startPos: 0,
          endPos: 4,
          originalText: 'abcd',
          correctedText: 'xyz',
          errorType: 'grammar',
          recommendation: 'rewrite',
        },
      ],
      styleRecommendations: [],
      source: LintResponseSource.Openai,
    });

    const localState = EditorState.create({
      doc,
      schema: imgSchema,
      plugins: [plugin],
    });
    const el = document.createElement('div');
    document.body.appendChild(el);
    const localView = new EditorView(el, {
      state: localState,
      dispatchTransaction: tr =>
        localView.updateState(localView.state.apply(tr)),
    });

    const emptyState = EditorState.create({
      doc: imgSchema.nodeFromJSON({
        type: 'doc',
        content: [{ type: 'paragraph' }],
      }),
      schema: imgSchema,
      plugins: [plugin],
    });
    const viewHandler = plugin.spec.view!(localView);
    if (!viewHandler.update) {
      throw new Error('Plugin view handler update method is not defined');
    }
    viewHandler.update(localView, emptyState);

    await vi.advanceTimersByTimeAsync(600);

    expect(mockLintApiService.run).toHaveBeenCalledTimes(1);
    const ps = pluginKey.getState(localView.state);
    expect(ps?.suggestions.length).toBe(0);
    expect(ps?.decos.find().length).toBe(0);

    localView.destroy();
    el.remove();
    vi.useRealTimers();
  });

  it('should clear stale suggestions when the document has no lintable text', async () => {
    vi.useFakeTimers();

    // First, populate suggestions on a non-empty doc.
    mockLintApiService.run.mockResolvedValue({
      originalParagraph: 'Hello teh.',
      corrections: [
        {
          startPos: 6,
          endPos: 9,
          originalText: 'teh',
          correctedText: 'the',
          errorType: 'spelling',
          recommendation: 'fix',
        },
      ],
      styleRecommendations: [],
      source: LintResponseSource.Openai,
    });

    const populated = testSchema.nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello teh.' }] },
      ],
    });
    const empty = testSchema.nodeFromJSON({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });

    const localState = EditorState.create({
      doc: populated,
      schema: testSchema,
      plugins: [plugin],
    });
    const el = document.createElement('div');
    document.body.appendChild(el);
    const localView = new EditorView(el, {
      state: localState,
      dispatchTransaction: tr =>
        localView.updateState(localView.state.apply(tr)),
    });

    const viewHandler = plugin.spec.view!(localView);
    if (!viewHandler.update) {
      throw new Error('Plugin view handler update method is not defined');
    }
    viewHandler.update(
      localView,
      EditorState.create({
        doc: empty,
        schema: testSchema,
        plugins: [plugin],
      })
    );
    await vi.advanceTimersByTimeAsync(600);
    expect(pluginKey.getState(localView.state)?.suggestions.length).toBe(1);

    // Now move to an empty doc and trigger another lint cycle.
    localView.updateState(
      EditorState.create({
        doc: empty,
        schema: testSchema,
        plugins: [plugin],
      })
    );
    viewHandler.update(
      localView,
      EditorState.create({
        doc: populated,
        schema: testSchema,
        plugins: [plugin],
      })
    );
    await vi.advanceTimersByTimeAsync(600);

    // Empty doc -> no lintable blocks -> decorations cleared.
    expect(mockLintApiService.run).toHaveBeenCalledTimes(1);
    const ps = pluginKey.getState(localView.state);
    expect(ps?.suggestions.length).toBe(0);
    expect(ps?.decos.find().length).toBe(0);

    localView.destroy();
    el.remove();
    vi.useRealTimers();
  });

  describe('preserveWhitespace', () => {
    it('should preserve leading whitespace', () => {
      expect(preserveWhitespace('  hello', 'world')).toBe('  world');
    });

    it('should preserve trailing whitespace', () => {
      expect(preserveWhitespace('hello  ', 'world')).toBe('world  ');
    });

    it('should preserve both leading and trailing whitespace', () => {
      expect(preserveWhitespace('  hello  ', 'world')).toBe('  world  ');
    });

    it('should not add whitespace if suggestion already has it', () => {
      expect(preserveWhitespace('  hello  ', '  world  ')).toBe('  world  ');
    });

    it('should return suggestion unchanged when no whitespace in original', () => {
      expect(preserveWhitespace('hello', 'world')).toBe('world');
    });

    it('should handle empty original text', () => {
      expect(preserveWhitespace('', 'world')).toBe('world');
    });
  });

  it('should clean up on destroy', () => {
    // Get the view handler from the plugin
    const viewHandler = plugin.spec.view!(editorView);

    // Make sure destroy doesn't throw
    expect(() => {
      if (viewHandler.destroy) {
        viewHandler.destroy();
      }
    }).not.toThrow();
  });
});
