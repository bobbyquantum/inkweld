import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserSettingsDialogComponent } from './user-settings-dialog.component';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialogModule } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';

describe('UserSettingsDialogComponent', () => {
  let component: UserSettingsDialogComponent;
  let fixture: ComponentFixture<UserSettingsDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        UserSettingsDialogComponent,
        NoopAnimationsModule,
        MatDialogModule,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserSettingsDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with general category selected', () => {
    expect(component.selectedCategory).toBe('general');
  });

  it('should change category when selectCategory is called', () => {
    component.selectCategory('account');
    expect(component.selectedCategory).toBe('account');
    expect(component.previousCategory).toBe('general');
  });

  it('should return correct animation state', () => {
    component.selectCategory('account');
    const animationState = component.getAnimationState();
    expect(animationState.value).toBe('account');
    expect(animationState.params.enterTransform).toBe('100%');
    expect(animationState.params.leaveTransform).toBe('-100%');
  });

  it('should return correct animation state when moving from general to account', () => {
    component.selectCategory('account');
    const animationState = component.getAnimationState();
    expect(animationState.value).toBe('account');
    expect(animationState.params.enterTransform).toBe('100%');
    expect(animationState.params.leaveTransform).toBe('-100%');
  });

  it('should return correct animation state when moving from account to general', () => {
    component.selectCategory('account');
    component.selectCategory('general');
    const animationState = component.getAnimationState();
    expect(animationState.value).toBe('general');
    expect(animationState.params.enterTransform).toBe('-100%');
    expect(animationState.params.leaveTransform).toBe('100%');
  });

  it('should display correct content based on selected category', () => {
    component.selectCategory('general');
    fixture.detectChanges();
    expect(
      fixture.debugElement.query(By.css('app-general-settings'))
    ).toBeTruthy();

    component.selectCategory('account');
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('p'))).toBeTruthy();
    expect(
      fixture.debugElement.query(By.css('p')).nativeElement.textContent
    ).toContain('Account settings content goes here');
  });

  it('should have correct aria-selected attribute for nav items', () => {
    const navItems = fixture.debugElement.queryAll(By.css('a[mat-list-item]'));
    expect(navItems[0].attributes['aria-selected']).toBe('true');
    expect(navItems[1].attributes['aria-selected']).toBe('false');

    component.selectCategory('account');
    fixture.detectChanges();

    expect(navItems[0].attributes['aria-selected']).toBe('false');
    expect(navItems[1].attributes['aria-selected']).toBe('true');
  });

  it('should change category when nav item is clicked', () => {
    const navItems = fixture.debugElement.queryAll(By.css('a[mat-list-item]'));
    navItems[1].nativeElement.click();
    expect(component.selectedCategory).toBe('account');

    navItems[0].nativeElement.click();
    expect(component.selectedCategory).toBe('general');
  });

  it('should have a close button', () => {
    const closeButton = fixture.debugElement.query(
      By.css('button[mat-dialog-close]')
    );
    expect(closeButton).toBeTruthy();
    expect(closeButton.nativeElement.textContent).toContain('close');
  });
});
