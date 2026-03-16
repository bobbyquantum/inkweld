import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AboutComponent } from './about.component';

describe('AboutComponent', () => {
  let router: {
    navigate: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    router = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [AboutComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: Router, useValue: router },
        {
          provide: UnifiedUserService,
          useValue: {
            currentUser: vi.fn().mockReturnValue(null),
          },
        },
      ],
    })
      .overrideComponent(AboutComponent, {
        set: { template: '' },
      })
      .compileComponents();
  });

  it('exposes application metadata and library information', () => {
    const fixture = TestBed.createComponent(AboutComponent);
    const component = fixture.componentInstance;

    expect(component.appName).toBe('Inkweld');
    expect(component.appVersion.length).toBeGreaterThan(0);
    expect(component.appDescription.length).toBeGreaterThan(0);
    expect(component.keyLibraries.length).toBeGreaterThan(5);
    expect(component.keyLibraries[0]).toMatchObject({ name: 'Angular' });
    expect(component.currentYear).toBe(new Date().getFullYear());
  });

  it('navigates back to the home page', async () => {
    const fixture = TestBed.createComponent(AboutComponent);
    const component = fixture.componentInstance;

    component.goBack();
    await Promise.resolve();

    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });

  it('opens the bundled third-party licenses page', () => {
    const fixture = TestBed.createComponent(AboutComponent);
    const component = fixture.componentInstance;
    const openSpy = vi.spyOn(globalThis, 'open').mockReturnValue(null);

    component.openLicenses();

    expect(openSpy).toHaveBeenCalledWith('/3rdpartylicenses.txt', '_blank');
    openSpy.mockRestore();
  });

  it('opens external links in a secure new tab', () => {
    const fixture = TestBed.createComponent(AboutComponent);
    const component = fixture.componentInstance;
    const openSpy = vi.spyOn(globalThis, 'open').mockReturnValue(null);

    component.openExternalLink('https://example.com');

    expect(openSpy).toHaveBeenCalledWith(
      'https://example.com',
      '_blank',
      'noopener,noreferrer'
    );
    openSpy.mockRestore();
  });
});
