import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { SettingsService } from '@services/core/settings.service';
import { WebMcpService } from '@services/webmcp/webmcp.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { WebMcpOptInComponent } from './webmcp-opt-in.component';

describe('WebMcpOptInComponent', () => {
  let fixture: ComponentFixture<WebMcpOptInComponent>;
  const enabled = signal(false);
  const supported = signal(true);
  const setWebMcpEnabled = vi.fn((value: boolean) => enabled.set(value));

  beforeEach(async () => {
    enabled.set(false);
    supported.set(true);
    setWebMcpEnabled.mockClear();
    await TestBed.configureTestingModule({
      imports: [WebMcpOptInComponent, translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: SettingsService,
          useValue: { webMcpEnabled: enabled, setWebMcpEnabled },
        },
        { provide: WebMcpService, useValue: { supported } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(WebMcpOptInComponent);
    await settle();
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const toggle = (): HTMLButtonElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="webmcp-opt-in-toggle"] button[role="switch"]'
    );

  it('starts off', () => {
    expect(toggle()?.getAttribute('aria-checked')).toBe('false');
  });

  it('turns WebMCP on and off', async () => {
    toggle()!.click();
    await settle();
    expect(setWebMcpEnabled).toHaveBeenCalledWith(true);
    expect(toggle()?.getAttribute('aria-checked')).toBe('true');

    toggle()!.click();
    await settle();
    expect(setWebMcpEnabled).toHaveBeenLastCalledWith(false);
  });

  it('is hidden in browsers without WebMCP', async () => {
    supported.set(false);
    await settle();
    expect(toggle()).toBeNull();
  });
});
