import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { ConfigurationService } from '@inkweld/index';
import { SystemConfigService } from '@services/core/system-config.service';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { LegalPageComponent } from './legal-page.component';

describe('LegalPageComponent', () => {
  let getLegalDocument: ReturnType<typeof vi.fn>;
  let isLocalMode: ReturnType<typeof signal<boolean>>;

  async function create(
    document: 'privacy' | 'terms'
  ): Promise<ComponentFixture<LegalPageComponent>> {
    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), LegalPageComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { data: { document } } },
        },
        { provide: ConfigurationService, useValue: { getLegalDocument } },
        {
          provide: SystemConfigService,
          useValue: {
            isLocalMode,
            hasPrivacyPolicy: signal(true),
            hasTerms: signal(true),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(LegalPageComponent);
    fixture.detectChanges();
    // Let the document request and Markdown render settle.
    await new Promise(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();
    return fixture;
  }

  const el = (f: ComponentFixture<LegalPageComponent>) =>
    f.nativeElement as HTMLElement;

  beforeEach(() => {
    getLegalDocument = vi.fn();
    isLocalMode = signal(false);
  });

  it('renders hosted Markdown for the privacy policy', async () => {
    getLegalDocument.mockReturnValue(
      of({
        document: 'privacy',
        content: '# Hello\n\nWe keep **nothing**.',
        version: 'v',
      })
    );
    const fixture = await create('privacy');

    expect(getLegalDocument).toHaveBeenCalledWith('privacy');
    const body = el(fixture).querySelector('[data-testid="legal-content"]');
    expect(body?.querySelector('h1')?.textContent).toBe('Hello');
    expect(body?.querySelector('strong')?.textContent).toBe('nothing');
    expect(el(fixture).querySelector('h1')?.textContent).toContain(
      'Privacy Policy'
    );
    expect(
      el(fixture)
        .querySelector('[data-testid="legal-other-link"]')
        ?.getAttribute('href')
    ).toBe('/terms');
  });

  it('strips script from the rendered Markdown', async () => {
    getLegalDocument.mockReturnValue(
      of({
        document: 'terms',
        content: 'Hi <img src=x onerror="alert(1)"><script>alert(2)</script>',
        version: 'v',
      })
    );
    const fixture = await create('terms');
    const body = el(fixture).querySelector('[data-testid="legal-content"]');
    expect(body?.textContent).toContain('Hi');
    const html = body?.innerHTML ?? '';
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<script');
  });

  it('redirects to an external URL when no content is configured', async () => {
    getLegalDocument.mockReturnValue(
      of({ document: 'terms', url: 'https://example.com/terms', version: 'v' })
    );
    const redirect = vi
      .spyOn(
        LegalPageComponent.prototype as unknown as {
          redirect: (url: string) => void;
        },
        'redirect'
      )
      .mockImplementation(() => undefined);

    await create('terms');

    expect(redirect).toHaveBeenCalledWith('https://example.com/terms');
    redirect.mockRestore();
  });

  it('refuses to redirect to a non-http URL', async () => {
    getLegalDocument.mockReturnValue(
      of({ document: 'privacy', url: 'javascript:alert(1)', version: 'v' })
    );
    const redirect = vi
      .spyOn(
        LegalPageComponent.prototype as unknown as {
          redirect: (url: string) => void;
        },
        'redirect'
      )
      .mockImplementation(() => undefined);

    const fixture = await create('privacy');

    expect(redirect).not.toHaveBeenCalled();
    expect(
      el(fixture).querySelector('[data-testid="legal-not-configured"]')
    ).toBeTruthy();
    redirect.mockRestore();
  });

  it('shows a not-configured message on 404', async () => {
    getLegalDocument.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404 }))
    );
    const fixture = await create('privacy');
    expect(
      el(fixture).querySelector('[data-testid="legal-not-configured"]')
        ?.textContent
    ).toContain('privacy policy');
  });

  it('shows an error message on other failures', async () => {
    getLegalDocument.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 }))
    );
    const fixture = await create('terms');
    expect(
      el(fixture).querySelector('[data-testid="legal-error"]')
    ).toBeTruthy();
  });

  it('does not call the server in local mode', async () => {
    isLocalMode.set(true);
    const fixture = await create('privacy');
    expect(getLegalDocument).not.toHaveBeenCalled();
    expect(
      el(fixture).querySelector('[data-testid="legal-not-configured"]')
    ).toBeTruthy();
  });
});
