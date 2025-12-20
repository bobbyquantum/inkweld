import {
  NO_ERRORS_SCHEMA,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Project } from '@inkweld/index';
import { SettingsService } from '@services/core/settings.service';
import { DocumentService } from '@services/project/document.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentSyncState } from '../../models/document-sync-state';
import { DocumentElementEditorComponent } from './document-element-editor.component';

// Mock ngx-editor module with all required exports
vi.mock('@bobbyquantum/ngx-editor', () => {
  const createMockMark = (name: string) => ({
    name,
    isInSet: vi.fn().mockReturnValue(false),
    create: vi.fn().mockReturnValue({ type: { name } }),
  });

  const mockEditorView = {
    state: {
      plugins: [],
      doc: {
        textBetween: vi.fn().mockReturnValue(''),
        content: { size: 0 },
        nodeSize: 0,
        rangeHasMark: vi.fn().mockReturnValue(false),
      },
      selection: { from: 0, to: 0, $from: { marks: () => [] }, empty: true },
      reconfigure: vi.fn().mockReturnValue({}),
      schema: {
        marks: {
          strong: createMockMark('strong'),
          em: createMockMark('em'),
          u: createMockMark('u'),
          s: createMockMark('s'),
          link: createMockMark('link'),
        },
      },
      storedMarks: null,
    },
    updateState: vi.fn(),
  };

  // Create a proper class that can be instantiated with 'new'
  class MockEditor {
    view = mockEditorView;
    update = new Subject<void>();
    destroy = vi.fn();
    constructor() {}
  }

  return {
    Editor: MockEditor,
    Toolbar: Array,
    NgxEditorModule: class {},
    NgxEditorComponent: class {},
    NgxEditorMenuComponent: class {},
    NgxEditorFloatingMenuComponent: class {},
    NgxEditorService: class {},
    ImageViewComponent: class {},
    DEFAULT_TOOLBAR: [],
    TOOLBAR_FULL: [],
    TOOLBAR_MINIMAL: [],
    Validators: {},
    emptyDoc: vi.fn(),
    getKeyboardShortcuts: vi.fn(),
    parseContent: vi.fn(),
    toDoc: vi.fn(),
    toHTML: vi.fn(),
    NGX_EDITOR_CONFIG_TOKEN: Symbol('NGX_EDITOR_CONFIG_TOKEN'),
    provideMyServiceOptions: vi.fn(),
  };
});

describe('DocumentElementEditorComponent', () => {
  let component: DocumentElementEditorComponent;
  let fixture: ComponentFixture<DocumentElementEditorComponent>;
  let documentServiceMock: Partial<DocumentService>;
  let projectStateServiceMock: Partial<ProjectStateService>;
  let settingsServiceMock: Partial<SettingsService>;

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
    const wordCountSignal = signal(0);
    const isLoadingSignal = signal(false);
    const projectSignal = signal<Project | undefined>(mockProject);

    documentServiceMock = {
      setupCollaboration: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      getSyncStatusSignal: vi.fn().mockReturnValue(syncStatusSignal),
      getWordCountSignal: vi.fn().mockReturnValue(wordCountSignal),
    };

    projectStateServiceMock = {
      isLoading: isLoadingSignal,
      project: projectSignal,
    };

    settingsServiceMock = {
      getSetting: vi.fn().mockReturnValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [DocumentElementEditorComponent, NoopAnimationsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DocumentService, useValue: documentServiceMock },
        { provide: ProjectStateService, useValue: projectStateServiceMock },
        { provide: SettingsService, useValue: settingsServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DocumentElementEditorComponent);
    component = fixture.componentInstance;
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

  describe('meta panel', () => {
    it('should start with meta panel hidden', () => {
      expect(component.showMetaPanel()).toBe(false);
    });

    it('should be able to toggle meta panel', () => {
      component.showMetaPanel.set(true);
      expect(component.showMetaPanel()).toBe(true);

      component.showMetaPanel.set(false);
      expect(component.showMetaPanel()).toBe(false);
    });
  });
});
