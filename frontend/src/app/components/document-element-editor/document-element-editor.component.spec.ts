import {
  NO_ERRORS_SCHEMA,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { type Element, type Project } from '@inkweld/index';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { SettingsService } from '@services/core/settings.service';
import { DocumentService } from '@services/project/document.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentSyncState } from '../../models/document-sync-state';
import { DocumentElementEditorComponent } from './document-element-editor.component';

// @bobbyquantum/ngx-editor is mocked globally in setup-vitest.ts

describe('DocumentElementEditorComponent', () => {
  let component: DocumentElementEditorComponent;
  let fixture: ComponentFixture<DocumentElementEditorComponent>;
  let documentServiceMock: Partial<DocumentService>;
  let projectStateServiceMock: Partial<ProjectStateService>;
  let settingsServiceMock: Partial<SettingsService>;
  let dialogGatewayMock: Partial<DialogGatewayService>;
  let wordCountSignal: ReturnType<typeof signal<number>>;

  const mockProject: Project = {
    id: '1',
    title: 'Test Project',
    slug: 'test-project',
    description: 'Test Description',
    username: 'testuser',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
  };

  beforeEach(async () => {
    const syncStatusSignal = signal(DocumentSyncState.Synced);
    wordCountSignal = signal(0);
    const isLoadingSignal = signal(false);
    const projectSignal = signal<Project | undefined>(mockProject);
    const elementsSignal = signal<Element[]>([]);
    const canWriteSignal = signal(true);

    documentServiceMock = {
      setupCollaboration: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      getSyncStatusSignal: vi.fn().mockReturnValue(syncStatusSignal),
      getWordCountSignal: vi.fn().mockReturnValue(wordCountSignal),
    };

    projectStateServiceMock = {
      isLoading: isLoadingSignal,
      project: projectSignal,
      elements: elementsSignal,
      canWrite: canWriteSignal,
    };

    settingsServiceMock = {
      getSetting: vi.fn().mockReturnValue(true),
    };

    dialogGatewayMock = {
      openInsertLinkDialog: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [DocumentElementEditorComponent, NoopAnimationsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DocumentService, useValue: documentServiceMock },
        { provide: ProjectStateService, useValue: projectStateServiceMock },
        { provide: SettingsService, useValue: settingsServiceMock },
        { provide: DialogGatewayService, useValue: dialogGatewayMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DocumentElementEditorComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initialization', () => {
    it('should initialize with default values', () => {
      expect(component.documentId).toBe('invalid');
      expect(component.zenMode).toBe(false);
      expect(component.tabsDisabled).toBe(false);
    });

    it('should have default toolbar configuration', () => {
      expect(component.toolbar).toBeDefined();
      expect(component.toolbar.length).toBeGreaterThan(0);
    });

    it('should have color presets', () => {
      expect(component.colorPresets).toBeDefined();
      expect(component.colorPresets.length).toBe(20);
    });
  });

  describe('documentId handling', () => {
    it('should set documentId via input', () => {
      component.documentId = 'testuser:test-project:doc-1';
      expect(component.documentId).toBe('testuser:test-project:doc-1');
    });

    it('should format documentId with project info when incomplete', () => {
      component.documentId = 'doc-1';
      fixture.detectChanges();

      // The ensureProperDocumentId should format it
      // Since project is available, it should become testuser:test-project:doc-1
      expect(component.documentId).toBe('testuser:test-project:doc-1');
    });
  });

  describe('syncState', () => {
    it('should return sync state from document service', () => {
      component.documentId = 'testuser:test-project:doc-1';
      fixture.detectChanges();

      expect(component.syncState()).toBe(DocumentSyncState.Synced);
      expect(documentServiceMock.getSyncStatusSignal).toHaveBeenCalled();
    });
  });

  describe('wordCount', () => {
    it('should return word count from document service', () => {
      component.documentId = 'testuser:test-project:doc-1';
      fixture.detectChanges();

      expect(component.wordCount()).toBe(0);
      expect(documentServiceMock.getWordCountSignal).toHaveBeenCalled();
    });
  });

  describe('wordCountFormatted', () => {
    it('should format 0 words as "0"', () => {
      component.documentId = 'testuser:test-project:doc-1';
      fixture.detectChanges();

      expect(component.wordCountFormatted()).toBe('0');
    });
  });

  describe('readingTime', () => {
    it('should return empty string when word count is 0', () => {
      component.documentId = 'testuser:test-project:doc-1';
      fixture.detectChanges();

      expect(component.readingTime()).toBe('');
    });

    it('should return estimated reading time for non-zero word count', () => {
      component.documentId = 'testuser:test-project:doc-1';
      wordCountSignal.set(400);
      fixture.detectChanges();

      // 400 words / 200 wpm = 2 min
      expect(component.readingTime()).toBe('~2 min read');
    });

    it('should round up to at least 1 minute for small word counts', () => {
      component.documentId = 'testuser:test-project:doc-1';
      wordCountSignal.set(50);
      fixture.detectChanges();

      expect(component.readingTime()).toBe('~1 min read');
    });
  });

  describe('ngOnDestroy', () => {
    it('should destroy editor on destroy', () => {
      component.documentId = 'testuser:test-project:doc-1';
      fixture.detectChanges();
      component.ngOnInit();

      const editorDestroySpy = vi.spyOn(component.editor, 'destroy');
      component.ngOnDestroy();

      expect(editorDestroySpy).toHaveBeenCalled();
    });

    it('should disconnect from document service on destroy', () => {
      component.documentId = 'testuser:test-project:doc-1';
      fixture.detectChanges();
      component.ngOnInit();
      component.ngOnDestroy();

      expect(documentServiceMock.disconnect).toHaveBeenCalledWith(
        'testuser:test-project:doc-1'
      );
    });

    it('should not disconnect if in zen mode', () => {
      component.documentId = 'testuser:test-project:doc-1';
      component.zenMode = true;
      fixture.detectChanges();
      component.ngOnInit();
      component.ngOnDestroy();

      expect(documentServiceMock.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('isCursorInLintSuggestion', () => {
    it('should return false when editor is not initialized', () => {
      // Don't call ngOnInit so editor remains undefined
      expect(component.isCursorInLintSuggestion()).toBe(false);
    });

    it('should return false when no lint suggestions exist', () => {
      component.documentId = 'testuser:test-project:doc-1';
      fixture.detectChanges();
      component.ngOnInit();

      expect(component.isCursorInLintSuggestion()).toBe(false);
    });
  });

  describe('openInsertLinkDialog', () => {
    it('should do nothing when editor view is unavailable', async () => {
      // editor is not initialized — view is undefined
      await component.openInsertLinkDialog();
      expect(dialogGatewayMock.openInsertLinkDialog).not.toHaveBeenCalled();
    });

    describe('with initialized editor', () => {
      beforeEach(() => {
        component.documentId = 'testuser:test-project:doc-1';
        fixture.detectChanges();
        component.ngOnInit();
      });

      it('should call openInsertLinkDialog on the gateway when editor view exists', async () => {
        (
          dialogGatewayMock.openInsertLinkDialog as ReturnType<typeof vi.fn>
        ).mockResolvedValue(undefined);

        await component.openInsertLinkDialog();

        expect(dialogGatewayMock.openInsertLinkDialog).toHaveBeenCalledOnce();
      });

      it('should dispatch removeMark when result href is empty (remove link)', async () => {
        (
          dialogGatewayMock.openInsertLinkDialog as ReturnType<typeof vi.fn>
        ).mockResolvedValue({ href: '', openInNewTab: false });

        const dispatchSpy = vi.spyOn(component.editor.view, 'dispatch');

        await component.openInsertLinkDialog();

        expect(dispatchSpy).toHaveBeenCalled();
      });

      it('should dispatch insert when result has linkText and selection is empty', async () => {
        (
          dialogGatewayMock.openInsertLinkDialog as ReturnType<typeof vi.fn>
        ).mockResolvedValue({
          href: 'https://example.com',
          openInNewTab: true,
          linkText: 'click me',
        });

        const view = component.editor.view;
        // Use mockImplementation to prevent call-through to real ProseMirror
        // dispatch, which would call state.apply(tr) on our fake tr object.
        const dispatchSpy = vi
          .spyOn(view, 'dispatch')
          .mockImplementation(() => {});

        // Replace state with a plain object so we can control all fields.
        // The real ProseMirror Transaction.insert rejects non-Node objects, so
        // we must stub the entire tr chain rather than patching individual methods.
        const fakeTr = { insert: vi.fn().mockReturnThis() };
        const fakeTextNode = {};
        const fakeMark = { type: { name: 'link' } };
        (view as unknown as Record<string, unknown>)['state'] = {
          selection: {
            from: 0,
            to: 0,
            empty: true,
            $from: {
              marks: () => [],
              start: () => 0,
              parentOffset: 0,
              parent: {
                childBefore: () => ({ node: null }),
                childAfter: () => ({ node: null }),
                content: { size: 0 },
              },
            },
            ranges: [],
          },
          storedMarks: null,
          schema: {
            marks: {
              link: {
                name: 'link',
                isInSet: () => null,
                create: () => fakeMark,
              },
            },
            text: vi.fn().mockReturnValue(fakeTextNode),
          },
          doc: {
            textBetween: () => '',
            content: { size: 0 },
            nodeSize: 0,
            rangeHasMark: () => false,
          },
          tr: fakeTr,
          reconfigure: () => ({}),
          plugins: [],
        };

        await component.openInsertLinkDialog();

        expect(dispatchSpy).toHaveBeenCalled();
        expect(fakeTr.insert).toHaveBeenCalledWith(0, fakeTextNode);
      });

      it('should dispatch addMark when selection is non-empty', async () => {
        (
          dialogGatewayMock.openInsertLinkDialog as ReturnType<typeof vi.fn>
        ).mockResolvedValue({
          href: 'https://example.com',
          openInNewTab: false,
        });

        const view = component.editor.view;
        // Use mockImplementation to prevent call-through to real ProseMirror
        // dispatch, which would call state.apply(tr) on our fake tr object.
        const dispatchSpy = vi
          .spyOn(view, 'dispatch')
          .mockImplementation(() => {});

        // Replace state with a plain object so selection.empty can be set to
        // false (the real ProseMirror Selection has a getter-only property).
        const fakeTr = { addMark: vi.fn().mockReturnThis() };
        (view as unknown as Record<string, unknown>)['state'] = {
          selection: {
            from: 1,
            to: 5,
            empty: false,
            $from: {
              marks: () => [],
              start: () => 0,
              parentOffset: 0,
              parent: {
                childBefore: () => ({ node: null }),
                childAfter: () => ({ node: null }),
                content: { size: 0 },
              },
            },
            ranges: [],
          },
          storedMarks: null,
          schema: {
            marks: {
              link: {
                name: 'link',
                isInSet: () => null,
                create: vi.fn().mockReturnValue({ type: { name: 'link' } }),
              },
            },
          },
          doc: {
            textBetween: () => '',
            content: { size: 0 },
            nodeSize: 0,
            rangeHasMark: () => false,
            nodesBetween: vi.fn(),
            slice: vi.fn().mockReturnValue({
              content: { forEach: vi.fn() },
            }),
          },
          tr: fakeTr,
          reconfigure: () => ({}),
          plugins: [],
        };

        await component.openInsertLinkDialog();

        expect(dispatchSpy).toHaveBeenCalled();
        expect(fakeTr.addMark).toHaveBeenCalledWith(1, 5, expect.anything());
      });

      it('should return early without dispatching when destroyed after dialog resolves', async () => {
        (
          dialogGatewayMock.openInsertLinkDialog as ReturnType<typeof vi.fn>
        ).mockImplementation(async () => {
          // Simulate component destroyed while dialog was open
          component.ngOnDestroy();
          return { href: 'https://example.com', openInNewTab: false };
        });

        const dispatchSpy = vi.spyOn(component.editor.view, 'dispatch');

        await component.openInsertLinkDialog();

        expect(dispatchSpy).not.toHaveBeenCalled();
      });

      it('should expand range and pre-fill href when cursor is inside an existing link', async () => {
        (
          dialogGatewayMock.openInsertLinkDialog as ReturnType<typeof vi.fn>
        ).mockResolvedValue(undefined);

        const view = component.editor.view;
        const existingMark = { attrs: { href: 'https://existing.com' } };
        const linkMarkType = {
          name: 'link',
          isInSet: vi
            .fn()
            .mockReturnValueOnce(existingMark) // storedMarks check → found
            .mockReturnValue(existingMark), // isSameLink walks
          create: vi.fn(),
        };
        const fakeNode = { marks: [], textContent: 'link text', nodeSize: 9 };
        (view as unknown as Record<string, unknown>)['state'] = {
          selection: {
            from: 5,
            to: 5,
            empty: true,
            $from: {
              marks: () => [],
              start: () => 0,
              parentOffset: 5,
              parent: {
                // Walk left: one node before cursor
                childBefore: vi
                  .fn()
                  .mockReturnValueOnce({ node: fakeNode, offset: 0 })
                  .mockReturnValue({ node: null, offset: 0 }),
                // Walk right: no node after cursor
                childAfter: vi
                  .fn()
                  .mockReturnValue({ node: null, offset: 0, nodeSize: 0 }),
                content: { size: 10 },
              },
            },
            ranges: [],
          },
          storedMarks: [{}],
          schema: { marks: { link: linkMarkType } },
          doc: {
            textBetween: () => '',
            content: { size: 0 },
            nodeSize: 0,
            rangeHasMark: () => false,
          },
          tr: {},
          reconfigure: () => ({}),
          plugins: [],
        };

        await component.openInsertLinkDialog();

        expect(dialogGatewayMock.openInsertLinkDialog).toHaveBeenCalledWith(
          expect.objectContaining({ existingHref: 'https://existing.com' })
        );
      });

      it('should detect existing link href from non-empty selection', async () => {
        (
          dialogGatewayMock.openInsertLinkDialog as ReturnType<typeof vi.fn>
        ).mockResolvedValue(undefined);

        const view = component.editor.view;
        const existingMark = { attrs: { href: 'https://selection-link.com' } };
        const linkMarkType = {
          name: 'link',
          isInSet: vi.fn().mockReturnValue(existingMark),
          create: vi.fn(),
        };
        const fakeTr = { addMark: vi.fn().mockReturnThis() };
        (view as unknown as Record<string, unknown>)['state'] = {
          selection: {
            from: 1,
            to: 5,
            empty: false,
            $from: {
              marks: () => [],
              start: () => 0,
              parentOffset: 1,
              parent: {
                childBefore: () => ({ node: null }),
                childAfter: () => ({ node: null }),
                content: { size: 0 },
              },
            },
            ranges: [],
          },
          storedMarks: null,
          schema: { marks: { link: linkMarkType } },
          doc: {
            textBetween: () => '',
            content: { size: 0 },
            nodeSize: 0,
            rangeHasMark: () => false,
            // nodesBetween calls callback with each node
            nodesBetween: vi
              .fn()
              .mockImplementation(
                (
                  _from: number,
                  _to: number,
                  cb: (node: { marks: unknown[] }) => void
                ) => {
                  cb({ marks: [{}] }); // triggers linkMark.isInSet
                }
              ),
            slice: vi.fn().mockReturnValue({
              content: { forEach: vi.fn() },
            }),
          },
          tr: fakeTr,
          reconfigure: () => ({}),
          plugins: [],
        };

        await component.openInsertLinkDialog();

        expect(dialogGatewayMock.openInsertLinkDialog).toHaveBeenCalledWith(
          expect.objectContaining({
            existingHref: 'https://selection-link.com',
          })
        );
      });
    });
  });
});
