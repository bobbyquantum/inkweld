import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { WebMcpService } from '@services/webmcp/webmcp.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { AiPreferenceInfoDialogComponent } from './ai-preference-info-dialog.component';

describe('AiPreferenceInfoDialogComponent', () => {
  let fixture: ComponentFixture<AiPreferenceInfoDialogComponent>;
  const supported = signal(false);
  const refreshSupport = vi.fn();

  beforeEach(async () => {
    supported.set(false);
    refreshSupport.mockClear();
    await TestBed.configureTestingModule({
      imports: [AiPreferenceInfoDialogComponent, translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        { provide: WebMcpService, useValue: { supported, refreshSupport } },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AiPreferenceInfoDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const text = (): string =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('explains both choices', () => {
    expect(text()).toContain('No AI');
    expect(text()).toContain('Allow AI');
    expect(text()).toContain('image generation');
    expect(text()).toContain('WebMCP');
  });

  it('looks for WebMCP again when opened', () => {
    expect(refreshSupport).toHaveBeenCalled();
  });

  it('says whether this browser offers WebMCP', async () => {
    const status = (): string =>
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="ai-preference-info-webmcp"]'
      )!.textContent ?? '';
    expect(status()).toContain("doesn't offer WebMCP");

    supported.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(status()).toContain('This browser offers WebMCP');
  });
});
