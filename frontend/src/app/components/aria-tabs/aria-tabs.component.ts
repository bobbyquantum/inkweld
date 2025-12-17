import { Tab, TabList, Tabs } from '@angular/aria/tabs';
import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ContentChildren,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  QueryList,
  signal,
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
export class AriaTabsComponent implements AfterViewInit {
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
    // Initial scroll state check
    setTimeout(() => this.updateScrollState(), 0);
  }

  /** Handle tab selection */
  onTabSelect(index: number): void {
    if (this.tabs[index]?.disabled) return;
    this.selectedIndex = index;
    this.selectedIndexChange.emit(index);
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
}
