import { TestBed } from '@angular/core/testing';
import { Editor } from '@bobbyquantum/ngx-editor';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFindPlugin } from '../../components/find-in-document/find-plugin';
import { FindInDocumentService } from './find-in-document.service';
import { LoggerService } from './logger.service';

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

describe('FindInDocumentService', () => {
  let service: FindInDocumentService;
  let mockLogger: Partial<LoggerService>;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        FindInDocumentService,
        { provide: LoggerService, useValue: mockLogger },
      ],
    });

    service = TestBed.inject(FindInDocumentService);
  });

  describe('initial state', () => {
    it('should start closed', () => {
      expect(service.isOpen()).toBe(false);
    });

    it('should have empty query', () => {
      expect(service.query()).toBe('');
    });

    it('should have case sensitivity disabled', () => {
      expect(service.caseSensitive()).toBe(false);
    });

    it('should have zero matches', () => {
      expect(service.matchCount()).toBe(0);
      expect(service.currentMatchNumber()).toBe(0);
    });
  });

  describe('open/close', () => {
    it('should open the find bar', () => {
      // Create a mock editor with view
      const mockView = createMockEditorView();
      const mockEditor = { view: mockView } as unknown as Editor;
      service.setEditor(mockEditor);

      service.open();
      expect(service.isOpen()).toBe(true);
    });

    it('should warn when opening without editor', () => {
      service.open();
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(service.isOpen()).toBe(false);
    });

    it('should close the find bar', () => {
      const mockView = createMockEditorView();
      const mockEditor = { view: mockView } as unknown as Editor;
      service.setEditor(mockEditor);

      service.open();
      service.close();

      expect(service.isOpen()).toBe(false);
      expect(service.query()).toBe('');
    });

    it('should close when editor is set to null', () => {
      const mockView = createMockEditorView();
      const mockEditor = { view: mockView } as unknown as Editor;
      service.setEditor(mockEditor);
      service.open();

      service.setEditor(null);

      expect(service.isOpen()).toBe(false);
    });
  });

  describe('search', () => {
    it('should update query signal', () => {
      const mockView = createMockEditorView();
      const mockEditor = { view: mockView } as unknown as Editor;
      service.setEditor(mockEditor);

      service.search('test');

      expect(service.query()).toBe('test');
    });

    it('should update match count from plugin state', () => {
      const mockView = createMockEditorView('test test test');
      const mockEditor = { view: mockView } as unknown as Editor;
      service.setEditor(mockEditor);

      service.search('test');

      expect(service.matchCount()).toBe(3);
      expect(service.currentMatchNumber()).toBe(1);
    });
  });

  describe('navigation', () => {
    it('should navigate to next match', () => {
      const mockView = createMockEditorView('test test test');
      const mockEditor = { view: mockView } as unknown as Editor;
      service.setEditor(mockEditor);
      service.search('test');

      service.nextMatch();

      expect(service.currentMatchNumber()).toBe(2);
    });

    it('should navigate to previous match', () => {
      const mockView = createMockEditorView('test test test');
      const mockEditor = { view: mockView } as unknown as Editor;
      service.setEditor(mockEditor);
      service.search('test');
      service.nextMatch(); // Go to 2

      service.previousMatch();

      expect(service.currentMatchNumber()).toBe(1);
    });
  });

  describe('case sensitivity', () => {
    it('should toggle case sensitivity', () => {
      const mockView = createMockEditorView('Test TEST test');
      const mockEditor = { view: mockView } as unknown as Editor;
      service.setEditor(mockEditor);
      service.search('test');

      expect(service.matchCount()).toBe(3); // Case insensitive

      service.toggleCaseSensitive();

      expect(service.caseSensitive()).toBe(true);
      expect(service.matchCount()).toBe(1); // Only lowercase 'test'
    });
  });

  describe('getPluginState', () => {
    it('should return undefined when no editor is set', () => {
      expect(service.getPluginState()).toBeUndefined();
    });

    it('should return plugin state when editor is set', () => {
      const mockView = createMockEditorView('test text');
      const mockEditor = { view: mockView } as unknown as Editor;
      service.setEditor(mockEditor);
      service.search('test');

      const state = service.getPluginState();
      expect(state).toBeDefined();
      expect(state?.query).toBe('test');
    });
  });

  describe('replace mode', () => {
    it('should toggle replace mode on', () => {
      expect(service.isReplaceMode()).toBe(false);
      service.toggleReplaceMode();
      expect(service.isReplaceMode()).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'FindInDocumentService',
        'Replace mode enabled'
      );
    });

    it('should toggle replace mode off', () => {
      service.toggleReplaceMode(); // on
      service.toggleReplaceMode(); // off
      expect(service.isReplaceMode()).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'FindInDocumentService',
        'Replace mode disabled'
      );
    });

    it('should set replacement text', () => {
      service.setReplacementText('replacement');
      expect(service.replacementText()).toBe('replacement');
    });

    it('should reset replace mode on close', () => {
      const mockView = createMockEditorView();
      const mockEditor = { view: mockView } as unknown as Editor;
      service.setEditor(mockEditor);

      service.toggleReplaceMode();
      service.setReplacementText('replacement');
      expect(service.isReplaceMode()).toBe(true);
      expect(service.replacementText()).toBe('replacement');

      service.close();
      expect(service.isReplaceMode()).toBe(false);
      expect(service.replacementText()).toBe('');
    });
  });

  describe('replace', () => {
    it('should return false when no editor is set', () => {
      expect(service.replace()).toBe(false);
    });

    it('should return false when no matches exist', () => {
      const mockView = createMockEditorView('hello world');
      const mockEditor = { view: mockView } as unknown as Editor;
      service.setEditor(mockEditor);
      service.search('xyz'); // No matches

      expect(service.replace()).toBe(false);
    });
  });

  describe('replaceAll', () => {
    it('should return 0 when no editor is set', () => {
      expect(service.replaceAll()).toBe(0);
    });

    it('should return 0 when no matches exist', () => {
      const mockView = createMockEditorView('hello world');
      const mockEditor = { view: mockView } as unknown as Editor;
      service.setEditor(mockEditor);
      service.search('xyz'); // No matches

      expect(service.replaceAll()).toBe(0);
    });
  });
});

/**
 * Create a mock EditorView with the find plugin installed
 */
function createMockEditorView(text = ''): EditorView {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const doc = testSchema.nodeFromJSON({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: text
          ? [
              {
                type: 'text',
                text,
              },
            ]
          : [],
      },
    ],
  });

  const plugin = createFindPlugin();
  const editorState = EditorState.create({
    doc,
    schema: testSchema,
    plugins: [plugin],
  });

  return new EditorView(container, {
    state: editorState,
  });
}
