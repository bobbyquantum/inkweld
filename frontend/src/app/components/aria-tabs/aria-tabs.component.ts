import { Tab, TabList, Tabs } from '@angular/aria/tabs';
import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ContentChildren,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  QueryList,
  signal,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AriaTabPanelComponent } from './aria-tab-panel.component';

/** Tab configuration for the aria-tabs component */
export interface AriaTabConfig {
  /** Unique key for the tab */
  key: string;
  /** Display label */
  label: string;
  /** Optional Material icon name */
  icon?: string;
  /** Whether the tab is disabled */
  disabled?: boolean;
}

@Component({
  selector: 'app-aria-tabs',
  standalone: true,
  imports: [CommonModule, Tabs, TabList, Tab, MatIconModule, MatButtonModule],
  templateUrl: './aria-tabs.component.html',
  styleUrl: './aria-tabs.component.scss',
})
export class AriaTabsComponent implements AfterViewInit, OnChanges {
  /** Array of tab configurations */
  @Input() tabs: AriaTabConfig[] = [];

  /** Currently selected tab index */
  @Input() selectedIndex = 0;

  /** Emits when selected tab changes */
  @Output() selectedIndexChange = new EventEmitter<number>();

  /** Optional: show scroll arrows when tabs overflow */
  @Input() showScrollArrows = true;

  /** Reference to the tab nav bar for scroll handling */
  @ViewChild('tabNavBar') tabNavBar!: ElementRef<HTMLElement>;

  /** Query for projected tab panels */
  @ContentChildren(AriaTabPanelComponent)
  tabPanels!: QueryList<AriaTabPanelComponent>;

  // Scroll state for arrow visibility
  canScrollLeft = signal(false);
  canScrollRight = signal(false);

  ngAfterViewInit(): void {
    // Initial scroll state check and scroll to active tab
    setTimeout(() => {
      this.updateScrollState();
      this.scrollToActiveTab();
    }, 0);
  }

  ngOnChanges(changes: SimpleChanges): void {
    // When selectedIndex changes from outside, scroll to reveal the tab
    if (changes['selectedIndex'] && !changes['selectedIndex'].firstChange) {
      setTimeout(() => this.scrollToActiveTab(), 0);
    }
    // When tabs array changes, update scroll state
    if (changes['tabs']) {
      setTimeout(() => this.updateScrollState(), 0);
    }
  }

  /** Handle tab selection */
  onTabSelect(index: number): void {
    if (this.tabs[index]?.disabled) return;
    this.selectedIndex = index;
    this.selectedIndexChange.emit(index);
    // Scroll to the newly selected tab
    setTimeout(() => this.scrollToActiveTab(), 0);
  }

  /** Check if scroll arrows should be visible */
  updateScrollState(): void {
    if (!this.showScrollArrows) return;
    const el = this.tabNavBar?.nativeElement;
    if (!el) return;

    const canLeft = el.scrollLeft > 0;
    const canRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 1;

    this.canScrollLeft.set(canLeft);
    this.canScrollRight.set(canRight);
  }

  /** Handle scroll event on the tab nav bar */
  onTabsScroll(): void {
    this.updateScrollState();
  }

  /** Scroll tabs left */
  scrollLeft(): void {
    const el = this.tabNavBar?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: -150, behavior: 'smooth' });
  }

  /** Scroll tabs right */
  scrollRight(): void {
    const el = this.tabNavBar?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: 150, behavior: 'smooth' });
  }

  /** Scroll to make the active tab visible */
  scrollToActiveTab(): void {
    const container = this.tabNavBar?.nativeElement;
    // Guard against destroyed DOM elements (can happen when setTimeout fires after test cleanup)
    if (!container || typeof container.querySelector !== 'function') return;

    const activeTabButton = container.querySelector(
      `[data-testid="aria-tab-${this.tabs[this.selectedIndex]?.key}"]`
    ) as HTMLElement;

    if (!activeTabButton) return;

    const containerRect = container.getBoundingClientRect();
    const tabRect = activeTabButton.getBoundingClientRect();

    // Check if tab is out of view on the left
    if (tabRect.left < containerRect.left) {
      const scrollAmount = tabRect.left - containerRect.left - 8; // 8px padding
      container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
    // Check if tab is out of view on the right
    else if (tabRect.right > containerRect.right) {
      const scrollAmount = tabRect.right - containerRect.right + 8; // 8px padding
      container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }

    // Update scroll state after scrolling
    setTimeout(() => this.updateScrollState(), 150);
  }
}
