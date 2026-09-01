import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ConfigurationService,
  type SystemFeatures,
  SystemFeaturesAppMode,
} from '@inkweld/index';
import { SetupService } from '@services/core/setup.service';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { LegalLinksComponent } from './legal-links.component';

/** Full features payload with every field the generated model requires. */
function baseFeatures(overrides: Record<string, unknown> = {}): SystemFeatures {
  return {
    aiKillSwitch: true,
    aiKillSwitchLockedByEnv: false,
    aiAutoReview: false,
    aiImageGeneration: false,
    userApprovalRequired: false,
    appMode: SystemFeaturesAppMode.Both,
    emailEnabled: false,
    requireEmail: false,
    passwordPolicy: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSymbol: true,
    },
    passkeysEnabled: true,
    passwordLoginEnabled: true,
    emailRecoveryEnabled: false,
    legacyMcpEnabled: false,
    mcpEnabled: true,
    ...overrides,
  };
}

async function setup(
  featureOverrides: Record<string, unknown> = {}
): Promise<FixtureComponentWrapper> {
  const configurationServiceMock = {
    getSystemFeatures: () => of(baseFeatures(featureOverrides)),
  };

  await TestBed.configureTestingModule({
    imports: [translocoTestProvider(), LegalLinksComponent],
    providers: [
      provideZonelessChangeDetection(),
      {
        provide: SetupService,
        useValue: { getMode: () => 'server' },
      },
      {
        provide: ConfigurationService,
        useValue: configurationServiceMock,
      },
    ],
  }).compileComponents();

  return new FixtureComponentWrapper(
    TestBed.createComponent(LegalLinksComponent)
  );
}

/** Small helper to keep each test readable. */
class FixtureComponentWrapper {
  constructor(
    private readonly fixture: ComponentFixture<LegalLinksComponent>
  ) {}

  render(): void {
    this.fixture.detectChanges();
  }

  element(): HTMLElement {
    return this.fixture.nativeElement as HTMLElement;
  }
}

describe('LegalLinksComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when no links are configured', async () => {
    const wrapper = await setup();
    wrapper.render();

    expect(
      wrapper.element().querySelector('[data-testid="legal-links"]')
    ).toBeNull();
  });

  it('renders privacy and terms links when both are configured', async () => {
    const wrapper = await setup({
      privacyPolicyUrl: 'https://example.com/privacy',
      termsUrl: 'https://example.com/terms',
    });
    wrapper.render();

    expect(
      wrapper.element().querySelector('[data-testid="legal-links"]')
    ).toBeTruthy();

    const privacy = wrapper
      .element()
      .querySelector<HTMLAnchorElement>('[data-testid="legal-privacy-link"]');
    const terms = wrapper
      .element()
      .querySelector<HTMLAnchorElement>('[data-testid="legal-terms-link"]');

    expect(privacy?.getAttribute('href')).toBe('https://example.com/privacy');
    expect(terms?.getAttribute('href')).toBe('https://example.com/terms');
    expect(privacy?.getAttribute('target')).toBe('_blank');
    expect(privacy?.getAttribute('rel')).toContain('noopener');
    expect(wrapper.element().querySelector('.legal-separator')).toBeTruthy();
  });

  it('renders only one link when just a policy URL is set', async () => {
    const wrapper = await setup({ privacyPolicyUrl: 'https://example.com/p' });
    wrapper.render();

    expect(
      wrapper.element().querySelector('[data-testid="legal-privacy-link"]')
    ).toBeTruthy();
    expect(
      wrapper.element().querySelector('[data-testid="legal-terms-link"]')
    ).toBeNull();
    expect(wrapper.element().querySelector('.legal-separator')).toBeNull();
  });
});
