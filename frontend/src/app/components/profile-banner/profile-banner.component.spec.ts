import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { LoggerService } from '@services/core/logger.service';
import { UserProfileService } from '@services/user/user-profile.service';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';

import { ProfileBannerComponent } from './profile-banner.component';

describe('ProfileBannerComponent', () => {
  let fixture: ComponentFixture<ProfileBannerComponent>;
  let profileService: ReturnType<typeof mockDeep<UserProfileService>>;
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  const setup = async (username = 'alice', version = 0) => {
    await TestBed.configureTestingModule({
      imports: [ProfileBannerComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: UserProfileService, useValue: profileService },
        { provide: LoggerService, useValue: mockDeep<LoggerService>() },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ProfileBannerComponent);
    fixture.componentRef.setInput('username', username);
    fixture.componentRef.setInput('version', version);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    profileService = mockDeep<UserProfileService>();
    profileService.getBanner.mockReturnValue(of(new Blob(['img'])));
    let counter = 0;
    createObjectURL = vi.fn(() => `blob:banner-${++counter}`);
    revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the banner and renders it from an object URL', async () => {
    await setup();
    expect(profileService.getBanner).toHaveBeenCalledWith('alice', 0);
    const img: HTMLImageElement | null =
      fixture.nativeElement.querySelector('img');
    expect(img?.getAttribute('src')).toBe('blob:banner-1');
  });

  it('re-fetches when the version changes and revokes the old URL', async () => {
    await setup();
    fixture.componentRef.setInput('version', 2);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(profileService.getBanner).toHaveBeenLastCalledWith('alice', 2);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:banner-1');
    expect(
      fixture.nativeElement.querySelector('img')?.getAttribute('src')
    ).toBe('blob:banner-2');
  });

  it('shows nothing when the fetch fails', async () => {
    profileService.getBanner.mockReturnValue(
      throwError(() => new Error('403'))
    );
    await setup();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });

  it('revokes the object URL on destroy', async () => {
    await setup();
    fixture.destroy();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:banner-1');
  });
});
