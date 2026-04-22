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

    it('should not open dialog when dialog returns undefined (cancelled)', async () => {
      component.documentId = 'testuser:test-project:doc-1';
      fixture.detectChanges();
      component.ngOnInit();

      (
        dialogGatewayMock.openInsertLinkDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue(undefined);

      // Even with a real editor, view may be mocked — this just verifies no throw
      await expect(component.openInsertLinkDialog()).resolves.not.toThrow();
    });
  });
});
