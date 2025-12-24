/**
 * Element Reference Popup Component Tests
 *
 * Tests for the popup that appears when typing @ in the editor,
 * allowing users to search and select elements for reference insertion.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { ElementType } from '../../../../api-client';
import { ElementSearchResult } from '../element-ref.model';
import { ElementRefService } from '../element-ref.service';
import { ElementRefPopupComponent } from './element-ref-popup.component';

describe('ElementRefPopupComponent', () => {
  let component: ElementRefPopupComponent;
  let fixture: ComponentFixture<ElementRefPopupComponent>;
  let mockElementRefService: {
    searchElements: ReturnType<typeof vi.fn>;
    setSearchQuery: ReturnType<typeof vi.fn>;
    formatElementType: ReturnType<typeof vi.fn>;
  };

  const mockResults: ElementSearchResult[] = [
    {
      element: {
        id: 'elem-1',
        name: 'Character One',
        type: ElementType.Worldbuilding,
      },
      icon: 'person',
      path: '/Characters',
      score: 100,
    },
    {
      element: {
        id: 'elem-2',
        name: 'Location Alpha',
        type: ElementType.Worldbuilding,
      },
      icon: 'location_on',
      path: '/Locations',
      score: 90,
    },
    {
      element: {
        id: 'elem-3',
        name: 'Chapter 1',
        type: ElementType.Item,
      },
      icon: 'description',
      path: '/Manuscript',
      score: 80,
    },
  ];

  beforeEach(async () => {
    mockElementRefService = {
      searchElements: vi.fn().mockReturnValue([]),
      setSearchQuery: vi.fn(),
      formatElementType: vi.fn((type: ElementType) => type.toLowerCase()),
    };

    await TestBed.configureTestingModule({
      imports: [
        ElementRefPopupComponent,
        FormsModule,
        MatIconModule,
        MatInputModule,
        MatListModule,
        NoopAnimationsModule,
      ],
      providers: [
        { provide: ElementRefService, useValue: mockElementRefService },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementRefPopupComponent);
    component = fixture.componentInstance;
    // Set required inputs
    fixture.componentRef.setInput('position', { x: 100, y: 200 });
  });

  describe('Component Initialization', () => {
    it('should create the component', () => {
      fixture.detectChanges();
      expect(component).toBeTruthy();
    });

    it('should position popup at provided coordinates', () => {
      fixture.componentRef.setInput('position', { x: 150, y: 300 });
      fixture.detectChanges();

      const popup = fixture.nativeElement.querySelector('.element-ref-popup');
      expect(popup.style.left).toBe('150px');
      expect(popup.style.top).toBe('300px');
    });

    it('should focus search input after view init', async () => {
      fixture.detectChanges();
      await new Promise(resolve => setTimeout(resolve, 10));

      const searchInput = fixture.nativeElement.querySelector(
        '[data-testid="element-ref-search-input"]'
      );
      expect(document.activeElement).toBe(searchInput);
    });

    it('should set initial query from input', () => {
      fixture.componentRef.setInput('initialQuery', 'test');
      fixture.detectChanges();

      expect(component.query()).toBe('test');
    });

    it('should show empty state initially', () => {
      mockElementRefService.searchElements.mockReturnValue([]);
      fixture.detectChanges();

      const noResults = fixture.nativeElement.querySelector(
        '[data-testid="element-ref-no-results"]'
      );
      expect(noResults).toBeTruthy();
      expect(noResults.textContent).toContain('Type to search elements');
    });
  });

  describe('Search Functionality', () => {
    it('should call searchElements when query changes', () => {
      fixture.detectChanges();
      mockElementRefService.searchElements.mockReturnValue(mockResults);

      const searchInput = fixture.nativeElement.querySelector(
        '[data-testid="element-ref-search-input"]'
      );
      searchInput.value = 'char';
      searchInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(mockElementRefService.searchElements).toHaveBeenCalledWith(
        'char',
        { limit: 8 }
      );
      expect(mockElementRefService.setSearchQuery).toHaveBeenCalledWith('char');
    });

    it('should display search results', () => {
      mockElementRefService.searchElements.mockReturnValue(mockResults);
      fixture.detectChanges();

      component.query.set('test');
      fixture.detectChanges();

      const resultItems = fixture.nativeElement.querySelectorAll(
        '[data-testid="element-ref-result-item"]'
      );
      expect(resultItems.length).toBe(3);
    });

    it('should show no results message when search returns empty', () => {
      mockElementRefService.searchElements.mockReturnValue([]);
      fixture.detectChanges();

      component.query.set('nonexistent');
      fixture.detectChanges();

      const noResults = fixture.nativeElement.querySelector(
        '[data-testid="element-ref-no-results"]'
      );
      expect(noResults).toBeTruthy();
      expect(noResults.textContent).toContain(
        'No elements match "nonexistent"'
      );
    });

    it('should display element icons in results', () => {
      mockElementRefService.searchElements.mockReturnValue(mockResults);
      fixture.detectChanges();

      component.query.set('char');
      fixture.detectChanges();

      const icons = fixture.nativeElement.querySelectorAll('.result-icon');
      expect(icons.length).toBe(3);
    });

    it('should display element paths in results', () => {
      mockElementRefService.searchElements.mockReturnValue(mockResults);
      fixture.detectChanges();

      component.query.set('test');
      fixture.detectChanges();

      const paths = fixture.nativeElement.querySelectorAll('.result-path');
      expect(paths.length).toBe(3);
      expect(paths[0].textContent).toBe('/Characters');
    });

    it('should not display path when result has no path', () => {
      const resultsWithoutPath: ElementSearchResult[] = [
        {
          element: {
            id: 'elem-1',
            name: 'Root Element',
            type: ElementType.Worldbuilding,
          },
          icon: 'person',
          path: '', // Empty path
          score: 100,
        },
      ];
      mockElementRefService.searchElements.mockReturnValue(resultsWithoutPath);
      fixture.detectChanges();

      component.query.set('root');
      fixture.detectChanges();

      const paths = fixture.nativeElement.querySelectorAll('.result-path');
      expect(paths.length).toBe(0);
    });

    it('should format element types', () => {
      mockElementRefService.searchElements.mockReturnValue(mockResults);
      fixture.detectChanges();

      component.query.set('test');
      fixture.detectChanges();

      expect(mockElementRefService.formatElementType).toHaveBeenCalled();
    });
  });

  describe('Keyboard Navigation', () => {
    beforeEach(() => {
      mockElementRefService.searchElements.mockReturnValue(mockResults);
      fixture.detectChanges();
      component.query.set('test');
      fixture.detectChanges();
    });

    it('should select first result by default', () => {
      expect(component.selectedIndex()).toBe(0);
    });

    it('should navigate down with ArrowDown key', () => {
      const popup = fixture.nativeElement.querySelector('.element-ref-popup');
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });

      popup.dispatchEvent(event);
      fixture.detectChanges();

      expect(component.selectedIndex()).toBe(1);
    });

    it('should navigate up with ArrowUp key', () => {
      component.selectedIndex.set(2);
      fixture.detectChanges();

      const popup = fixture.nativeElement.querySelector('.element-ref-popup');
      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });

      popup.dispatchEvent(event);
      fixture.detectChanges();

      expect(component.selectedIndex()).toBe(1);
    });

    it('should not navigate past last result', () => {
      component.selectedIndex.set(2);
      fixture.detectChanges();

      const popup = fixture.nativeElement.querySelector('.element-ref-popup');
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });

      popup.dispatchEvent(event);
      fixture.detectChanges();

      expect(component.selectedIndex()).toBe(2);
    });

    it('should not navigate before first result', () => {
      const popup = fixture.nativeElement.querySelector('.element-ref-popup');
      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });

      popup.dispatchEvent(event);
      fixture.detectChanges();

      expect(component.selectedIndex()).toBe(0);
    });

    it('should select result with Enter key', () => {
      const selectedSpy = vi.spyOn(component.selected, 'emit');

      const popup = fixture.nativeElement.querySelector('.element-ref-popup');
      const event = new KeyboardEvent('keydown', { key: 'Enter' });

      popup.dispatchEvent(event);

      expect(selectedSpy).toHaveBeenCalledWith(mockResults[0]);
    });

    it('should close with Escape key', () => {
      const closedSpy = vi.spyOn(component.closed, 'emit');

      const popup = fixture.nativeElement.querySelector('.element-ref-popup');
      const event = new KeyboardEvent('keydown', { key: 'Escape' });

      popup.dispatchEvent(event);

      expect(closedSpy).toHaveBeenCalled();
    });

    it('should prevent Tab key default behavior', () => {
      const popup = fixture.nativeElement.querySelector('.element-ref-popup');
      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      popup.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should reset selection when results change', () => {
      component.selectedIndex.set(2);
      fixture.detectChanges();

      // Simulate results changing
      mockElementRefService.searchElements.mockReturnValue([mockResults[0]]);
      component.query.set('different');
      fixture.detectChanges();

      expect(component.selectedIndex()).toBe(0);
    });
  });

  describe('Mouse Interaction', () => {
    beforeEach(() => {
      mockElementRefService.searchElements.mockReturnValue(mockResults);
      fixture.detectChanges();
      component.query.set('test');
      fixture.detectChanges();
    });

    it('should select result on click', () => {
      const selectedSpy = vi.spyOn(component.selected, 'emit');

      const resultItems = fixture.nativeElement.querySelectorAll(
        '[data-testid="element-ref-result-item"]'
      );
      resultItems[1].click();

      expect(selectedSpy).toHaveBeenCalledWith(mockResults[1]);
    });

    it('should update selected index on hover', () => {
      const resultItems = fixture.nativeElement.querySelectorAll(
        '[data-testid="element-ref-result-item"]'
      );

      resultItems[2].dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();

      expect(component.selectedIndex()).toBe(2);
    });

    it('should select result on Enter key press on item', () => {
      const selectedSpy = vi.spyOn(component.selected, 'emit');

      const resultItems = fixture.nativeElement.querySelectorAll(
        '[data-testid="element-ref-result-item"]'
      );
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
      });
      resultItems[1].dispatchEvent(enterEvent);

      expect(selectedSpy).toHaveBeenCalledWith(mockResults[1]);
    });

    it('should highlight selected result', () => {
      component.selectedIndex.set(1);
      fixture.detectChanges();

      const resultItems = fixture.nativeElement.querySelectorAll(
        '[data-testid="element-ref-result-item"]'
      );
      expect(resultItems[1].classList.contains('selected')).toBe(true);
      expect(resultItems[0].classList.contains('selected')).toBe(false);
    });
  });

  describe('Document Click Handler', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should close popup when clicking outside', () => {
      const closedSpy = vi.spyOn(component.closed, 'emit');

      // Simulate click outside the popup
      const event = new MouseEvent('mousedown', { bubbles: true });
      document.body.dispatchEvent(event);

      expect(closedSpy).toHaveBeenCalled();
    });

    it('should not close popup when clicking inside', () => {
      const closedSpy = vi.spyOn(component.closed, 'emit');

      // Simulate click inside the popup
      const popup = fixture.nativeElement.querySelector('.element-ref-popup');
      const event = new MouseEvent('mousedown', { bubbles: true });
      popup.dispatchEvent(event);

      expect(closedSpy).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      mockElementRefService.searchElements.mockReturnValue(mockResults);
      fixture.detectChanges();
      component.query.set('test');
      fixture.detectChanges();
    });

    it('should have correct ARIA attributes on popup', () => {
      const popup = fixture.nativeElement.querySelector('.element-ref-popup');
      expect(popup.getAttribute('role')).toBe('dialog');
      expect(popup.getAttribute('aria-label')).toBe('Element reference popup');
    });

    it('should have correct ARIA attributes on search input', () => {
      const input = fixture.nativeElement.querySelector(
        '[data-testid="element-ref-search-input"]'
      );
      expect(input.getAttribute('role')).toBe('combobox');
      expect(input.getAttribute('aria-label')).toBe('Search elements');
      expect(input.getAttribute('aria-controls')).toBe('element-ref-results');
    });

    it('should have correct ARIA attributes on results list', () => {
      const results = fixture.nativeElement.querySelector(
        '#element-ref-results'
      );
      expect(results.getAttribute('role')).toBe('listbox');
    });

    it('should have correct ARIA attributes on result items', () => {
      const resultItems = fixture.nativeElement.querySelectorAll(
        '[data-testid="element-ref-result-item"]'
      );
      expect(resultItems[0].getAttribute('role')).toBe('option');
      expect(resultItems[0].getAttribute('aria-selected')).toBe('true');
      expect(resultItems[1].getAttribute('aria-selected')).toBe('false');
    });
  });

  describe('selectResult method', () => {
    it('should emit selected event with result', () => {
      fixture.detectChanges();
      const selectedSpy = vi.spyOn(component.selected, 'emit');

      component.selectResult(mockResults[0]);

      expect(selectedSpy).toHaveBeenCalledWith(mockResults[0]);
    });
  });

  describe('formatType method', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should format document type', () => {
      mockElementRefService.formatElementType.mockReturnValue('item');
      const result = component.formatType(ElementType.Item);

      expect(mockElementRefService.formatElementType).toHaveBeenCalledWith(
        ElementType.Item
      );
      expect(result).toBe('item');
    });

    it('should format folder type', () => {
      mockElementRefService.formatElementType.mockReturnValue('folder');
      const result = component.formatType(ElementType.Folder);

      expect(mockElementRefService.formatElementType).toHaveBeenCalledWith(
        ElementType.Folder
      );
      expect(result).toBe('folder');
    });
  });

  describe('ngOnDestroy', () => {
    it('should complete without error', () => {
      fixture.detectChanges();
      expect(() => {
        component.ngOnDestroy();
      }).not.toThrow();
    });
  });

  describe('Keyboard hints display', () => {
    it('should display keyboard navigation hints', () => {
      fixture.detectChanges();

      const hints = fixture.nativeElement.querySelector('.popup-hints');
      expect(hints).toBeTruthy();
      expect(hints.textContent).toContain('↑↓');
      expect(hints.textContent).toContain('Navigate');
      expect(hints.textContent).toContain('Enter');
      expect(hints.textContent).toContain('Select');
      expect(hints.textContent).toContain('Esc');
      expect(hints.textContent).toContain('Cancel');
    });
  });

  describe('Enter key with no results', () => {
    it('should not emit selection when no results', () => {
      mockElementRefService.searchElements.mockReturnValue([]);
      fixture.detectChanges();

      const selectedSpy = vi.spyOn(component.selected, 'emit');
      const popup = fixture.nativeElement.querySelector('.element-ref-popup');
      const event = new KeyboardEvent('keydown', { key: 'Enter' });

      popup.dispatchEvent(event);

      expect(selectedSpy).not.toHaveBeenCalled();
    });
  });
});
