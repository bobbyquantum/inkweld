import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { SettingsService } from '@services/core/settings.service';
import { WebMcpService } from '@services/webmcp/webmcp.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { AiPreferenceComponent } from './ai-preference.component';

describe('AiPreferenceComponent', () => {
  let fixture: ComponentFixture<AiPreferenceComponent>;
  const allowed = signal(false);
  const supported = signal(true);
  const setAiAllowed = vi.fn((value: boolean) => allowed.set(value));
  const refreshSupport = vi.fn();

  beforeEach(async () => {
    allowed.set(false);
    supported.set(true);
    setAiAllowed.mockClear();
    refreshSupport.mockClear();
    await TestBed.configureTestingModule({
      imports: [AiPreferenceComponent, translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: SettingsService,
          useValue: { aiAllowed: allowed, setAiAllowed },
        },
        { provide: WebMcpService, useValue: { supported, refreshSupport } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AiPreferenceComponent);
    await settle();
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const query = (testId: string): HTMLElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector(
      `[data-testid="${testId}"]`
    );

  const button = (testId: string): HTMLButtonElement =>
    query(testId)!.querySelector('button')!;

  const checked = (testId: string): boolean =>
    button(testId).getAttribute('aria-checked') === 'true';

  it('starts on No AI', () => {
    expect(checked('ai-preference-none')).toBe(true);
    expect(checked('ai-preference-allow')).toBe(false);
  });

  it('switches between Allow AI and No AI', async () => {
    button('ai-preference-allow').click();
    await settle();
    expect(setAiAllowed).toHaveBeenLastCalledWith(true);
    expect(checked('ai-preference-allow')).toBe(true);

    button('ai-preference-none').click();
    await settle();
    expect(setAiAllowed).toHaveBeenLastCalledWith(false);
  });

  it('looks for WebMCP again when shown', () => {
    expect(refreshSupport).toHaveBeenCalled();
  });

  it('can be limited to browsers with WebMCP', async () => {
    fixture.componentRef.setInput('onlyWithWebMcp', true);
    await settle();
    expect(query('ai-preference')).not.toBeNull();

    supported.set(false);
    await settle();
    expect(query('ai-preference')).toBeNull();
  });

  it('draws the setup pill', async () => {
    fixture.componentRef.setInput('pill', true);
    await settle();
    expect(query('ai-preference')?.classList).toContain('ai-preference--pill');
  });
});
