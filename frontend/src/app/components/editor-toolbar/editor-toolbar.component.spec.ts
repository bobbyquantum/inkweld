import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { EditorToolbarComponent } from './editor-toolbar.component';

// Mock ngx-editor
vi.mock('ngx-editor', () => {
  return {
    Editor: vi.fn().mockImplementation(() => ({
      view: null,
      update: new Subject(),
      destroy: vi.fn(),
    })),
    NgxEditorModule: class {},
  };
});

// Mock prosemirror-commands
vi.mock('prosemirror-commands', () => ({
  toggleMark:
    () =>
    (_state: unknown, dispatch?: (tr: unknown) => void): boolean => {
      if (dispatch) dispatch({});
      return true;
    },
}));

// Mock prosemirror-history
vi.mock('prosemirror-history', () => ({
  undo: (_state: unknown, dispatch?: (tr: unknown) => void): boolean => {
    if (dispatch) dispatch({});
    return true;
  },
  redo: (_state: unknown, dispatch?: (tr: unknown) => void): boolean => {
    if (dispatch) dispatch({});
    return true;
  },
}));

// Mock prosemirror-schema-list
vi.mock('prosemirror-schema-list', () => ({
  wrapInList:
    () =>
    (_state: unknown, dispatch?: (tr: unknown) => void): boolean => {
      if (dispatch) dispatch({});
      return true;
    },
}));

