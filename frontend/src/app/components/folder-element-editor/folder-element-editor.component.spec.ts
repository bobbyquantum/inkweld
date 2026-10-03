import { type CdkDragDrop } from '@angular/cdk/drag-drop';
import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  type SceneOverviewHarness,
  sceneOverviewHarness,
} from '../../../testing/scene-overview-testing';
import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { type ProjectElement } from '../../models/project-element';
import { FolderElementEditorComponent } from './folder-element-editor.component';

describe('FolderElementEditorComponent', () => {
  let fixture: ComponentFixture<FolderElementEditorComponent>;
  let component: FolderElementEditorComponent;
  let h: SceneOverviewHarness;

  const query = (selector: string): HTMLElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector(selector);

  const setFolderMetadata = (id: string, metadata: Record<string, string>) =>
    h.elements.update(list =>
      list.map(e => (e.id === id ? { ...e, metadata } : e))
    );

  const create = (elementId: string) => {
    fixture = TestBed.createComponent(FolderElementEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('elementId', elementId);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    h = sceneOverviewHarness();
    await TestBed.configureTestingModule({
      imports: [FolderElementEditorComponent, translocoTestProvider()],
      providers: [provideZonelessChangeDetection(), ...h.providers],
    }).compileComponents();
  });

  it('resolves the folder from a full document id', () => {
    create('alice:novel:book');
    expect(component.folderId()).toBe('book');
    expect(component.folderElement()?.id).toBe('book');
    expect(component.childElements().map(e => e.id)).toEqual([
      'opening',
      'chapter',
      'loose',
      'map',
    ]);
  });

  it('accepts a bare id too', () => {
    create('chapter');
    expect(component.childElements().map(e => e.id)).toEqual([
      'storm',
      'research',
    ]);
  });

  it('opens a folder with scenes on the corkboard', () => {
    create('book');
    expect(component.viewMode()).toBe('corkboard');
    expect(query('app-scene-corkboard')).toBeTruthy();
    expect(query('[data-testid="folder-refresh-word-counts"]')).toBeTruthy();
  });

  it('opens a folder without scenes on the grid', () => {
    h.elements.update(list => list.filter(e => e.id !== 'storm'));
    create('chapter');
    expect(component.viewMode()).toBe('grid');
    expect(query('.grid-container')).toBeTruthy();
    expect(query('[data-testid="folder-refresh-word-counts"]')).toBeNull();
  });

  it('honours the view saved on the folder and ignores garbage', () => {
    setFolderMetadata('book', { viewMode: 'outline' });
    create('book');
    expect(component.viewMode()).toBe('outline');
    expect(query('app-scene-outline')).toBeTruthy();

    setFolderMetadata('book', { viewMode: 'nonsense' });
    fixture.detectChanges();
    expect(component.viewMode()).toBe('corkboard');
  });

  it('saves the chosen view on the folder', () => {
    create('book');
    component.setViewMode('list');
    expect(h.projectState.updateElementMetadata).toHaveBeenCalledWith('book', {
      viewMode: 'list',
    });
  });

  it('keeps a viewer’s choice local', () => {
    h.canWrite.set(false);
    create('book');
    component.setViewMode('list');
    fixture.detectChanges();
    expect(h.projectState.updateElementMetadata).not.toHaveBeenCalled();
    expect(component.viewMode()).toBe('list');
    expect(query('.list-container')).toBeTruthy();
    expect(query('[data-testid="folder-add-element"]')).toBeNull();
  });

  it('renders the list view', () => {
    setFolderMetadata('book', { viewMode: 'list' });
    create('book');
    expect(query('.list-container')).toBeTruthy();
    expect(query('.grid-container')).toBeNull();
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')
    ).toHaveLength(4);
  });

  it('opens an element', () => {
    create('book');
    const element = component.childElements()[0];
    component.openElement(element);
    expect(h.projectState.openDocument).toHaveBeenCalledWith(element);
  });

  it('reorders the folder on drop without touching other elements', () => {
    create('book');
    const before = h.elements().length;
    component.onDrop({
      previousIndex: 0,
      currentIndex: 1,
    } as CdkDragDrop<ProjectElement[]>);
    expect(component.childElements().map(e => e.id)).toEqual([
      'chapter',
      'opening',
      'loose',
      'map',
    ]);
    expect(h.elements()).toHaveLength(before);
  });

  it('does not move anything when dropped in place', () => {
    create('book');
    component.onDrop({
      previousIndex: 1,
      currentIndex: 1,
    } as CdkDragDrop<ProjectElement[]>);
    expect(h.projectState.moveElement).not.toHaveBeenCalled();
  });

  it('creates a new element inside the folder', () => {
    create('book');
    component.createNewElement();
    expect(h.projectState.showNewElementDialog).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'book' })
    );
  });

  it('recounts words on request', () => {
    create('book');
    h.stats.recount.mockClear();
    query('[data-testid="folder-refresh-word-counts"]')!.click();
    expect(h.stats.recount).toHaveBeenCalledWith(['book']);
  });

  it('shows the empty state for a folder with no children', () => {
    h.elements.update(list => list.filter(e => e.parentId !== 'chapter'));
    create('chapter');
    expect(query('[data-testid="folder-empty"]')).toBeTruthy();
    expect(query('app-scene-corkboard')).toBeNull();
  });
});
