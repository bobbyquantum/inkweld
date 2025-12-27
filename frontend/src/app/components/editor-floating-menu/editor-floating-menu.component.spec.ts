import {
  NO_ERRORS_SCHEMA,
  provideZonelessChangeDetection,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { EditorFloatingMenuComponent } from './editor-floating-menu.component';

// Mock ngx-editor
vi.mock('ngx-editor', () => {
  return {
    Editor: vi.fn().mockImplementation(() => ({
      view: null,
      update: new Subject(),
      destroy: vi.fn(),
    })),
  };
});

// prosemirror-commands is mocked globally in setup-vitest.ts

describe('EditorFloatingMenuComponent', () => {
  let component: EditorFloatingMenuComponent;
  let fixture: ComponentFixture<EditorFloatingMenuComponent>;
  let mockEditorView: {
    state: {
      schema: { marks: Record<string, unknown> };
      selection: { from: number; to: number; $from: unknown; empty: boolean };
      tr: { addMark: Mock; removeMark: Mock };
      doc: { rangeHasMark: Mock };
      storedMarks: null;
    };
    dispatch: Mock;
    focus: Mock;
    coordsAtPos: Mock;
    hasFocus: Mock;
  };
  let updateSubject: Subject<void>;

  beforeEach(async () => {
    updateSubject = new Subject<void>();

    const createMockMark = (name: string) => ({
      name,
      isInSet: vi.fn().mockReturnValue(false),
      create: vi.fn().mockReturnValue({ type: { name } }),
    });

    mockEditorView = {
      state: {
        schema: {
          marks: {
            strong: createMockMark('strong'),
            em: createMockMark('em'),
            u: createMockMark('u'),
            s: createMockMark('s'),
            link: createMockMark('link'),
          },
        },
        selection: {
          from: 0,
          to: 5,
          $from: { marks: () => [] },
          empty: false,
        },
        tr: {
          addMark: vi.fn().mockReturnThis(),
          removeMark: vi.fn().mockReturnThis(),
        },
        doc: {
          rangeHasMark: vi.fn().mockReturnValue(false),
        },
        storedMarks: null,
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
      coordsAtPos: vi
        .fn()
        .mockReturnValue({ top: 100, bottom: 120, left: 200, right: 250 }),
      hasFocus: vi.fn().mockReturnValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [EditorFloatingMenuComponent, NoopAnimationsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(EditorFloatingMenuComponent);
    component = fixture.componentInstance;

    component.editor = {
      view: mockEditorView,
      update: updateSubject.asObservable(),
      destroy: vi.fn(),
    } as unknown as typeof component.editor;

    fixture.detectChanges();
  });

  afterEach(() => {
    updateSubject.complete();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initial state', () => {
    it('should have bold state as false initially', () => {
      expect(component.isBold()).toBe(false);
    });

    it('should have italic state as false initially', () => {
      expect(component.isItalic()).toBe(false);
    });

    it('should have underline state as false initially', () => {
      expect(component.isUnderline()).toBe(false);
    });

    it('should have strike state as false initially', () => {
      expect(component.isStrike()).toBe(false);
    });

    it('should have link state as false initially', () => {
      expect(component.isLink()).toBe(false);
    });
  });

  describe('toggle methods', () => {
    it('should call toggleBold and focus editor', () => {
      component.toggleBold();
      expect(mockEditorView.focus).toHaveBeenCalled();
    });

    it('should call toggleItalic and focus editor', () => {
      component.toggleItalic();
      expect(mockEditorView.focus).toHaveBeenCalled();
    });

    it('should call toggleUnderline and focus editor', () => {
      component.toggleUnderline();
      expect(mockEditorView.focus).toHaveBeenCalled();
    });

    it('should call toggleStrike and focus editor', () => {
      component.toggleStrike();
      expect(mockEditorView.focus).toHaveBeenCalled();
    });
  });

  describe('link toggle', () => {
    it('should remove link if already has link', () => {
      mockEditorView.state.doc.rangeHasMark.mockReturnValue(true);

      component.toggleLink();

      expect(mockEditorView.state.tr.removeMark).toHaveBeenCalled();
      expect(mockEditorView.dispatch).toHaveBeenCalled();
      expect(mockEditorView.focus).toHaveBeenCalled();
    });

    it('should prompt for URL if no link exists', () => {
      mockEditorView.state.doc.rangeHasMark.mockReturnValue(false);
      const promptSpy = vi
        .spyOn(window, 'prompt')
        .mockReturnValue('https://example.com');

      component.toggleLink();

      expect(promptSpy).toHaveBeenCalledWith('Enter URL:');
      expect(mockEditorView.state.tr.addMark).toHaveBeenCalled();
      expect(mockEditorView.dispatch).toHaveBeenCalled();
      expect(mockEditorView.focus).toHaveBeenCalled();

      promptSpy.mockRestore();
    });

    it('should not add link if prompt is cancelled', () => {
      mockEditorView.state.doc.rangeHasMark.mockReturnValue(false);
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);

      component.toggleLink();

      expect(promptSpy).toHaveBeenCalled();
      expect(mockEditorView.state.tr.addMark).not.toHaveBeenCalled();

      promptSpy.mockRestore();
    });
  });

  describe('state updates', () => {
    it('should update state when editor emits update', () => {
      mockEditorView.state.doc.rangeHasMark.mockReturnValue(true);

      updateSubject.next();
      fixture.detectChanges();

      // State should be updated based on rangeHasMark returning true
      expect(component.isBold()).toBe(true);
    });
  });
});
