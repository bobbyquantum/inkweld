import { Component, Input, type TemplateRef, ViewChild } from '@angular/core';

/**
 * Tab panel component for use with AriaTabsComponent.
 * Use this to wrap content that should be shown when a tab is selected.
 *
 * @example
 * ```html
 * <app-aria-tabs [tabs]="tabs" [(selectedIndex)]="selectedTab">
 *   <app-aria-tab-panel key="tab1">
 *     <p>Content for tab 1</p>
 *   </app-aria-tab-panel>
 *   <app-aria-tab-panel key="tab2">
 *     <p>Content for tab 2</p>
 *   </app-aria-tab-panel>
 * </app-aria-tabs>
 * ```
 */
@Component({
  selector: 'app-aria-tab-panel',
  templateUrl: './aria-tab-panel.component.html',
})
export class AriaTabPanelComponent {
  /** Key that matches the tab's key in AriaTabConfig */
  @Input({ required: true }) key!: string;

  @ViewChild('content', { static: true })
  contentTemplate!: TemplateRef<unknown>;
}
