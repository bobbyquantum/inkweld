import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ThemeService } from '@themes/theme.service';
import { describe, expect, it, vi } from 'vitest';

import { ThemeToggleComponent } from './theme-toggle.component';

describe('ThemeToggleComponent', () => {
  let component: ThemeToggleComponent;
  let fixture: ComponentFixture<ThemeToggleComponent>;
  let themeServiceMock: { update: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    themeServiceMock = {
      update: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ThemeToggleComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ThemeService, useValue: themeServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ThemeToggleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('onThemeChange', () => {
    it('should call themeService.update with light-theme', () => {
      component.onThemeChange('light-theme');
      expect(themeServiceMock.update).toHaveBeenCalledWith('light-theme');
    });

    it('should call themeService.update with dark-theme', () => {
      component.onThemeChange('dark-theme');
      expect(themeServiceMock.update).toHaveBeenCalledWith('dark-theme');
    });

    it('should call themeService.update with system', () => {
      component.onThemeChange('system');
      expect(themeServiceMock.update).toHaveBeenCalledWith('system');
    });
  });
});
