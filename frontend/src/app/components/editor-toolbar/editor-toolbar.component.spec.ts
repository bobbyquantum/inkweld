import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { SystemConfigService } from '@services/core/system-config.service';
import { of, Subject } from 'rxjs';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { EditorToolbarComponent } from './editor-toolbar.component';

// @bobbyquantum/ngx-editor, prosemirror-commands, prosemirror-history,
// and prosemirror-schema-list are all mocked globally in setup-vitest.ts

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
        scrollIntoView: Mock;
        insert: Mock;
        doc: { lastChild: unknown; content: { size: number } };
        docChanged: boolean;
      };
      doc: { nodesBetween: Mock; slice: Mock };
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
            table: createMockNode('table'),
            table_row: createMockNode('table_row'),
            table_cell: createMockNode('table_cell'),
            table_header: createMockNode('table_header'),
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
            blockRange: vi.fn().mockReturnValue(null),
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
          scrollIntoView: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          // The doc left behind after replaceSelectionWith(table); the
          // trailing-paragraph guard inspects its last child.
          doc: { lastChild: null, content: { size: 10 } },
          docChanged: false,
        },
        doc: {
          nodesBetween: vi.fn(),
          slice: vi.fn().mockReturnValue({ content: { forEach: vi.fn() } }),
        },
        storedMarks: null,
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
    };

    const mockDialogRef = {
      afterClosed: () => of(undefined),
    } as unknown as MatDialogRef<unknown>;

    const mockDialog = {
      open: vi.fn().mockReturnValue(mockDialogRef),
    };

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), EditorToolbarComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialog, useValue: mockDialog },
      ],
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

  describe('Tables', () => {
    it('should insert a table and scroll it into view', () => {
      vi.useFakeTimers();
      component.insertTable();
      vi.runAllTimers();
      expect(mockEditorView.state.tr.replaceSelectionWith).toHaveBeenCalled();
      expect(mockEditorView.state.tr.scrollIntoView).toHaveBeenCalled();
      expect(mockEditorView.dispatch).toHaveBeenCalled();
      expect(mockEditorView.focus).toHaveBeenCalled();
    });

    it('should build the requested number of rows and columns', () => {
      const rowType = mockEditorView.state.schema.nodes['table_row'] as {
        create: Mock;
      };
      component.insertTable(4, 2);
      expect(rowType.create).toHaveBeenCalledTimes(4);
      // Every row is built with exactly two cells.
      for (const call of rowType.create.mock.calls) {
        expect(call[1]).toHaveLength(2);
      }
    });

    it('should build the first row from header cells and the rest from body cells', () => {
      const headerType = mockEditorView.state.schema.nodes['table_header'] as {
        create: Mock;
      };
      const cellType = mockEditorView.state.schema.nodes['table_cell'] as {
        create: Mock;
      };
      component.insertTable(3, 3);
      // One header row of 3, two body rows of 3.
      expect(headerType.create).toHaveBeenCalledTimes(3);
      expect(cellType.create).toHaveBeenCalledTimes(6);
    });

    it('should append a trailing paragraph when the table ends the document', () => {
      const tableType = mockEditorView.state.schema.nodes['table'];
      const paragraphType = mockEditorView.state.schema.nodes['paragraph'] as {
        create: Mock;
      };
      // Simulate the table landing as the document's last node.
      mockEditorView.state.tr.doc.lastChild = { type: tableType };

      component.insertTable();

      expect(mockEditorView.state.tr.insert).toHaveBeenCalledWith(
        10,
        expect.anything()
      );
      expect(paragraphType.create).toHaveBeenCalled();
    });

    it('should not append a paragraph when content already follows the table', () => {
      mockEditorView.state.tr.doc.lastChild = {
        type: mockEditorView.state.schema.nodes['paragraph'],
      };

      component.insertTable();

      expect(mockEditorView.state.tr.insert).not.toHaveBeenCalled();
    });

    it('should do nothing when the schema has no table nodes', () => {
      delete mockEditorView.state.schema.nodes['table'];
      component.insertTable();
      expect(mockEditorView.dispatch).not.toHaveBeenCalled();
    });

    it('should not insert a table while disabled', () => {
      component.disabled = true;
      component.insertTable();
      expect(mockEditorView.dispatch).not.toHaveBeenCalled();
    });

    it.each([
      ['addRowBefore'],
      ['addRowAfter'],
      ['deleteRow'],
      ['addColumnBefore'],
      ['addColumnAfter'],
      ['deleteColumn'],
      ['mergeCells'],
      ['splitCell'],
      ['toggleHeaderRow'],
      ['toggleHeaderColumn'],
      ['deleteTable'],
    ])('should run the %s command and refocus the editor', name => {
      vi.useFakeTimers();
      (component[name as keyof typeof component] as () => void).call(component);
      vi.runAllTimers();
      expect(mockEditorView.dispatch).toHaveBeenCalled();
      expect(mockEditorView.focus).toHaveBeenCalled();
    });

    it('should not run table commands while disabled', () => {
      component.disabled = true;
      component.addRowAfter();
      component.deleteTable();
      expect(mockEditorView.dispatch).not.toHaveBeenCalled();
    });

    it('should report inTable as false outside a table', () => {
      expect(component.inTable()).toBe(false);
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

  // ============================================================
  // Link / Image / Alignment commands
  // ============================================================

  describe('Link Operations', () => {
    it('should emit insertLinkClick when insertLink is called', () => {
      const spy = vi.fn();
      component.insertLinkClick.subscribe(spy);
      component.insertLink();
      expect(spy).toHaveBeenCalled();
    });

    it('should not emit insertLinkClick when toolbar is disabled', () => {
      const spy = vi.fn();
      component.insertLinkClick.subscribe(spy);
      component.disabled = true;
      component.insertLink();
      expect(spy).not.toHaveBeenCalled();
    });

    it('should not throw when removeLink is called with disabled toolbar', () => {
      component.disabled = true;
      expect(() => component.removeLink()).not.toThrow();
    });

    it('should not throw when removeLink is called and editor view is null', () => {
      component.editor = { view: null } as unknown as typeof component.editor;
      expect(() => component.removeLink()).not.toThrow();
    });

    it('should dispatch removeMark when removeLink is called', () => {
      vi.useFakeTimers();
      component.removeLink();
      vi.runAllTimers();
      expect(mockEditorView.dispatch).toHaveBeenCalled();
    });
  });

  describe('Image Insert', () => {
    it('should emit insertImageClick when insertImage is called', () => {
      const spy = vi.fn();
      component.insertImageClick.subscribe(spy);
      component.insertImage();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Alignment', () => {
    it('should not dispatch when disabled', () => {
      component.disabled = true;
      component.setAlign('center');
      expect(mockEditorView.dispatch).not.toHaveBeenCalled();
    });

    it('should not throw when editor view is null', () => {
      component.editor = { view: null } as unknown as typeof component.editor;
      expect(() => component.setAlign('center')).not.toThrow();
    });

    it('should dispatch when alignment changes and doc changed', () => {
      mockEditorView.state.tr.docChanged = true;
      component.setAlign('center');
      expect(mockEditorView.dispatch).toHaveBeenCalled();
    });
  });

  describe('Comments toggle', () => {
    it('should have a commentTooltip string', () => {
      expect(typeof component.commentTooltip).toBe('string');
      expect(component.commentTooltip.length).toBeGreaterThan(0);
    });
  });

  describe('onMenuClosed', () => {
    it('should refocus editor when menu closes', () => {
      vi.useFakeTimers();
      component.onMenuClosed();
      vi.runAllTimers();
      expect(mockEditorView.focus).toHaveBeenCalled();
    });
  });

  // ============================================================
  // Overflow System Tests
  // ============================================================

  describe('Overflow System', () => {
    describe('isOverflowed()', () => {
      it('should return false for all groups when overflowGroups is empty', () => {
        component.overflowGroups.set(new Set());
        expect(component.isOverflowed('formatting')).toBe(false);
        expect(component.isOverflowed('heading')).toBe(false);
        expect(component.isOverflowed('alignment')).toBe(false);
        expect(component.isOverflowed('lists')).toBe(false);
        expect(component.isOverflowed('insert')).toBe(false);
        expect(component.isOverflowed('history')).toBe(false);
      });

      it('should return true for a group that is in overflowGroups', () => {
        component.overflowGroups.set(new Set(['history', 'insert']));
        expect(component.isOverflowed('history')).toBe(true);
        expect(component.isOverflowed('insert')).toBe(true);
        expect(component.isOverflowed('lists')).toBe(false);
      });
    });

    describe('hasOverflow computed', () => {
      it('should be false when no groups have overflowed', () => {
        component.overflowGroups.set(new Set());
        expect(component.hasOverflow()).toBe(false);
      });

      it('should be true when at least one group has overflowed', () => {
        component.overflowGroups.set(new Set(['history']));
        expect(component.hasOverflow()).toBe(true);
      });

      it('should be true when all groups have overflowed', () => {
        component.overflowGroups.set(
          new Set([
            'formatting',
            'heading',
            'alignment',
            'lists',
            'insert',
            'history',
          ])
        );
        expect(component.hasOverflow()).toBe(true);
      });
    });

    describe('recalculateOverflow()', () => {
      it('should clear overflow when disabled', () => {
        component.overflowGroups.set(new Set(['history', 'insert']));
        component.disabled = true;
        component.recalculateOverflow();
        expect(component.overflowGroups().size).toBe(0);
      });

      it('should not throw when toolbarEl is not available', () => {
        // Simulate missing element (e.g. in server-side rendering)
        const original = component.toolbarEl;
        (component as unknown as { toolbarEl: null }).toolbarEl = null!;
        expect(() => component.recalculateOverflow()).not.toThrow();
        (component as unknown as { toolbarEl: typeof original }).toolbarEl =
          original;
      });

      it('should not change overflow when container has zero width', () => {
        vi.useFakeTimers();
        // offsetWidth returns 0 by default in jsdom
        component.overflowGroups.set(new Set(['history']));
        component.recalculateOverflow();
        // requestAnimationFrame callback fires — but offsetWidth is 0, so no change
        vi.runAllTimers();
        // We can only verify it doesn't crash; jsdom has no real layout
        expect(component).toBeTruthy();
      });

      it('should overflow lower-priority groups first when space is insufficient', () => {
        vi.useFakeTimers();
        const el = component.toolbarEl.nativeElement;

        // Give the container a defined width. 300px leaves enough room
        // (after padding + reserved overflow-button width) for history
        // (highest priority) to stay while lower-priority groups overflow.
        Object.defineProperty(el, 'offsetWidth', {
          value: 300,
          configurable: true,
        });

        // Simulate visible group elements with non-zero widths
        const makeGroupEl = (width: number) =>
          ({
            offsetWidth: width,
            classList: { contains: () => false },
          }) as unknown as HTMLElement;

        vi.spyOn(el, 'querySelector').mockImplementation((sel: string) => {
          if (
            sel.includes('data-toolbar-group') ||
            sel.includes('data-toolbar-divider')
          ) {
            return makeGroupEl(50);
          }
          return null;
        });

        vi.spyOn(el, 'querySelectorAll').mockImplementation((_sel: string) => {
          return [{ offsetWidth: 40 }] as unknown as NodeListOf<Element>;
        });

        component.recalculateOverflow();
        // Flush double requestAnimationFrame
        vi.runAllTimers();

        // insert (lowest priority) should be overflowed first;
        // history is now highest priority and should stay visible.
        // Total = 6 groups * (50 + 50) = 600; available ≈ 300 - padding
        // - 44 overflow reserve ≈ ~180, so lower-priority groups overflow
        // but history stays.
        const overflow = component.overflowGroups();
        expect(overflow.has('insert')).toBe(true);
        expect(overflow.has('history')).toBe(false);
      });

      it('should budget for flex gaps so the row never bleeds into the pinned-toggle reservation', () => {
        vi.useFakeTimers();
        const el = component.toolbarEl.nativeElement;

        // jsdom reports no padding, so available = 300 - 44 = 256.
        Object.defineProperty(el, 'offsetWidth', {
          value: 300,
          configurable: true,
        });

        // 6 groups * 42 = 252 of cached width fits in 256 on its own, but
        // once the 4px flex gaps between the 12 children (44px) are budgeted
        // the row no longer fits and the lowest-priority group must move
        // into the overflow menu.
        vi.spyOn(el, 'querySelector').mockImplementation((sel: string) => {
          if (sel.includes('data-toolbar-group')) {
            return {
              offsetWidth: 42,
              classList: { contains: () => false },
            } as unknown as Element;
          }
          if (sel.includes('data-toolbar-divider')) {
            return { offsetWidth: 0 } as unknown as Element;
          }
          return null;
        });

        component.recalculateOverflow();
        vi.runAllTimers();

        expect(component.isOverflowed('insert')).toBe(true);
        expect(component.isOverflowed('history')).toBe(false);
      });

      it('should recalculate overflow when the auto-review feature flag flips', async () => {
        const config = TestBed.inject(SystemConfigService);
        const spy = vi.spyOn(component, 'recalculateOverflow');

        const features = config.systemFeatures();
        (
          config as unknown as {
            systemFeaturesSignal: { set: (value: unknown) => void };
          }
        ).systemFeaturesSignal.set({ ...features, aiAutoReview: true });

        fixture.detectChanges();
        await fixture.whenStable();

        expect(spy).toHaveBeenCalled();
      });

      it('should clear overflow when all groups fit (using cache)', () => {
        vi.useFakeTimers();
        component.overflowGroups.set(new Set(['history', 'insert']));

        const el = component.toolbarEl.nativeElement;
        Object.defineProperty(el, 'offsetWidth', {
          value: 2000,
          configurable: true,
        });

        // Pre-populate the cache with small natural widths for all groups
        (
          component as unknown as { groupNaturalWidths: Map<string, number> }
        ).groupNaturalWidths.set('formatting', 10);
        (
          component as unknown as { groupNaturalWidths: Map<string, number> }
        ).groupNaturalWidths.set('heading', 10);
        (
          component as unknown as { groupNaturalWidths: Map<string, number> }
        ).groupNaturalWidths.set('alignment', 10);
        (
          component as unknown as { groupNaturalWidths: Map<string, number> }
        ).groupNaturalWidths.set('lists', 10);
        (
          component as unknown as { groupNaturalWidths: Map<string, number> }
        ).groupNaturalWidths.set('insert', 10);
        (
          component as unknown as { groupNaturalWidths: Map<string, number> }
        ).groupNaturalWidths.set('history', 10);

        // Simulate visible groups with small widths (so cache stays at 10)
        vi.spyOn(el, 'querySelector').mockImplementation((sel: string) => {
          if (sel.includes('data-toolbar-group')) {
            return {
              offsetWidth: 10,
              classList: { contains: () => false },
            } as unknown as Element;
          }
          if (sel.includes('data-toolbar-divider')) {
            return { offsetWidth: 0 } as unknown as Element;
          }
          return null;
        });

        vi.spyOn(el, 'querySelectorAll').mockImplementation(
          () => [] as unknown as NodeListOf<Element>
        );

        component.recalculateOverflow();
        vi.runAllTimers();

        // Total width = 6 * 10 = 60, available = 2000 - 44 = 1956 → all fit
        expect(component.overflowGroups().size).toBe(0);
      });
    });

    describe('initResizeObserver()', () => {
      it('should disconnect and not throw on destroy after initResizeObserver', () => {
        // ResizeObserver is available in the test environment (vitest jsdom)
        expect(() => {
          component.initResizeObserver();
          component.ngOnDestroy();
        }).not.toThrow();
      });

      it('should skip initialisation when ResizeObserver is unavailable', () => {
        const original = (globalThis as Record<string, unknown>)[
          'ResizeObserver'
        ];
        delete (globalThis as Record<string, unknown>)['ResizeObserver'];

        expect(() => component.initResizeObserver()).not.toThrow();

        (globalThis as Record<string, unknown>)['ResizeObserver'] = original;
      });
    });

    describe('seedGroupWidthCache()', () => {
      it('should not throw when toolbarEl is not available', () => {
        const original = component.toolbarEl;
        (component as unknown as { toolbarEl: null }).toolbarEl = null!;
        expect(() => component.seedGroupWidthCache()).not.toThrow();
        (component as unknown as { toolbarEl: typeof original }).toolbarEl =
          original;
      });

      it('should populate groupNaturalWidths from visible groups', () => {
        vi.useFakeTimers();
        const el = component.toolbarEl.nativeElement;

        // Simulate visible groups with known widths
        vi.spyOn(el, 'querySelector').mockImplementation((sel: string) => {
          if (sel.includes('data-toolbar-group')) {
            return { offsetWidth: 80 } as unknown as Element;
          }
          if (sel.includes('data-toolbar-divider')) {
            return { offsetWidth: 12 } as unknown as Element;
          }
          return null;
        });

        component.seedGroupWidthCache();
        vi.runAllTimers();

        const cache = (
          component as unknown as { groupNaturalWidths: Map<string, number> }
        ).groupNaturalWidths;
        expect(cache.get('formatting')).toBe(92); // 80 + 12
        expect(cache.get('history')).toBe(92);
      });
    });

    describe('Template overflow rendering', () => {
      /** Force all groups into the overflow menu and re-render, then call actions */
      async function setAllGroupsOverflowed(): Promise<void> {
        component.overflowGroups.set(
          new Set([
            'formatting',
            'heading',
            'alignment',
            'lists',
            'insert',
            'history',
          ])
        );
        fixture.detectChanges();
        await fixture.whenStable();
      }

      // The "call all overflow menu actions" test enables fake timers; restore
      // real timers afterwards so subsequent tests' whenStable() can resolve.
      afterEach(() => {
        vi.useRealTimers();
      });

      it('should render overflow button when groups overflow', async () => {
        await setAllGroupsOverflowed();
        const btn = fixture.nativeElement.querySelector(
          '[data-testid="toolbar-overflow-btn"]'
        );
        expect(btn).not.toBeNull();
      });

      it('should be able to call all overflow menu actions without throwing', async () => {
        // Await Angular stability BEFORE enabling fake timers — otherwise
        // whenStable() deadlocks because it relies on rAF/setTimeout which
        // fake timers freeze. Enable fake timers only to flush the queued
        // rAF/setTimeout callbacks the toolbar methods schedule.
        await setAllGroupsOverflowed();
        vi.useFakeTimers();

        // All overflow actions must not throw
        expect(() => component.undo()).not.toThrow();
        expect(() => component.redo()).not.toThrow();
        expect(() => component.toggleBulletList()).not.toThrow();
        expect(() => component.toggleOrderedList()).not.toThrow();
        expect(() => component.toggleBlockquote()).not.toThrow();
        expect(() => component.setAlign('left')).not.toThrow();
        expect(() => component.setAlign('center')).not.toThrow();
        expect(() => component.setAlign('right')).not.toThrow();
        expect(() => component.setAlign('justify')).not.toThrow();
        expect(() => component.setHeading(0)).not.toThrow();
        expect(() => component.setHeading(1)).not.toThrow();
        expect(() => component.setHeading(2)).not.toThrow();
        expect(() => component.setHeading(3)).not.toThrow();
        expect(() => component.setHeading(4)).not.toThrow();
        expect(() => component.setHeading(5)).not.toThrow();
        expect(() => component.setHeading(6)).not.toThrow();
        expect(() => component.toggleBold()).not.toThrow();
        expect(() => component.toggleItalic()).not.toThrow();
        expect(() => component.toggleUnderline()).not.toThrow();
        expect(() => component.toggleStrike()).not.toThrow();
        expect(() => component.insertImage()).not.toThrow();
        expect(() => component.insertHorizontalRule()).not.toThrow();
        expect(() => component.clearFormatting()).not.toThrow();

        vi.runAllTimers();
      });

      it('should mark overflow groups with CSS class when overflowed', async () => {
        await setAllGroupsOverflowed();

        const el = fixture.nativeElement as HTMLElement;

        // Verify overflow state via signals
        expect(component.isOverflowed('history')).toBe(true);
        expect(component.isOverflowed('insert')).toBe(true);
        expect(component.isOverflowed('lists')).toBe(true);
        expect(component.isOverflowed('alignment')).toBe(true);
        expect(component.isOverflowed('heading')).toBe(true);
        expect(component.isOverflowed('formatting')).toBe(true);
        expect(component.hasOverflow()).toBe(true);

        // Toolbar groups ARE in the DOM (for measurement) but have the hidden class
        const historyEl = el.querySelector('[data-toolbar-group="history"]');
        expect(historyEl).not.toBeNull();
        expect(historyEl!.classList.contains('toolbar-group--hidden')).toBe(
          true
        );
      });

      it('should show all groups without hidden class when none are overflowed', async () => {
        component.overflowGroups.set(new Set());
        fixture.detectChanges();
        await fixture.whenStable();

        const el = fixture.nativeElement as HTMLElement;

        // All groups should be present and visible
        const groupNames = [
          'formatting',
          'heading',
          'alignment',
          'lists',
          'insert',
          'history',
        ] as const;
        for (const name of groupNames) {
          const groupEl = el.querySelector(`[data-toolbar-group="${name}"]`);
          expect(groupEl).not.toBeNull();
          expect(groupEl!.classList.contains('toolbar-group--hidden')).toBe(
            false
          );
        }

        // No overflow button
        expect(
          el.querySelector('[data-testid="toolbar-overflow-btn"]')
        ).toBeNull();
      });
    });
  });
});
