import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { SettingsService } from '@services/core/settings.service';
import { StorageContextService } from '@services/core/storage-context.service';

import { ProjectTreeSettingsComponent } from './project-tree-settings.component';

describe('ProjectTreeSettingsComponent', () => {
  let component: ProjectTreeSettingsComponent;
  let fixture: ComponentFixture<ProjectTreeSettingsComponent>;
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
      providers: [
        provideZonelessChangeDetection(),
        SettingsService,
        {
          provide: StorageContextService,
          useValue: {
            prefixKey: (key: string) => key,
            prefixDbName: (key: string) => key,
            prefixDocumentId: (key: string) => key,
            getPrefix: () => 'local:',
            getPrefixForConfig: () => 'local:',
            getActiveConfig: () => null,
          },
        },
      ],
    }).compileComponents();

    settingsService = TestBed.inject(SettingsService);
    fixture = TestBed.createComponent(ProjectTreeSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('confirmElementMoves', () => {
    it('should return default value (false) when setting is not set', () => {
      expect(component.confirmElementMoves).toBe(false);
      expect(localStorageMock['userSettings']).toBeUndefined();
    });

    it('should return stored value when setting exists', () => {
      // Store setting directly in localStorage
      localStorageMock['userSettings'] = JSON.stringify({
        confirmElementMoves: true,
      });
      fixture.detectChanges();
      expect(component.confirmElementMoves).toBe(true);
    });

    it('should update setting when value is set', () => {
      component.setConfirmElementMoves(true);
      expect(settingsService.getSetting('confirmElementMoves', false)).toBe(
        true
      );
      expect(JSON.parse(localStorageMock['userSettings'])).toEqual({
        confirmElementMoves: true,
      });
    });

    it('should not update setting when non-boolean value is set', () => {
      component.setConfirmElementMoves('invalid' as unknown as boolean);
      expect(settingsService.getSetting('confirmElementMoves', false)).toBe(
        false
      );
      expect(JSON.parse(localStorageMock['userSettings'])).toEqual({
        confirmElementMoves: false,
      });
    });
  });

  describe('showBreadcrumbs', () => {
    it('should default to true when setting is not set', () => {
      expect(component.showBreadcrumbs).toBe(true);
    });

    it('should reflect stored value when setting exists', () => {
      settingsService.setShowBreadcrumbs(false);
      expect(component.showBreadcrumbs).toBe(false);
    });

    it('should persist and update the signal when toggled', () => {
      component.setShowBreadcrumbs(false);
      expect(settingsService.showBreadcrumbs()).toBe(false);
      expect(JSON.parse(localStorageMock['userSettings']).showBreadcrumbs).toBe(
        false
      );

      component.setShowBreadcrumbs(true);
      expect(settingsService.showBreadcrumbs()).toBe(true);
      expect(JSON.parse(localStorageMock['userSettings']).showBreadcrumbs).toBe(
        true
      );
    });

    it('should treat non-boolean values as false', () => {
      component.setShowBreadcrumbs('invalid' as unknown as boolean);
      expect(settingsService.showBreadcrumbs()).toBe(false);
    });
  });
});
