import {
  NO_ERRORS_SCHEMA,
  provideZonelessChangeDetection,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

import { EditorFloatingMenuComponent } from './editor-floating-menu.component';

// @bobbyquantum/ngx-editor and prosemirror-commands are mocked globally in setup-vitest.ts

describe('EditorFloatingMenuComponent', () => {
  let component: EditorFloatingMenuComponent;
  let fixture: ComponentFixture<EditorFloatingMenuComponent>;
  let mockEditorView: {
    state: {
      schema: { marks: Record<string, unknown> };
      selection: {
        from: number;
        to: number;
        $from: unknown;
        empty: boolean;
        ranges: unknown[];
      };
      tr: { addMark: Mock; removeMark: Mock };
      doc: { rangeHasMark: Mock; nodesBetween: Mock; slice: Mock };
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
          ranges: [],
        },
        tr: {
          addMark: vi.fn().mockReturnThis(),
          removeMark: vi.fn().mockReturnThis(),
        },
        doc: {
          rangeHasMark: vi.fn().mockReturnValue(false),
          nodesBetween: vi.fn(),
          slice: vi.fn().mockReturnValue({ content: { forEach: vi.fn() } }),
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
      imports: [EditorFloatingMenuComponent],
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
    it('should emit insertLink when toggleLink is called', () => {
      const spy = vi.fn();
      component.insertLink.subscribe(spy);
      component.toggleLink();
      expect(spy).toHaveBeenCalled();
    });

    it('should hide the menu when toggleLink is called', () => {
      type PositionState = { visible: boolean };
      const comp = component as unknown as {
        positionState: ReturnType<
          typeof import('@angular/core').signal<PositionState>
        >;
      };
      // Make menu visible first
      comp.positionState.update((s: PositionState) => ({
        ...s,
        visible: true,
      }));
      component.toggleLink();
      expect(comp.positionState().visible).toBe(false);
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

    it('should prefer below-selection placement on coarse pointers', () => {
      const matchMediaSpy = vi
        .spyOn(globalThis, 'matchMedia')
        .mockImplementation((query: string) => ({
          matches: query === '(pointer: coarse)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }));

      updateSubject.next();
      fixture.detectChanges();

      const position = (
        component as unknown as { positionState: () => { top: number } }
      ).positionState();
      expect(position.top).toBeGreaterThan(120);

      matchMediaSpy.mockRestore();
    });
  });
});
