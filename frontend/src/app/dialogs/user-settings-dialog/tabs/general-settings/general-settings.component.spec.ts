import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { UserService } from '@services/user.service';
import { ThemeOption, ThemeService } from '@themes/theme.service';
import { of, throwError } from 'rxjs';

import { GeneralSettingsComponent } from './general-settings.component';

// Mock URL.createObjectURL which isn't available in Jest environment
global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

describe('GeneralSettingsComponent', () => {
  let component: GeneralSettingsComponent;
  let fixture: ComponentFixture<GeneralSettingsComponent>;
  let mockThemeService: vi.Mocked<ThemeService>;
  let mockUserService: vi.Mocked<UserService>;

  beforeEach(async () => {
    // Create mocks for the required services
    mockThemeService = {
      getCurrentTheme: vi
        .fn()
        .mockReturnValue(of('light-theme' as ThemeOption)),
      update: vi.fn(),
    } as unknown as vi.Mocked<ThemeService>;

    mockUserService = {
      currentUser: vi.fn().mockReturnValue({
        username: 'testuser',
        name: 'Test User',
      }),
      getUserAvatar: vi
        .fn()
        .mockReturnValue(of(new Blob(['test'], { type: 'image/png' }))),
      uploadAvatar: vi.fn().mockReturnValue(of(void 0)),
      deleteAvatar: vi.fn().mockReturnValue(of(void 0)),
    } as unknown as vi.Mocked<UserService>;

    await TestBed.configureTestingModule({
      imports: [
        FormsModule,
        MatFormFieldModule,
        MatSelectModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        NoopAnimationsModule,
        GeneralSettingsComponent,
      ],
      providers: [
        { provide: ThemeService, useValue: mockThemeService },
        { provide: UserService, useValue: mockUserService },
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
  });

  describe('Avatar handling', () => {
    it('should load avatar on init', async () => {
      // Reset the spy call count
      mockUserService.getUserAvatar.mockClear();

      // Manually call loadAvatar to test it
      await component.loadAvatar();

      expect(mockUserService.currentUser).toHaveBeenCalled();
      expect(mockUserService.getUserAvatar).toHaveBeenCalledWith('testuser');
      expect(component.avatarUrl).toBe('blob:mock-url');
    });

    it('should handle avatar loading errors gracefully', async () => {
      // First, explicitly set the avatarUrl to null
      component.avatarUrl = null;

      // Now mock an error response from getUserAvatar
      mockUserService.getUserAvatar.mockReturnValueOnce(
        throwError(() => new Error('Network error'))
      );

      // Capture console.warn to prevent output during tests
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      await component.loadAvatar();

      // Verify error was logged
      expect(console.warn).toHaveBeenCalled();

      // Verify avatarUrl is still null as it should be
      expect(component.avatarUrl).toBeNull();
    });

    it('should upload avatar when file is selected', async () => {
      // Create a mock file and event
      const file = new File(['test'], 'test.png', { type: 'image/png' });
      const event = {
        target: {
          files: [file],
          value: 'test.png',
        },
      } as unknown as Event;

      await component.onFileSelected(event);

      expect(component.isUploadingAvatar).toBe(false);
      expect(mockUserService.uploadAvatar).toHaveBeenCalledWith(file);
      expect(mockUserService.getUserAvatar).toHaveBeenCalled();
    });

    it('should validate file size during upload', async () => {
      // Create a mock file that's too large (> 5MB)
      const largeFile = new File(
        [new ArrayBuffer(6 * 1024 * 1024)],
        'large.png',
        { type: 'image/png' }
      );
      const event = {
        target: {
          files: [largeFile],
          value: 'large.png',
        },
      } as unknown as Event;

      // Mock alert
      vi.spyOn(window, 'alert').mockImplementation(() => {});

      await component.onFileSelected(event);

      expect(window.alert).toHaveBeenCalledWith(
        'File is too large. Maximum size is 5MB.'
      );
      expect(mockUserService.uploadAvatar).not.toHaveBeenCalled();
    });

    it('should validate file type during upload', async () => {
      // Create a mock file with invalid type
      const invalidFile = new File(['test'], 'test.txt', {
        type: 'text/plain',
      });
      const event = {
        target: {
          files: [invalidFile],
          value: 'test.txt',
        },
      } as unknown as Event;

      // Mock alert
      vi.spyOn(window, 'alert').mockImplementation(() => {});

      await component.onFileSelected(event);

      expect(window.alert).toHaveBeenCalledWith(
        'Only image files are allowed.'
      );
      expect(mockUserService.uploadAvatar).not.toHaveBeenCalled();
    });

    it('should handle avatar upload errors', async () => {
      // Mock an error response for upload
      mockUserService.uploadAvatar.mockReturnValueOnce(
        throwError(() => new Error('Upload failed'))
      );

      const file = new File(['test'], 'test.png', { type: 'image/png' });
      const event = {
        target: {
          files: [file],
          value: 'test.png',
        },
      } as unknown as Event;

      // Mock console.error and alert
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(window, 'alert').mockImplementation(() => {});

      await component.onFileSelected(event);

      expect(console.error).toHaveBeenCalled();
      expect(window.alert).toHaveBeenCalledWith(
        'Failed to upload avatar. Please try again.'
      );
      expect(component.isUploadingAvatar).toBe(false);
    });

    it('should delete avatar when requested', async () => {
      component.avatarUrl = 'blob:test';

      await component.deleteAvatar();

      expect(mockUserService.deleteAvatar).toHaveBeenCalled();
      expect(component.avatarUrl).toBeNull();
    });

    it('should handle avatar deletion errors', async () => {
      // Mock an error response for deletion
      mockUserService.deleteAvatar.mockReturnValueOnce(
        throwError(() => new Error('Delete failed'))
      );

      // Mock console.error and alert
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(window, 'alert').mockImplementation(() => {});

      await component.deleteAvatar();

      expect(console.error).toHaveBeenCalled();
      expect(window.alert).toHaveBeenCalledWith(
        'Failed to delete avatar. Please try again.'
      );
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
