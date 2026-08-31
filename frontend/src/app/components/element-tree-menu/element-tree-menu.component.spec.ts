import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { type Element, ElementType } from '@inkweld/index';
import { ElementNavigationService } from '@services/project/element-navigation.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { ElementTreeMenuComponent } from './element-tree-menu.component';

function makeElement(
  id: string,
  name: string,
  parentId: string | null,
  type: ElementType = ElementType.Item,
  order = 0
): Element {
  return {
    id,
    name,
    type,
    parentId,
    order,
    level: 0,
    expandable: type === ElementType.Folder,
    version: 0,
    metadata: {},
  };
}

describe('ElementTreeMenuComponent', () => {
  let fixture: ComponentFixture<ElementTreeMenuComponent>;
  let component: ElementTreeMenuComponent;
  let elementsSignal: ReturnType<typeof signal<Element[]>>;
  let openElementMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    elementsSignal = signal<Element[]>([]);
    openElementMock = vi.fn();

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), ElementTreeMenuComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', children: [] }]),
        {
          provide: ProjectStateService,
          useValue: {
            elements: elementsSignal,
            project: signal({ username: 'alice', slug: 'novel' }),
            openDocument: vi.fn(),
          },
        },
        {
          provide: ElementNavigationService,
          useValue: { openElement: openElementMock },
        },
        {
          provide: WorldbuildingService,
          useValue: { getSchemaById: vi.fn().mockReturnValue(null) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ElementTreeMenuComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists top-level elements when parentId is null', () => {
    elementsSignal.set([
      makeElement('a', 'Alpha', null, ElementType.Item, 1),
      makeElement('b', 'Beta', null, ElementType.Folder, 0),
    ]);
    fixture.componentRef.setInput('parentId', null);
    fixture.detectChanges();

    const ids = component.rows().map(r => r.element.id);
    expect(ids).toEqual(['b', 'a']); // sorted by order ascending
    expect(component.rows().map(r => r.isFolder)).toEqual([true, false]);
  });

  it('lists only direct children of parentId', () => {
    elementsSignal.set([
      makeElement('root', 'Root', null, ElementType.Folder),
      makeElement('child1', 'Child 1', 'root'),
      makeElement('child2', 'Child 2', 'root', ElementType.Folder),
      makeElement('grandchild', 'Grandchild', 'child2'),
      makeElement('other', 'Other', null),
    ]);
    fixture.componentRef.setInput('parentId', 'root');
    fixture.detectChanges();

    const ids = component.rows().map(r => r.element.id);
    expect(ids).toEqual(['child1', 'child2']);
    expect(component.rows().every(r => r.element.parentId === 'root')).toBe(
      true
    );
  });

  it('marks the current-branch row when currentBranchId matches a child id', () => {
    elementsSignal.set([
      makeElement('a', 'A', 'root'),
      makeElement('b', 'B', 'root'),
    ]);
    fixture.componentRef.setInput('parentId', 'root');
    fixture.componentRef.setInput('currentBranchId', 'b');
    fixture.detectChanges();

    const branchFlags = component.rows().map(r => r.isCurrentBranch);
    expect(branchFlags).toEqual([false, true]);
  });

  it('returns empty rows for an empty folder', () => {
    elementsSignal.set([
      makeElement('empty', 'Empty', null, ElementType.Folder),
    ]);
    fixture.componentRef.setInput('parentId', 'empty');
    fixture.detectChanges();
    expect(component.rows()).toEqual([]);
  });

  it('returns empty rows when parentId is in the visited set (cycle guard)', () => {
    elementsSignal.set([
      makeElement('a', 'A', 'a', ElementType.Folder), // self-parent (malformed)
    ]);
    fixture.componentRef.setInput('parentId', 'a');
    fixture.componentRef.setInput('visited', new Set(['a']));
    fixture.detectChanges();
    expect(component.rows()).toEqual([]);
  });

  it('openElement delegates to ElementNavigationService', () => {
    const el = makeElement('doc', 'Doc', null);
    component.openElement(el);
    expect(openElementMock).toHaveBeenCalledWith(el);
  });

  describe('nextBranchIdFor', () => {
    it('returns the child of elementId that lies on the path to currentBranchId', () => {
      // Path: root -> child -> grandchild -> leaf
      // currentBranch at this menu's depth is "leaf"; we ask for the
      // next branch id under "root" -> should be "child".
      elementsSignal.set([
        makeElement('root', 'Root', null, ElementType.Folder),
        makeElement('child', 'Child', 'root', ElementType.Folder),
        makeElement('grandchild', 'Grandchild', 'child', ElementType.Folder),
        makeElement('leaf', 'Leaf', 'grandchild'),
      ]);
      fixture.componentRef.setInput('parentId', 'root');
      fixture.componentRef.setInput('currentBranchId', 'leaf');
      fixture.detectChanges();

      expect(component.nextBranchIdFor('root')).toBe('child');
      expect(component.nextBranchIdFor('child')).toBe('grandchild');
      expect(component.nextBranchIdFor('grandchild')).toBe('leaf');
    });

    it('returns null when elementId is not on the current branch', () => {
      elementsSignal.set([
        makeElement('root', 'Root', null, ElementType.Folder),
        makeElement('a', 'A', 'root'),
        makeElement('b', 'B', 'root'),
        makeElement('deep', 'Deep', 'a'),
      ]);
      fixture.componentRef.setInput('parentId', 'root');
      fixture.componentRef.setInput('currentBranchId', 'deep');
      fixture.detectChanges();

      expect(component.nextBranchIdFor('b')).toBeNull();
    });

    it('returns null when currentBranchId is null', () => {
      fixture.componentRef.setInput('currentBranchId', null);
      fixture.detectChanges();
      expect(component.nextBranchIdFor('anything')).toBeNull();
    });
  });

  describe('visitedWithCurrentParent', () => {
    it('returns a new set with the current parentId added', () => {
      const original = new Set<string>(['x']);
      fixture.componentRef.setInput('visited', original);
      fixture.componentRef.setInput('parentId', 'root');
      fixture.detectChanges();

      const next = component.visitedWithCurrentParent();
      expect(next.has('root')).toBe(true);
      expect(next.has('x')).toBe(true);
      expect(original.has('root')).toBe(false);
    });

    it('does not add anything when parentId is null', () => {
      const original = new Set<string>(['x']);
      fixture.componentRef.setInput('visited', original);
      fixture.componentRef.setInput('parentId', null);
      fixture.detectChanges();

      const next = component.visitedWithCurrentParent();
      expect(next.has('x')).toBe(true);
      expect(next.size).toBe(1);
    });
  });
});
