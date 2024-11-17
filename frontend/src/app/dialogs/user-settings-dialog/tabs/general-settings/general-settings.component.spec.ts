import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ThemeOption, ThemeService } from '@themes/theme.service';
import { of } from 'rxjs';

import { GeneralSettingsComponent } from './general-settings.component';

jest.mock('@themes/theme.service');

describe('GeneralSettingsComponent', () => {
  let component: GeneralSettingsComponent;
  let fixture: ComponentFixture<GeneralSettingsComponent>;
  let themeService: jest.Mocked<ThemeService>;

  beforeEach(async () => {
    themeService = jest.mocked(
      ThemeService
    ) as unknown as jest.Mocked<ThemeService>;

    // Mock the required methods
    themeService.getCurrentTheme = jest
      .fn()
      .mockReturnValue(of('light-theme' as ThemeOption));
    themeService.update = jest.fn();

    await TestBed.configureTestingModule({
      imports: [GeneralSettingsComponent, NoopAnimationsModule],
      providers: [{ provide: ThemeService, useValue: themeService }],
    }).compileComponents();

    fixture = TestBed.createComponent(GeneralSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
