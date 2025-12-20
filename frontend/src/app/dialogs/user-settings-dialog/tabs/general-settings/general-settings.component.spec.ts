import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { ThemeOption, ThemeService } from '@themes/theme.service';
import { of } from 'rxjs';
import { MockedObject, vi } from 'vitest';

import { GeneralSettingsComponent } from './general-settings.component';

describe('GeneralSettingsComponent', () => {
  let component: GeneralSettingsComponent;
  let fixture: ComponentFixture<GeneralSettingsComponent>;
  let mockThemeService: MockedObject<ThemeService>;

  beforeEach(async () => {
    // Create mocks for the required services
    mockThemeService = {
      getCurrentTheme: vi
        .fn()
        .mockReturnValue(of('light-theme' as ThemeOption)),
      update: vi.fn(),
    } as unknown as MockedObject<ThemeService>;

    await TestBed.configureTestingModule({
      imports: [
        FormsModule,
        MatFormFieldModule,
        MatSelectModule,
        GeneralSettingsComponent,
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ThemeService, useValue: mockThemeService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GeneralSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Theme handling', () => {
    it('should initialize with the theme from the ThemeService', () => {
      expect(mockThemeService.getCurrentTheme).toHaveBeenCalled();
      expect(component.selectedTheme).toBe('light-theme');
    });

    it('should update the theme when selection changes', () => {
      component.selectedTheme = 'dark-theme';
      component.onThemeChange();
      expect(mockThemeService.update).toHaveBeenCalledWith('dark-theme');
    });

    it('should handle system theme option', () => {
      component.selectedTheme = 'system';
      component.onThemeChange();
      expect(mockThemeService.update).toHaveBeenCalledWith('system');
    });
  });

  it('should unsubscribe from theme on destroy', () => {
    const unsubscribeSpy = vi.fn();
    component['themeSubscription'] = { unsubscribe: unsubscribeSpy } as any;

    component.ngOnDestroy();

    expect(unsubscribeSpy).toHaveBeenCalled();
  });

  it('should not error when destroying without subscription', () => {
    component['themeSubscription'] = undefined as any;

    expect(() => {
      component.ngOnDestroy();
    }).not.toThrow();
  });
});
