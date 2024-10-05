import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GeneralSettingsComponent } from './general-settings.component';
import { ThemeOption, ThemeService } from '@themes/theme.service';
import { of } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('GeneralSettingsComponent', () => {
  let component: GeneralSettingsComponent;
  let fixture: ComponentFixture<GeneralSettingsComponent>;
  let themeServiceMock: jasmine.SpyObj<ThemeService>;

  beforeEach(async () => {
    themeServiceMock = jasmine.createSpyObj('ThemeService', [
      'getCurrentTheme',
      'update',
    ]);
    themeServiceMock.getCurrentTheme.and.returnValue(
      of('light-theme' as ThemeOption)
    );

    await TestBed.configureTestingModule({
      imports: [GeneralSettingsComponent, NoopAnimationsModule],
      providers: [{ provide: ThemeService, useValue: themeServiceMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(GeneralSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
