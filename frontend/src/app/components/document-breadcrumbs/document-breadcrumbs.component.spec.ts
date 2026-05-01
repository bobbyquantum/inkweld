import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { type Element, ElementType } from '@inkweld/index';
import { SettingsService } from '@services/core/settings.service';
import { ProjectStateService } from '@services/project/project-state.service';

import { DocumentBreadcrumbsComponent } from './document-breadcrumbs.component';

describe('DocumentBreadcrumbsComponent', () => {
  let fixture: ComponentFixture<DocumentBreadcrumbsComponent>;
  let component: DocumentBreadcrumbsComponent;
  let elementsSignal: ReturnType<typeof signal<Element[]>>;
  let showBreadcrumbsSignal: ReturnType<typeof signal<boolean>>;

  function makeElement(
    id: string,
    name: string,
    parentId: string | null = null,
    type: ElementType = ElementType.Item
  ): Element {
    return {
      id,
      name,
      parentId,
      type,
      sortOrder: 0,
    } as unknown as Element;
  }

  beforeEach(async () => {
    elementsSignal = signal<Element[]>([]);
    showBreadcrumbsSignal = signal<boolean>(true);

    const projectStateMock = {
      elements: elementsSignal,
    };

    const settingsMock = {
      showBreadcrumbs: showBreadcrumbsSignal,
    };

    await TestBed.configureTestingModule({
      imports: [DocumentBreadcrumbsComponent, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProjectStateService, useValue: projectStateMock },
        { provide: SettingsService, useValue: settingsMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DocumentBreadcrumbsComponent);
    component = fixture.componentInstance;
  });

  it('returns empty segments when element id is missing', () => {
    fixture.componentRef.setInput('elementId', '');
    fixture.detectChanges();
    expect(component.segments()).toEqual([]);
  });

  it('returns empty segments when element is unknown', () => {
    elementsSignal.set([makeElement('a', 'A')]);
    fixture.componentRef.setInput('elementId', 'missing');
    fixture.detectChanges();
    expect(component.segments()).toEqual([]);
  });

  it('builds the path from root to current element', () => {
    elementsSignal.set([
      makeElement('root', 'Part One', null, ElementType.Folder),
      makeElement('mid', 'Chapter Two', 'root', ElementType.Folder),
      makeElement('leaf', 'Scene 3', 'mid'),
    ]);
    fixture.componentRef.setInput('elementId', 'leaf');
    fixture.detectChanges();

    const segs = component.segments();
    expect(segs.map(s => s.name)).toEqual([
      'Part One',
      'Chapter Two',
      'Scene 3',
    ]);
    expect(segs.map(s => s.isCurrent)).toEqual([false, false, true]);
    expect(component.fullPath()).toBe('Part One › Chapter Two › Scene 3');
  });

  it('falls back to "Untitled" for elements without a name', () => {
    elementsSignal.set([
      makeElement('root', 'Folder', null, ElementType.Folder),
      makeElement('leaf', '', 'root'),
    ]);
    fixture.componentRef.setInput('elementId', 'leaf');
    fixture.detectChanges();
    expect(component.segments().at(-1)?.name).toBe('Untitled');
  });

  it('terminates path-walking when a parent reference forms a cycle', () => {
    // Defensive: malformed data should not loop forever.
    const a = makeElement('a', 'A', 'b', ElementType.Folder);
    const b = makeElement('b', 'B', 'a', ElementType.Folder);
    elementsSignal.set([a, b]);
    fixture.componentRef.setInput('elementId', 'a');
    fixture.detectChanges();

    const names = component.segments().map(s => s.name);
    expect(names).toContain('A');
    expect(names).toContain('B');
    expect(names.length).toBe(2);
  });

  it('renders non-interactive segments and a separator only between them when path > 1', () => {
    elementsSignal.set([
      makeElement('root', 'Folder', null, ElementType.Folder),
      makeElement('leaf', 'Doc', 'root'),
    ]);
    fixture.componentRef.setInput('elementId', 'leaf');
    fixture.detectChanges();

    const nav = fixture.nativeElement.querySelector(
      '[data-testid="document-breadcrumbs"]'
    );
    expect(nav).toBeTruthy();
    const segments = nav.querySelectorAll('.breadcrumb-segment');
    expect(segments.length).toBe(2);
    const separators = nav.querySelectorAll('.breadcrumb-separator');
    expect(separators.length).toBe(1);
    // All segments are plain spans (no interactive controls)
    expect(segments[0].tagName.toLowerCase()).toBe('span');
    expect(segments[1].tagName.toLowerCase()).toBe('span');
    expect(segments[1].classList.contains('current')).toBe(true);
    expect(nav.querySelector('button')).toBeNull();
  });

  it('hides the breadcrumb entirely for top-level elements', () => {
    elementsSignal.set([makeElement('only', 'Top Doc')]);
    fixture.componentRef.setInput('elementId', 'only');
    fixture.detectChanges();
    const nav = fixture.nativeElement.querySelector(
      '[data-testid="document-breadcrumbs"]'
    );
    expect(nav).toBeNull();
  });

  it('hides the breadcrumb when the showBreadcrumbs setting is disabled', () => {
    elementsSignal.set([
      makeElement('root', 'Folder', null, ElementType.Folder),
      makeElement('leaf', 'Doc', 'root'),
    ]);
    fixture.componentRef.setInput('elementId', 'leaf');
    showBreadcrumbsSignal.set(false);
    fixture.detectChanges();
    const nav = fixture.nativeElement.querySelector(
      '[data-testid="document-breadcrumbs"]'
    );
    expect(nav).toBeNull();
  });
});
