import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Router } from '@angular/router';
import { type Element, ElementType } from '@inkweld/index';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ElementNavigationService,
  typeRouteForElement,
} from './element-navigation.service';
import { ProjectStateService } from './project-state.service';

function makeElement(
  id: string,
  type: ElementType = ElementType.Item
): Element {
  return {
    id,
    name: id,
    type,
    parentId: null,
    order: 0,
    level: 0,
    expandable: type === ElementType.Folder,
    version: 0,
    metadata: {},
  };
}

describe('typeRouteForElement', () => {
  it('maps each known element type to its route segment', () => {
    expect(typeRouteForElement(ElementType.Folder)).toBe('folder');
    expect(typeRouteForElement(ElementType.Item)).toBe('document');
    expect(typeRouteForElement(ElementType.Worldbuilding)).toBe(
      'worldbuilding'
    );
    expect(typeRouteForElement(ElementType.RelationshipChart)).toBe(
      'relationship-chart'
    );
    expect(typeRouteForElement(ElementType.Canvas)).toBe('canvas');
    expect(typeRouteForElement(ElementType.Timeline)).toBe('timeline');
  });

  it('falls back to "document" for unknown types', () => {
    expect(typeRouteForElement('SOMETHING_NEW')).toBe('document');
  });
});

describe('ElementNavigationService', () => {
  let service: ElementNavigationService;
  let projectStateMock: {
    elements: ReturnType<typeof signal<Element[]>>;
    project: ReturnType<typeof signal<object | undefined>>;
    openDocument: ReturnType<typeof vi.fn>;
  };
  let router: Router;
  let navigateSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    projectStateMock = {
      elements: signal<Element[]>([]),
      project: signal({ username: 'alice', slug: 'novel' }),
      openDocument: vi.fn(),
    };

    navigateSpy = vi.fn().mockResolvedValue(true);

    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', children: [] }]),
        {
          provide: ProjectStateService,
          useValue: projectStateMock,
        },
      ],
    }).compileComponents();

    service = TestBed.inject(ElementNavigationService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockImplementation(
      navigateSpy as unknown as typeof router.navigate
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the tab and navigates to the correct route for a document', () => {
    const el = makeElement('doc-1', ElementType.Item);
    service.openElement(el);

    expect(projectStateMock.openDocument).toHaveBeenCalledWith(el);
    expect(navigateSpy).toHaveBeenCalledTimes(1);
    const commands = navigateSpy.mock.calls[0][0];
    expect(commands).toEqual(['/', 'alice', 'novel', 'document', 'doc-1']);
  });

  it('uses the "folder" route segment for folder elements', () => {
    const el = makeElement('fold-1', ElementType.Folder);
    service.openElement(el);
    expect(navigateSpy.mock.calls[0][0]).toEqual([
      '/',
      'alice',
      'novel',
      'folder',
      'fold-1',
    ]);
  });

  it('uses the "worldbuilding" route segment for worldbuilding elements', () => {
    const el = makeElement('wb-1', ElementType.Worldbuilding);
    service.openElement(el);
    expect(navigateSpy.mock.calls[0][0][3]).toBe('worldbuilding');
  });

  it('uses the "relationship-chart" route segment for relationship charts', () => {
    const el = makeElement('rc-1', ElementType.RelationshipChart);
    service.openElement(el);
    expect(navigateSpy.mock.calls[0][0][3]).toBe('relationship-chart');
  });

  it('uses the "canvas" route segment for canvas elements', () => {
    const el = makeElement('cv-1', ElementType.Canvas);
    service.openElement(el);
    expect(navigateSpy.mock.calls[0][0][3]).toBe('canvas');
  });

  it('uses the "timeline" route segment for timeline elements', () => {
    const el = makeElement('tl-1', ElementType.Timeline);
    service.openElement(el);
    expect(navigateSpy.mock.calls[0][0][3]).toBe('timeline');
  });

  it('still opens the tab when no project is loaded but skips navigation', () => {
    projectStateMock.project.set(undefined);
    const el = makeElement('doc-2', ElementType.Item);
    service.openElement(el);

    expect(projectStateMock.openDocument).toHaveBeenCalledWith(el);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when the element has no id', () => {
    service.openElement({ ...makeElement(''), ...{ id: '' } });
    expect(projectStateMock.openDocument).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when element is null/undefined', () => {
    service.openElement(null as unknown as Element);
    service.openElement(undefined as unknown as Element);
    expect(projectStateMock.openDocument).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('skips navigation when project lacks username or slug', () => {
    projectStateMock.project.set({ username: '', slug: 'novel' });
    const el = makeElement('doc-3', ElementType.Item);
    service.openElement(el);
    expect(projectStateMock.openDocument).toHaveBeenCalledWith(el);
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
