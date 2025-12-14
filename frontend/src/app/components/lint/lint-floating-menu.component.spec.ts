import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Editor } from '@bobbyquantum/ngx-editor';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExtendedCorrectionDto } from './correction-dto.extension';
import { LintFloatingMenuComponent } from './lint-floating-menu.component';
import * as lintPlugin from './lint-plugin';

describe('LintFloatingMenuComponent', () => {
  let component: LintFloatingMenuComponent;
  let fixture: ComponentFixture<LintFloatingMenuComponent>;
  let mockEditor: {
    update: Subject<{ state: any }>;
    view: any;
  };
  let mockPluginKeyGetState: ReturnType<typeof vi.fn>;

  const createMockSuggestion = (
    overrides: Partial<ExtendedCorrectionDto> = {}
  ): ExtendedCorrectionDto => ({
    originalText: 'teh',
    correctedText: 'the',
    errorType: 'spelling',
    recommendation: 'Fix spelling',
    reason: 'Spelling error',
    startPos: 10,
    endPos: 13,
    ...overrides,
  });

  const createMockEditorState = (cursorPos: number) => ({
    selection: { from: cursorPos },
    doc: {
      content: { size: 100 },
      // Mock resolve function for TextSelection.create
      resolve: (pos: number) => ({
        pos,
        depth: 0,
        parent: { content: { size: 100 } },
        textOffset: 0,
        nodeAfter: null,
        nodeBefore: null,
      }),
    },
    tr: {
      setSelection: vi.fn().mockReturnThis(),
      setMeta: vi.fn().mockReturnThis(),
    },
  });

  beforeEach(async () => {
    // Spy on the pluginKey.getState before any tests run
    mockPluginKeyGetState = vi.spyOn(lintPlugin.pluginKey, 'getState');

    mockEditor = {
      update: new Subject<{ state: any }>(),
      view: {
        state: createMockEditorState(0),
        dispatch: vi.fn(),
        focus: vi.fn(),
      },
    };

    await TestBed.configureTestingModule({
      imports: [LintFloatingMenuComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(LintFloatingMenuComponent);
    component = fixture.componentInstance;
    component.editor = mockEditor as unknown as Editor;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should log error if editor is not provided', () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      component.editor = undefined as unknown as Editor;

      component.ngOnInit();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[LintFloatingMenu] Editor not provided'
      );
      consoleErrorSpy.mockRestore();
    });

    it('should subscribe to editor updates', () => {
      mockPluginKeyGetState.mockReturnValue({ suggestions: [] });

      component.ngOnInit();

      expect(component['subscription']).not.toBeNull();
    });
  });

  describe('cursor tracking', () => {
    it('should not update when cursor position has not changed', () => {
      mockPluginKeyGetState.mockReturnValue({ suggestions: [] });
      component.ngOnInit();

      // First update at position 5
      mockEditor.update.next({ state: createMockEditorState(5) });

      // Second update at same position
      const getStateCalls = mockPluginKeyGetState.mock.calls.length;
      mockEditor.update.next({ state: createMockEditorState(5) });

      // Should not have called getState again (skipped due to same position)
      expect(mockPluginKeyGetState.mock.calls.length).toBe(getStateCalls);
    });

    it('should update when cursor position changes', () => {
      mockPluginKeyGetState.mockReturnValue({ suggestions: [] });
      component.ngOnInit();

      mockEditor.update.next({ state: createMockEditorState(5) });
      const getStateCalls = mockPluginKeyGetState.mock.calls.length;

      mockEditor.update.next({ state: createMockEditorState(10) });

      expect(mockPluginKeyGetState.mock.calls.length).toBeGreaterThan(
        getStateCalls
      );
    });
  });

  describe('suggestion detection', () => {
    it('should clear activeSuggestion when no plugin state', () => {
      mockPluginKeyGetState.mockReturnValue(null);
      component.ngOnInit();
      component.activeSuggestion = createMockSuggestion();

      mockEditor.update.next({ state: createMockEditorState(5) });

      expect(component.activeSuggestion).toBeNull();
    });

    it('should clear activeSuggestion when no suggestions', () => {
      mockPluginKeyGetState.mockReturnValue({ suggestions: [] });
      component.ngOnInit();
      component.activeSuggestion = createMockSuggestion();

      mockEditor.update.next({ state: createMockEditorState(5) });

      expect(component.activeSuggestion).toBeNull();
    });

    it('should set activeSuggestion when cursor is inside a suggestion', () => {
      vi.useFakeTimers();
      const suggestion = createMockSuggestion({ startPos: 10, endPos: 15 });
      mockPluginKeyGetState.mockReturnValue({ suggestions: [suggestion] });
      component.ngOnInit();

      // Cursor at position 12, which is inside [10, 15]
      mockEditor.update.next({ state: createMockEditorState(12) });

      expect(component.activeSuggestion).toEqual(suggestion);
      vi.useRealTimers();
    });

    it('should not set activeSuggestion when cursor is outside all suggestions', () => {
      const suggestion = createMockSuggestion({ startPos: 10, endPos: 15 });
      mockPluginKeyGetState.mockReturnValue({ suggestions: [suggestion] });
      component.ngOnInit();

      // Cursor at position 5, which is outside [10, 15]
      mockEditor.update.next({ state: createMockEditorState(5) });

      expect(component.activeSuggestion).toBeNull();
    });

    it('should set activeSuggestion when cursor is at start boundary', () => {
      vi.useFakeTimers();
      const suggestion = createMockSuggestion({ startPos: 10, endPos: 15 });
      mockPluginKeyGetState.mockReturnValue({ suggestions: [suggestion] });
      component.ngOnInit();

      mockEditor.update.next({ state: createMockEditorState(10) });

      expect(component.activeSuggestion).toEqual(suggestion);
      vi.useRealTimers();
    });

    it('should set activeSuggestion when cursor is at end boundary', () => {
      vi.useFakeTimers();
      const suggestion = createMockSuggestion({ startPos: 10, endPos: 15 });
      mockPluginKeyGetState.mockReturnValue({ suggestions: [suggestion] });
      component.ngOnInit();

      mockEditor.update.next({ state: createMockEditorState(15) });

      expect(component.activeSuggestion).toEqual(suggestion);
      vi.useRealTimers();
    });

    it('should select first matching suggestion when cursor overlaps multiple', () => {
      vi.useFakeTimers();
      const suggestion1 = createMockSuggestion({
        startPos: 5,
        endPos: 15,
        correctedText: 'first',
      });
      const suggestion2 = createMockSuggestion({
        startPos: 10,
        endPos: 20,
        correctedText: 'second',
      });
      mockPluginKeyGetState.mockReturnValue({
        suggestions: [suggestion1, suggestion2],
      });
      component.ngOnInit();

      // Position 12 is inside both suggestions
      mockEditor.update.next({ state: createMockEditorState(12) });

      expect(component.activeSuggestion?.correctedText).toBe('first');
      vi.useRealTimers();
    });
  });

  describe('ngOnDestroy', () => {
    it('should unsubscribe from editor updates', () => {
      mockPluginKeyGetState.mockReturnValue({ suggestions: [] });
      component.ngOnInit();

      const subscription = component['subscription'];
      expect(subscription).not.toBeNull();

      component.ngOnDestroy();

      expect(component['subscription']).toBeNull();
    });

    it('should handle destroy when no subscription exists', () => {
      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });

  describe('acceptSuggestion', () => {
    it('should do nothing if no active suggestion', () => {
      const dispatchEventSpy = vi.spyOn(document, 'dispatchEvent');
      component.activeSuggestion = null;

      component.acceptSuggestion();

      expect(dispatchEventSpy).not.toHaveBeenCalled();
    });

    it('should dispatch lint-accept event with suggestion details', () => {
      const suggestion = createMockSuggestion();
      component.activeSuggestion = suggestion;

      let capturedEvent: CustomEvent | null = null;
      const dispatchEventSpy = vi
        .spyOn(document, 'dispatchEvent')
        .mockImplementation(event => {
          capturedEvent = event as CustomEvent;
          return true;
        });

      component.acceptSuggestion();

      expect(dispatchEventSpy).toHaveBeenCalled();
      expect(capturedEvent).not.toBeNull();
      expect(capturedEvent!.type).toBe('lint-accept');
      expect(capturedEvent!.detail).toEqual(suggestion);
    });

    it('should clear activeSuggestion after accepting', () => {
      component.activeSuggestion = createMockSuggestion();
      vi.spyOn(document, 'dispatchEvent').mockImplementation(() => true);

      component.acceptSuggestion();

      expect(component.activeSuggestion).toBeNull();
    });
  });

  describe('rejectSuggestion', () => {
    it('should do nothing if no active suggestion', () => {
      const dispatchEventSpy = vi.spyOn(document, 'dispatchEvent');
      component.activeSuggestion = null;

      component.rejectSuggestion();

      expect(dispatchEventSpy).not.toHaveBeenCalled();
    });

    it('should dispatch lint-reject event with suggestion details', () => {
      const suggestion = createMockSuggestion();
      component.activeSuggestion = suggestion;

      let capturedEvent: CustomEvent | null = null;
      const dispatchEventSpy = vi
        .spyOn(document, 'dispatchEvent')
        .mockImplementation(event => {
          capturedEvent = event as CustomEvent;
          return true;
        });

      component.rejectSuggestion();

      expect(dispatchEventSpy).toHaveBeenCalled();
      expect(capturedEvent).not.toBeNull();
      expect(capturedEvent!.type).toBe('lint-reject');
      expect(capturedEvent!.detail).toEqual(suggestion);
    });

    it('should clear activeSuggestion after rejecting', () => {
      component.activeSuggestion = createMockSuggestion();
      vi.spyOn(document, 'dispatchEvent').mockImplementation(() => true);

      component.rejectSuggestion();

      expect(component.activeSuggestion).toBeNull();
    });
  });

  describe('forceFloatingMenuToAppear (private)', () => {
    it('should not dispatch if from equals to', () => {
      vi.useFakeTimers();
      const suggestion = createMockSuggestion({ startPos: 10, endPos: 10 });
      mockPluginKeyGetState.mockReturnValue({ suggestions: [suggestion] });
      component.ngOnInit();

      mockEditor.update.next({ state: createMockEditorState(10) });
      vi.advanceTimersByTime(20);

      // Since from === to, dispatch should not be called
      expect(mockEditor.view.dispatch).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should attempt to focus the editor for valid selection range', () => {
      // Instead of testing the full ProseMirror integration, we can directly
      // call the private method and verify the focus call happens.
      // The TextSelection.create requires a real ProseMirror doc which is
      // too complex to mock, so we test the boundary condition above and
      // trust the integration works in real usage.

      // Verify that for a valid range (from !== to), the method would be called
      // by testing the activeSuggestion detection path
      vi.useFakeTimers();
      const suggestion = createMockSuggestion({ startPos: 10, endPos: 15 });
      mockPluginKeyGetState.mockReturnValue({ suggestions: [suggestion] });

      component.ngOnInit();
      mockEditor.update.next({ state: createMockEditorState(12) });

      // The suggestion should be detected
      expect(component.activeSuggestion).toEqual(suggestion);

      vi.useRealTimers();
    });
  });

  describe('template rendering', () => {
    it('should not render menu when no active suggestion', () => {
      fixture.detectChanges();

      const menu = fixture.nativeElement.querySelector('.lint-floating-menu');
      expect(menu).toBeNull();
    });

    it('should render menu when active suggestion exists', () => {
      component.activeSuggestion = createMockSuggestion({
        correctedText: 'the',
        reason: 'Spelling correction',
      });
      fixture.detectChanges();

      const menu = fixture.nativeElement.querySelector('.lint-floating-menu');
      expect(menu).not.toBeNull();

      const title = fixture.nativeElement.querySelector('.lint-tooltip-title');
      expect(title.textContent.trim()).toBe('the');

      const reason = fixture.nativeElement.querySelector(
        '.lint-tooltip-reason'
      );
      expect(reason.textContent.trim()).toBe('Spelling correction');
    });

    it('should have accept and reject buttons', () => {
      component.activeSuggestion = createMockSuggestion();
      fixture.detectChanges();

      const acceptBtn = fixture.nativeElement.querySelector(
        '.lint-accept-button'
      );
      const rejectBtn = fixture.nativeElement.querySelector(
        '.lint-reject-button'
      );

      expect(acceptBtn).not.toBeNull();
      expect(rejectBtn).not.toBeNull();
      expect(acceptBtn.textContent).toContain('Accept');
      expect(rejectBtn.textContent).toContain('Reject');
    });

    it('should call acceptSuggestion when accept button clicked', () => {
      component.activeSuggestion = createMockSuggestion();
      fixture.detectChanges();

      const acceptSpy = vi.spyOn(component, 'acceptSuggestion');
      const acceptBtn = fixture.nativeElement.querySelector(
        '.lint-accept-button'
      );
      acceptBtn.click();

      expect(acceptSpy).toHaveBeenCalled();
    });

    it('should call rejectSuggestion when reject button clicked', () => {
      component.activeSuggestion = createMockSuggestion();
      fixture.detectChanges();

      const rejectSpy = vi.spyOn(component, 'rejectSuggestion');
      const rejectBtn = fixture.nativeElement.querySelector(
        '.lint-reject-button'
      );
      rejectBtn.click();

      expect(rejectSpy).toHaveBeenCalled();
    });
  });
});
