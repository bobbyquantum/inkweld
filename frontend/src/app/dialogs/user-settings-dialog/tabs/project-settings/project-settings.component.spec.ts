import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { SettingsService } from '@services/settings.service';

import { ProjectSettingsComponent } from './project-settings.component';

describe('ProjectSettingsComponent', () => {
  // Updated
  let component: ProjectSettingsComponent; // Updated
  let fixture: ComponentFixture<ProjectSettingsComponent>; // Updated
  let settingsService: SettingsService;
  let localStorageMock: { [key: string]: string };

  beforeEach(async () => {
    localStorageMock = {};

    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => localStorageMock[key] || null,
        setItem: (key: string, value: string) => {
          localStorageMock[key] = value;
        },
        removeItem: (key: string) => {
          delete localStorageMock[key];
        },
        clear: () => {
          localStorageMock = {};
        },
      },
      writable: true,
    });

    await TestBed.configureTestingModule({
      imports: [
        ProjectSettingsComponent, // Updated
        FormsModule,
        MatCheckboxModule,
        MatFormFieldModule, // Added
      ],
      providers: [provideZonelessChangeDetection(), SettingsService],
    }).compileComponents();

    settingsService = TestBed.inject(SettingsService);
    fixture = TestBed.createComponent(ProjectSettingsComponent); // Updated
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Updated tests for zenModeFullscreen
  describe('zenModeFullscreen', () => {
    it('should return default value (true) when setting is not set', () => {
      expect(component.zenModeFullscreen).toBe(true); // Updated default
      expect(localStorageMock['userSettings']).toBeUndefined();
    });

    it('should return stored value when setting exists', () => {
      // Store setting directly in localStorage
      localStorageMock['userSettings'] = JSON.stringify({
        zenModeFullscreen: false, // Test with non-default
      });
      // Re-initialize component to pick up localStorage change before ngOnInit
      fixture = TestBed.createComponent(ProjectSettingsComponent);
      component = fixture.componentInstance;
      settingsService = TestBed.inject(SettingsService); // Re-inject service
      fixture.detectChanges();
      expect(component.zenModeFullscreen).toBe(false); // Updated check
    });

    it('should update setting when value is set', () => {
      component.zenModeFullscreen = false; // Set to non-default
      expect(settingsService.getSetting('zenModeFullscreen', true)).toBe(
        false // Updated check
      );
      expect(JSON.parse(localStorageMock['userSettings'])).toEqual({
        zenModeFullscreen: false, // Updated check
      });
    });

    it('should reset to default (true) when non-boolean value is set', () => {
      // @ts-expect-error Testing invalid type
      component.zenModeFullscreen = 'invalid';
      expect(settingsService.getSetting('zenModeFullscreen', true)).toBe(
        true // Updated check (should reset to default)
      );
      expect(JSON.parse(localStorageMock['userSettings'])).toEqual({
        zenModeFullscreen: true, // Updated check (should reset to default)
      });
    });
  });
});