describe('EditorToolbarComponent', () => {
  let component: EditorToolbarComponent;
  let fixture: ComponentFixture<EditorToolbarComponent>;
  let mockEditorView: {
    state: {
      schema: {
        marks: Record<string, unknown>;
        nodes: Record<string, unknown>;
      };
      selection: {
        from: number;
        to: number;
        $from: unknown;
        $to: unknown;
        empty: boolean;
      };
      tr: {
        setBlockType: Mock;
        setNodeMarkup: Mock;
        lift: Mock;
        wrap: Mock;
        replaceSelectionWith: Mock;
        addMark: Mock;
        removeMark: Mock;
        setStoredMarks: Mock;
        docChanged: boolean;
      };
      doc: { nodesBetween: Mock };
      storedMarks: null;
    };
    dispatch: Mock;
    focus: Mock;
  };
  let updateSubject: Subject<void>;

  beforeEach(async () => {
    updateSubject = new Subject<void>();

    // Create mock marks and nodes with proper structure
    const createMockMark = (name: string) => ({
      name,
      isInSet: vi.fn().mockReturnValue(false),
      create: vi.fn().mockReturnValue({ type: { name } }),
    });

    const createMockNode = (name: string) => ({
      name,
      create: vi.fn().mockReturnValue({ type: { name } }),
      spec: { attrs: {} },
    });

    mockEditorView = {
      state: {
        schema: {
          marks: {
            strong: createMockMark('strong'),
            em: createMockMark('em'),
            u: createMockMark('u'),
            s: createMockMark('s'),
            code: createMockMark('code'),
            link: createMockMark('link'),
          },
          nodes: {
            heading: createMockNode('heading'),
            paragraph: createMockNode('paragraph'),
            bullet_list: createMockNode('bullet_list'),
            ordered_list: createMockNode('ordered_list'),
            list_item: createMockNode('list_item'),
            blockquote: createMockNode('blockquote'),
            horizontal_rule: createMockNode('horizontal_rule'),
          },
        },
        selection: {
          from: 0,
          to: 0,
          $from: {
            pos: 0,
            depth: 0,
            marks: () => [],
            node: () => ({ type: { name: 'paragraph' } }),
            blockRange: vi.fn().mockReturnValue({ depth: 0 }),
          },
          $to: {},
          empty: true,
        },
        tr: {
          setBlockType: vi.fn().mockReturnThis(),
          setNodeMarkup: vi.fn().mockReturnThis(),
          lift: vi.fn().mockReturnThis(),
          wrap: vi.fn().mockReturnThis(),
          replaceSelectionWith: vi.fn().mockReturnThis(),
          addMark: vi.fn().mockReturnThis(),
          removeMark: vi.fn().mockReturnThis(),
          setStoredMarks: vi.fn().mockReturnThis(),
          docChanged: false,
        },
        doc: {
          nodesBetween: vi.fn(),
        },
        storedMarks: null,
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [EditorToolbarComponent, NoopAnimationsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(EditorToolbarComponent);
    component = fixture.componentInstance;

    // Set up mock editor
    component.editor = {
      view: mockEditorView,
      update: updateSubject.asObservable(),
      destroy: vi.fn(),
    } as unknown as typeof component.editor;

    fixture.detectChanges();
  });

  afterEach(() => {
    updateSubject.complete();
    vi.useRealTimers();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Text Formatting', () => {
    it('should toggle bold', () => {
      vi.useFakeTimers();
      component.toggleBold();
      vi.runAllTimers();
      expect(mockEditorView.focus).toHaveBeenCalled();
    });

    it('should toggle italic', () => {
      vi.useFakeTimers();
      component.toggleItalic();
      vi.runAllTimers();
      expect(mockEditorView.focus).toHaveBeenCalled();
    });

    it('should toggle underline', () => {
      vi.useFakeTimers();
      component.toggleUnderline();
      vi.runAllTimers();
      expect(mockEditorView.focus).toHaveBeenCalled();
    });

    it('should toggle strikethrough', () => {
      vi.useFakeTimers();
      component.toggleStrike();
      vi.runAllTimers();
      expect(mockEditorView.focus).toHaveBeenCalled();
    });

    it('should toggle code', () => {
      vi.useFakeTimers();
      component.toggleCode();
      vi.runAllTimers();
      expect(mockEditorView.focus).toHaveBeenCalled();
    });
  });

  describe('Headings', () => {
    it('should set heading level 1', () => {
      vi.useFakeTimers();
      component.setHeading(1);
      vi.runAllTimers();
      expect(mockEditorView.state.tr.setBlockType).toHaveBeenCalled();
      expect(mockEditorView.dispatch).toHaveBeenCalled();
      expect(mockEditorView.focus).toHaveBeenCalled();
    });

    it('should set heading level 2', () => {
      component.setHeading(2);
      expect(mockEditorView.state.tr.setBlockType).toHaveBeenCalled();
      expect(mockEditorView.dispatch).toHaveBeenCalled();
    });

    it('should convert to paragraph when level is 0', () => {
      component.setHeading(0);
      expect(mockEditorView.state.tr.setBlockType).toHaveBeenCalled();
      expect(mockEditorView.dispatch).toHaveBeenCalled();
    });

    it('should return correct heading label', () => {
      // Default is 0 (paragraph)
      expect(component.getHeadingLabel()).toBe('P');
    });
  });

  describe('Lists', () => {
    it('should toggle bullet list', () => {
      vi.useFakeTimers();
      component.toggleBulletList();
      vi.runAllTimers();
      expect(mockEditorView.focus).toHaveBeenCalled();
    });

    it('should toggle ordered list', () => {
      vi.useFakeTimers();
      component.toggleOrderedList();
      vi.runAllTimers();
      expect(mockEditorView.focus).toHaveBeenCalled();
    });

    it('should toggle blockquote', () => {
      vi.useFakeTimers();
      component.toggleBlockquote();
      vi.runAllTimers();
      expect(mockEditorView.focus).toHaveBeenCalled();
    });
  });

  describe('Insert Operations', () => {
    it('should insert horizontal rule', () => {
      vi.useFakeTimers();
      component.insertHorizontalRule();
      vi.runAllTimers();
      expect(mockEditorView.state.tr.replaceSelectionWith).toHaveBeenCalled();
      expect(mockEditorView.dispatch).toHaveBeenCalled();
      expect(mockEditorView.focus).toHaveBeenCalled();
    });

    it('should clear formatting', () => {
      vi.useFakeTimers();
      component.clearFormatting();
      vi.runAllTimers();
      expect(mockEditorView.dispatch).toHaveBeenCalled();
      expect(mockEditorView.focus).toHaveBeenCalled();
    });
  });

  describe('History', () => {
    it('should undo', () => {
      vi.useFakeTimers();
      component.undo();
      vi.runAllTimers();
      expect(mockEditorView.focus).toHaveBeenCalled();
    });

    it('should redo', () => {
      vi.useFakeTimers();
      component.redo();
      vi.runAllTimers();
      expect(mockEditorView.focus).toHaveBeenCalled();
    });
  });

  describe('Meta Panel', () => {
    it('should emit metaPanelToggle when toggle is clicked', () => {
      const emitSpy = vi.spyOn(component.metaPanelToggle, 'emit');
      component.onMetaPanelToggle();
      expect(emitSpy).toHaveBeenCalled();
    });
  });

  describe('Computed Properties', () => {
    it('should have correct default state', () => {
      expect(component.isBold()).toBe(false);
      expect(component.isItalic()).toBe(false);
      expect(component.isUnderline()).toBe(false);
      expect(component.isStrike()).toBe(false);
      expect(component.isCode()).toBe(false);
      expect(component.isLink()).toBe(false);
      expect(component.headingLevel()).toBe(0);
      expect(component.textAlign()).toBe('left');
      expect(component.isBulletList()).toBe(false);
      expect(component.isOrderedList()).toBe(false);
      expect(component.isBlockquote()).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing editor view gracefully', () => {
      component.editor = { view: null } as unknown as typeof component.editor;

      // These should not throw
      expect(() => component.toggleBold()).not.toThrow();
      expect(() => component.setHeading(1)).not.toThrow();
      expect(() => component.insertHorizontalRule()).not.toThrow();
      expect(() => component.undo()).not.toThrow();
    });

    it('should handle missing mark types gracefully', () => {
      mockEditorView.state.schema.marks = {};
      component.editor = {
        view: mockEditorView,
        update: updateSubject.asObservable(),
      } as unknown as typeof component.editor;

      // Should not throw even with missing marks
      expect(() => component.toggleBold()).not.toThrow();
    });
  });
});
