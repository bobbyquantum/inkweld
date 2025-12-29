import {
  Component,
  provideZonelessChangeDetection,
  ViewChild,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { AriaTabPanelComponent } from './aria-tab-panel.component';
import { AriaTabConfig, AriaTabsComponent } from './aria-tabs.component';

// Test host component to wrap AriaTabsComponent with projected content
@Component({
  standalone: true,
  imports: [AriaTabsComponent, AriaTabPanelComponent],
  template: `
    <app-aria-tabs
      [tabs]="tabs"
      [selectedIndex]="selectedIndex"
      [showScrollArrows]="showScrollArrows"
      (selectedIndexChange)="onIndexChange($event)">
      <app-aria-tab-panel key="overview">
        <p data-testid="overview-content">Overview content</p>
      </app-aria-tab-panel>
      <app-aria-tab-panel key="details">
        <p data-testid="details-content">Details content</p>
      </app-aria-tab-panel>
      <app-aria-tab-panel key="settings">
        <p data-testid="settings-content">Settings content</p>
      </app-aria-tab-panel>
      <div tabBarActions>
        <button data-testid="action-button">Action</button>
      </div>
    </app-aria-tabs>
  `,
})
class TestHostComponent {
  @ViewChild(AriaTabsComponent) tabsComponent!: AriaTabsComponent;

  tabs: AriaTabConfig[] = [
    { key: 'overview', label: 'Overview', icon: 'info' },
    { key: 'details', label: 'Details' },
    { key: 'settings', label: 'Settings', disabled: true },
  ];

  selectedIndex = 0;
  showScrollArrows = true;
  lastSelectedIndex = -1;

  onIndexChange(index: number): void {
    this.lastSelectedIndex = index;
  }
}

describe('AriaTabsComponent', () => {
  let component: AriaTabsComponent;
  let fixture: ComponentFixture<AriaTabsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AriaTabsComponent, NoopAnimationsModule],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(AriaTabsComponent);
    component = fixture.componentInstance;
    component.tabs = [
      { key: 'tab1', label: 'Tab 1' },
      { key: 'tab2', label: 'Tab 2' },
    ];
    fixture.detectChanges();
  });

  describe('Standalone component', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should initialize with default values', () => {
      expect(component.selectedIndex).toBe(0);
      expect(component.showScrollArrows).toBe(true);
      expect(component.canScrollLeft()).toBe(false);
      expect(component.canScrollRight()).toBe(false);
    });

    it('should render tabs from input', () => {
      const tabButtons = fixture.nativeElement.querySelectorAll('.tab-button');
      expect(tabButtons.length).toBe(2);
    });

    it('should display tab labels', () => {
      const labels = fixture.nativeElement.querySelectorAll('.tab-label');
      expect(labels[0].textContent).toBe('Tab 1');
      expect(labels[1].textContent).toBe('Tab 2');
    });
  });

  describe('Tab selection', () => {
    it('should emit selectedIndexChange when tab is clicked', () => {
      const emitSpy = vi.spyOn(component.selectedIndexChange, 'emit');

      component.onTabSelect(1);

      expect(emitSpy).toHaveBeenCalledWith(1);
    });

    it('should update selectedIndex when tab is clicked', () => {
      component.onTabSelect(1);

      expect(component.selectedIndex).toBe(1);
    });

    it('should not emit when disabled tab is clicked', () => {
      component.tabs = [
        { key: 'tab1', label: 'Tab 1' },
        { key: 'tab2', label: 'Tab 2', disabled: true },
      ];
      const emitSpy = vi.spyOn(component.selectedIndexChange, 'emit');

      component.onTabSelect(1);

      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should not update selectedIndex when disabled tab is clicked', () => {
      component.tabs = [
        { key: 'tab1', label: 'Tab 1' },
        { key: 'tab2', label: 'Tab 2', disabled: true },
      ];
      component.selectedIndex = 0;

      component.onTabSelect(1);

      expect(component.selectedIndex).toBe(0);
    });
  });

  describe('Tab icons', () => {
    it('should render icon when tab has icon property', () => {
      // Create fresh fixture for icon test
      const iconFixture = TestBed.createComponent(AriaTabsComponent);
      const iconComponent = iconFixture.componentInstance;
      iconComponent.tabs = [{ key: 'tab1', label: 'Tab 1', icon: 'home' }];
      iconFixture.detectChanges();

      const icon = iconFixture.nativeElement.querySelector('.tab-icon');
      expect(icon).toBeTruthy();
      expect(icon.textContent.trim()).toBe('home');
    });

    it('should not render icon when tab has no icon property', () => {
      // Uses default tabs from beforeEach which have no icons
      const icon = fixture.nativeElement.querySelector('.tab-icon');
      expect(icon).toBeFalsy();
    });
  });

  describe('Scroll functionality', () => {
    it('should call updateScrollState and scrollToActiveTab after view init', async () => {
      const updateSpy = vi.spyOn(component, 'updateScrollState');
      const scrollToActiveSpy = vi.spyOn(component, 'scrollToActiveTab');

      component.ngAfterViewInit();
      // Wait for setTimeout to execute
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(updateSpy).toHaveBeenCalled();
      expect(scrollToActiveSpy).toHaveBeenCalled();
    });

    it('should call scrollToActiveTab when selectedIndex changes via ngOnChanges', async () => {
      const scrollToActiveSpy = vi.spyOn(component, 'scrollToActiveTab');

      component.ngOnChanges({
        selectedIndex: {
          currentValue: 1,
          previousValue: 0,
          firstChange: false,
          isFirstChange: () => false,
        },
      });

      // Wait for setTimeout to execute
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(scrollToActiveSpy).toHaveBeenCalled();
    });

    it('should call updateScrollState when tabs change via ngOnChanges', async () => {
      const updateSpy = vi.spyOn(component, 'updateScrollState');

      component.ngOnChanges({
        tabs: {
          currentValue: [{ key: 'new', label: 'New' }],
          previousValue: [],
          firstChange: false,
          isFirstChange: () => false,
        },
      });

      // Wait for setTimeout to execute
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(updateSpy).toHaveBeenCalled();
    });

    it('should call scrollToActiveTab when tab is selected via onTabSelect', async () => {
      const scrollToActiveSpy = vi.spyOn(component, 'scrollToActiveTab');

      component.onTabSelect(1);

      // Wait for setTimeout to execute
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(scrollToActiveSpy).toHaveBeenCalled();
    });

    it('should not update scroll state if showScrollArrows is false', () => {
      component.showScrollArrows = false;

      component.updateScrollState();

      expect(component.canScrollLeft()).toBe(false);
      expect(component.canScrollRight()).toBe(false);
    });

    it('should handle missing tabNavBar gracefully in updateScrollState', () => {
      component.showScrollArrows = true;
      // @ts-expect-error Testing undefined case
      component.tabNavBar = undefined;

      expect(() => component.updateScrollState()).not.toThrow();
    });

    it('should call updateScrollState on scroll event', () => {
      const updateSpy = vi.spyOn(component, 'updateScrollState');

      component.onTabsScroll();

      expect(updateSpy).toHaveBeenCalled();
    });

    it('should scroll left when scrollLeft is called', () => {
      const scrollBySpy = vi.fn();
      component.tabNavBar = {
        nativeElement: { scrollBy: scrollBySpy },
      } as unknown as typeof component.tabNavBar;

      component.scrollLeft();

      expect(scrollBySpy).toHaveBeenCalledWith({
        left: -150,
        behavior: 'smooth',
      });
    });

    it('should scroll right when scrollRight is called', () => {
      const scrollBySpy = vi.fn();
      component.tabNavBar = {
        nativeElement: { scrollBy: scrollBySpy },
      } as unknown as typeof component.tabNavBar;

      component.scrollRight();

      expect(scrollBySpy).toHaveBeenCalledWith({
        left: 150,
        behavior: 'smooth',
      });
    });

    it('should handle missing tabNavBar gracefully in scrollLeft', () => {
      // @ts-expect-error Testing undefined case
      component.tabNavBar = undefined;

      expect(() => component.scrollLeft()).not.toThrow();
    });

    it('should handle missing tabNavBar gracefully in scrollRight', () => {
      // @ts-expect-error Testing undefined case
      component.tabNavBar = undefined;

      expect(() => component.scrollRight()).not.toThrow();
    });

    it('should scroll to active tab when it is out of view on the left', () => {
      const scrollBySpy = vi.fn();
      const mockTabButton = {
        getBoundingClientRect: () => ({ left: 50, right: 150 }),
      };
      component.tabs = [
        { key: 'tab1', label: 'Tab 1' },
        { key: 'tab2', label: 'Tab 2' },
      ];
      component.selectedIndex = 0;
      component.tabNavBar = {
        nativeElement: {
          scrollBy: scrollBySpy,
          scrollLeft: 0,
          scrollWidth: 500,
          clientWidth: 300,
          getBoundingClientRect: () => ({ left: 100, right: 400 }),
          querySelector: () => mockTabButton,
        },
      } as unknown as typeof component.tabNavBar;

      component.scrollToActiveTab();

      // Tab left (50) < container left (100), should scroll left
      expect(scrollBySpy).toHaveBeenCalledWith({
        left: expect.any(Number),
        behavior: 'smooth',
      });
      // Should scroll by negative amount (to the left)
      expect(scrollBySpy.mock.calls[0][0].left).toBeLessThan(0);
    });

    it('should scroll to active tab when it is out of view on the right', () => {
      const scrollBySpy = vi.fn();
      const mockTabButton = {
        getBoundingClientRect: () => ({ left: 350, right: 450 }),
      };
      component.tabs = [
        { key: 'tab1', label: 'Tab 1' },
        { key: 'tab2', label: 'Tab 2' },
      ];
      component.selectedIndex = 1;
      component.tabNavBar = {
        nativeElement: {
          scrollBy: scrollBySpy,
          scrollLeft: 0,
          scrollWidth: 500,
          clientWidth: 300,
          getBoundingClientRect: () => ({ left: 100, right: 400 }),
          querySelector: () => mockTabButton,
        },
      } as unknown as typeof component.tabNavBar;

      component.scrollToActiveTab();

      // Tab right (450) > container right (400), should scroll right
      expect(scrollBySpy).toHaveBeenCalledWith({
        left: expect.any(Number),
        behavior: 'smooth',
      });
      // Should scroll by positive amount (to the right)
      expect(scrollBySpy.mock.calls[0][0].left).toBeGreaterThan(0);
    });

    it('should not scroll when active tab is already visible', () => {
      const scrollBySpy = vi.fn();
      const mockTabButton = {
        getBoundingClientRect: () => ({ left: 150, right: 250 }),
      };
      component.tabs = [
        { key: 'tab1', label: 'Tab 1' },
        { key: 'tab2', label: 'Tab 2' },
      ];
      component.selectedIndex = 0;
      component.tabNavBar = {
        nativeElement: {
          scrollBy: scrollBySpy,
          scrollLeft: 0,
          scrollWidth: 500,
          clientWidth: 300,
          getBoundingClientRect: () => ({ left: 100, right: 400 }),
          querySelector: () => mockTabButton,
        },
      } as unknown as typeof component.tabNavBar;

      component.scrollToActiveTab();

      // Tab is within view, should not scroll
      expect(scrollBySpy).not.toHaveBeenCalled();
    });

    it('should handle missing tabNavBar gracefully in scrollToActiveTab', () => {
      // @ts-expect-error Testing undefined case
      component.tabNavBar = undefined;

      expect(() => component.scrollToActiveTab()).not.toThrow();
    });

    it('should handle missing active tab button gracefully', () => {
      component.tabs = [{ key: 'tab1', label: 'Tab 1' }];
      component.selectedIndex = 0;
      component.tabNavBar = {
        nativeElement: {
          scrollBy: vi.fn(),
          scrollLeft: 0,
          scrollWidth: 500,
          clientWidth: 300,
          getBoundingClientRect: () => ({ left: 100, right: 400 }),
          querySelector: () => null, // No matching element
        },
      } as unknown as typeof component.tabNavBar;

      expect(() => component.scrollToActiveTab()).not.toThrow();
    });

    it('should detect canScrollLeft when scrollLeft > 0', () => {
      component.showScrollArrows = true;
      component.tabNavBar = {
        nativeElement: {
          scrollLeft: 100,
          scrollWidth: 500,
          clientWidth: 300,
        },
      } as unknown as typeof component.tabNavBar;

      component.updateScrollState();

      expect(component.canScrollLeft()).toBe(true);
    });

    it('should detect canScrollRight when more content is available', () => {
      component.showScrollArrows = true;
      component.tabNavBar = {
        nativeElement: {
          scrollLeft: 0,
          scrollWidth: 500,
          clientWidth: 300,
        },
      } as unknown as typeof component.tabNavBar;

      component.updateScrollState();

      expect(component.canScrollRight()).toBe(true);
    });

    it('should not detect canScrollRight when at end of scroll', () => {
      component.showScrollArrows = true;
      component.tabNavBar = {
        nativeElement: {
          scrollLeft: 200,
          scrollWidth: 500,
          clientWidth: 300,
        },
      } as unknown as typeof component.tabNavBar;

      component.updateScrollState();

      expect(component.canScrollRight()).toBe(false);
    });
  });

  describe('Accessibility attributes', () => {
    it('should set data-testid on tab buttons', () => {
      // Create fresh fixture for this test
      const testFixture = TestBed.createComponent(AriaTabsComponent);
      const testComponent = testFixture.componentInstance;
      testComponent.tabs = [{ key: 'my-tab', label: 'My Tab' }];
      testFixture.detectChanges();

      const button = testFixture.nativeElement.querySelector(
        '[data-testid="aria-tab-my-tab"]'
      );
      expect(button).toBeTruthy();
    });

    it('should set aria-disabled on disabled tabs', () => {
      // Create fresh fixture for this test
      const testFixture = TestBed.createComponent(AriaTabsComponent);
      const testComponent = testFixture.componentInstance;
      testComponent.tabs = [{ key: 'tab1', label: 'Tab 1', disabled: true }];
      testFixture.detectChanges();

      const button = testFixture.nativeElement.querySelector('.tab-button');
      expect(button.getAttribute('aria-disabled')).toBe('true');
    });

    it('should not set aria-disabled on enabled tabs', () => {
      // Uses default tabs from beforeEach
      const button = fixture.nativeElement.querySelector('.tab-button');
      // When disabled is false, aria-disabled should be null (not present) or 'false'
      const ariaDisabled = button.getAttribute('aria-disabled');
      expect(ariaDisabled === null || ariaDisabled === 'false').toBe(true);
    });
  });
});

