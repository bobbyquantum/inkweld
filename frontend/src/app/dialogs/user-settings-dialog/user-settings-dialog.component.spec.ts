import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  provideZonelessChangeDetection,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { AccountSettingsComponent } from './tabs/account-settings/account-settings.component';
import { AppearanceSettingsComponent } from './tabs/appearance-settings/appearance-settings.component';
import { AuthorizedAppsComponent } from './tabs/authorized-apps/authorized-apps.component';
import { GeneralSettingsComponent } from './tabs/general-settings/general-settings.component';
import { ProjectSettingsComponent } from './tabs/project-settings/project-settings.component';
import { ProjectTreeSettingsComponent } from './tabs/project-tree-settings/project-tree-settings.component';
import {
  UserSettingsDialogComponent,
  type UserSettingsDialogData,
} from './user-settings-dialog.component';

// Stub each settings panel so the dialog's own template is exercised without
// pulling in the panels' services.
@Component({
  selector: 'app-account-settings',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '',
})
class MockAccountSettingsComponent {}

@Component({
  selector: 'app-general-settings',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '',
})
class MockGeneralSettingsComponent {}

@Component({
  selector: 'app-appearance-settings',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '',
})
class MockAppearanceSettingsComponent {}

@Component({
  selector: 'app-authorized-apps',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '',
})
class MockAuthorizedAppsComponent {}

@Component({
  selector: 'app-project-tree-settings',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '',
})
class MockProjectTreeSettingsComponent {}

@Component({
  selector: 'app-project-settings',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '',
})
class MockProjectSettingsComponent {}

// Order matches the nav list in the template.
const PANEL_SELECTORS = [
  'app-account-settings',
  'app-general-settings',
  'app-appearance-settings',
  'app-authorized-apps',
  'app-project-tree-settings',
  'app-project-settings',
];

describe('UserSettingsDialogComponent', () => {
  let component: UserSettingsDialogComponent;
  let fixture: ComponentFixture<UserSettingsDialogComponent>;
  let breakpoint$: BehaviorSubject<{ matches: boolean }>;

  const tabs = () =>
    fixture.debugElement
      .queryAll(By.css('[role="tab"]'))
      .map(de => de.nativeElement as HTMLElement);

  const renderedPanels = () =>
    PANEL_SELECTORS.filter(
      selector => fixture.debugElement.query(By.css(selector)) !== null
    );

  async function createDialog(data?: UserSettingsDialogData): Promise<void> {
    breakpoint$ = new BehaviorSubject<{ matches: boolean }>({ matches: false });

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), UserSettingsDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: BreakpointObserver,
          useValue: { observe: vi.fn().mockReturnValue(breakpoint$) },
        },
        ...(data ? [{ provide: MAT_DIALOG_DATA, useValue: data }] : []),
      ],
    })
      .overrideComponent(UserSettingsDialogComponent, {
        remove: {
          imports: [
            AccountSettingsComponent,
            GeneralSettingsComponent,
            AppearanceSettingsComponent,
            AuthorizedAppsComponent,
            ProjectTreeSettingsComponent,
            ProjectSettingsComponent,
          ],
        },
        add: {
          imports: [
            MockAccountSettingsComponent,
            MockGeneralSettingsComponent,
            MockAppearanceSettingsComponent,
            MockAuthorizedAppsComponent,
            MockProjectTreeSettingsComponent,
            MockProjectSettingsComponent,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(UserSettingsDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => createDialog());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with account category selected', () => {
    expect(component.selectedCategory).toBe('account');
    expect(renderedPanels()).toEqual(['app-account-settings']);
  });

  it('should change category when selectCategory is called', () => {
    component.selectCategory('project');
    expect(component.selectedCategory).toBe('project');
    expect(component.previousCategory).toBe('account');
  });

  it('should return correct animation classes when moving from account to project', () => {
    component.selectCategory('project');
    expect(component.getEnterAnimationClass()).toBe('slide-from-bottom');
    expect(component.getLeaveAnimationClass()).toBe('slide-to-top');
  });

  it('should return correct animation classes when moving from project to account', () => {
    component.selectCategory('project');
    component.selectCategory('account');
    expect(component.getEnterAnimationClass()).toBe('slide-from-top');
    expect(component.getLeaveAnimationClass()).toBe('slide-to-bottom');
  });

  it('should render a nav tab for every panel', () => {
    expect(tabs()).toHaveLength(PANEL_SELECTORS.length);
  });

  it('should switch panels when a nav tab is clicked', async () => {
    for (const [index, selector] of PANEL_SELECTORS.entries()) {
      tabs()[index].click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(renderedPanels()).toEqual([selector]);
    }
  });

  it('should switch panels when Enter is pressed on a nav tab', async () => {
    tabs()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.selectedCategory).toBe('appearance');
    expect(renderedPanels()).toEqual(['app-appearance-settings']);
  });

  it('should mark only the selected nav tab as aria-selected', async () => {
    expect(tabs().map(tab => tab.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
      'false',
    ]);

    tabs()[5].click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(tabs().map(tab => tab.getAttribute('aria-selected'))).toEqual([
      'false',
      'false',
      'false',
      'false',
      'false',
      'true',
    ]);
    expect(tabs()[5].classList).toContain('active');
    expect(tabs()[0].classList).not.toContain('active');
  });

  it('should open on the category passed in the dialog data', async () => {
    TestBed.resetTestingModule();
    await createDialog({ selectedCategory: 'authorized-apps' });

    expect(component.selectedCategory).toBe('authorized-apps');
    expect(renderedPanels()).toEqual(['app-authorized-apps']);
    expect(tabs()[3].getAttribute('aria-selected')).toBe('true');
  });

  it('should switch to the mobile layout when the breakpoint matches', async () => {
    const container = () =>
      fixture.debugElement.query(By.css('.settings-container'))
        .nativeElement as HTMLElement;
    expect(container().classList).not.toContain('mobile');

    breakpoint$.next({ matches: true });
    await fixture.whenStable();

    expect(component.isMobile()).toBe(true);
    expect(container().classList).toContain('mobile');
  });

  it('should have a close button', () => {
    const closeButton = fixture.debugElement.query(
      By.css('[data-testid="settings-close-button"]')
    );
    expect(closeButton).toBeTruthy();
    expect(closeButton.attributes['mat-dialog-close']).toBeDefined();
  });
});
