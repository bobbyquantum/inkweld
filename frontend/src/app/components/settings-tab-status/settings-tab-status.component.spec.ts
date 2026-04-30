import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsTabStatusComponent } from './settings-tab-status.component';

describe('SettingsTabStatusComponent', () => {
  let component: SettingsTabStatusComponent;
  let fixture: ComponentFixture<SettingsTabStatusComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsTabStatusComponent, NoopAnimationsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsTabStatusComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show loading spinner when isLoading is true', () => {
    fixture.componentRef.setInput('isLoading', true);
    fixture.detectChanges();

    const spinner = fixture.nativeElement.querySelector('mat-spinner');
    expect(spinner).toBeTruthy();
  });

  it('should hide loading spinner when isLoading is false', () => {
    fixture.componentRef.setInput('isLoading', false);
    fixture.detectChanges();

    const spinner = fixture.nativeElement.querySelector('mat-spinner');
    expect(spinner).toBeNull();
  });

  it('should show error message when error is set', () => {
    const errorMsg = 'Something went wrong';
    fixture.componentRef.setInput('error', errorMsg);
    fixture.detectChanges();

    const text = fixture.nativeElement.querySelector('p');
    expect(text).toBeTruthy();
    expect(text.textContent).toBe(errorMsg);
  });

  it('should show error icon when error is set', () => {
    fixture.componentRef.setInput('error', 'An error occurred');
    fixture.detectChanges();

    const icon = fixture.nativeElement.querySelector(
      '.empty mat-icon:first-child'
    );
    expect(icon).toBeTruthy();
    expect(icon.textContent.trim()).toBe('error_outline');
  });

  it('should hide error section when error is null', () => {
    fixture.componentRef.setInput('error', null);
    fixture.detectChanges();

    const errorDiv = fixture.nativeElement.querySelector('.empty p');
    expect(errorDiv).toBeNull();
  });

  it('should emit retry when retry button is clicked', () => {
    const retrySpy = vi.spyOn(component.retry, 'emit');
    fixture.componentRef.setInput('error', 'Retry test');
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button');
    button.click();

    expect(retrySpy).toHaveBeenCalledTimes(1);
  });

  it('should show both loading spinner and error when both are set', () => {
    fixture.componentRef.setInput('isLoading', true);
    fixture.componentRef.setInput('error', 'Error while loading');
    fixture.detectChanges();

    const spinner = fixture.nativeElement.querySelector('mat-spinner');
    const errorText = fixture.nativeElement.querySelector('p');

    expect(spinner).toBeTruthy();
    expect(errorText).toBeTruthy();
    expect(errorText.textContent).toBe('Error while loading');
  });
});