describe('AriaTabsComponent with host', () => {
  let hostComponent: TestHostComponent;
  let hostFixture: ComponentFixture<TestHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent, NoopAnimationsModule],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    hostFixture = TestBed.createComponent(TestHostComponent);
    hostComponent = hostFixture.componentInstance;
    hostFixture.detectChanges();
  });

  it('should create with host component', () => {
    expect(hostComponent.tabsComponent).toBeTruthy();
  });

  it('should project tab panels', () => {
    expect(hostComponent.tabsComponent.tabPanels.length).toBe(3);
  });

  it('should project tabBarActions content', () => {
    const actionButton = hostFixture.nativeElement.querySelector(
      '[data-testid="action-button"]'
    );
    expect(actionButton).toBeTruthy();
  });

  it('should show active panel content', () => {
    const overviewContent = hostFixture.nativeElement.querySelector(
      '[data-testid="overview-content"]'
    );
    expect(overviewContent).toBeTruthy();

    const activePanel =
      hostFixture.nativeElement.querySelector('.tab-panel.active');
    expect(activePanel.getAttribute('aria-hidden')).toBe('false');
  });

  it('should update active panel when selectedIndex changes', () => {
    // Click the second tab to trigger selection change
    const tabButtons =
      hostFixture.nativeElement.querySelectorAll('.tab-button');
    tabButtons[1].click();
    hostFixture.detectChanges();

    const panels = hostFixture.nativeElement.querySelectorAll('.tab-panel');
    expect(panels[0].classList.contains('active')).toBe(false);
    expect(panels[1].classList.contains('active')).toBe(true);
  });

  it('should emit selectedIndexChange through host', () => {
    const tabButtons =
      hostFixture.nativeElement.querySelectorAll('.tab-button');
    tabButtons[1].click();
    hostFixture.detectChanges();

    expect(hostComponent.lastSelectedIndex).toBe(1);
  });

  it('should not change selection when clicking disabled tab', () => {
    const tabButtons =
      hostFixture.nativeElement.querySelectorAll('.tab-button');
    tabButtons[2].click(); // Settings tab (disabled)
    hostFixture.detectChanges();

    expect(hostComponent.lastSelectedIndex).toBe(-1); // Unchanged from initial
    expect(hostComponent.tabsComponent.selectedIndex).toBe(0);
  });

  it('should render scroll arrows when showScrollArrows is true and can scroll', () => {
    // Mock scrollable state
    hostComponent.tabsComponent.canScrollLeft.set(true);
    hostComponent.tabsComponent.canScrollRight.set(true);
    hostFixture.detectChanges();

    const leftArrow =
      hostFixture.nativeElement.querySelector('.scroll-arrow-left');
    const rightArrow = hostFixture.nativeElement.querySelector(
      '.scroll-arrow-right'
    );

    expect(leftArrow).toBeTruthy();
    expect(rightArrow).toBeTruthy();
  });

  it('should hide scroll arrows when showScrollArrows is false', async () => {
    hostComponent.showScrollArrows = false;
    await hostFixture.whenStable();

    const arrows = hostFixture.nativeElement.querySelectorAll('.scroll-arrow');
    expect(arrows.length).toBe(0);
  });

  it('should render icons for tabs that have them', () => {
    const icons = hostFixture.nativeElement.querySelectorAll('.tab-icon');
    expect(icons.length).toBe(1); // Only first tab has icon
    expect(icons[0].textContent.trim()).toBe('info');
  });
});
