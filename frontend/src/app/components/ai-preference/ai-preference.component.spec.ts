import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { AiPreferenceInfoDialogComponent } from '@dialogs/ai-preference-info-dialog/ai-preference-info-dialog.component';
import { SettingsService } from '@services/core/settings.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { AiPreferenceComponent } from './ai-preference.component';

describe('AiPreferenceComponent', () => {
  let fixture: ComponentFixture<AiPreferenceComponent>;
  const allowed = signal(false);
  const setAiAllowed = vi.fn((value: boolean) => allowed.set(value));
  const open = vi.fn();

  beforeEach(async () => {
    allowed.set(false);
    setAiAllowed.mockClear();
    open.mockClear();
    await TestBed.configureTestingModule({
      imports: [AiPreferenceComponent, translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: SettingsService,
          useValue: { aiAllowed: allowed, setAiAllowed },
        },
        { provide: MatDialog, useValue: { open } },
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

  const query = (testId: string): HTMLElement =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      `[data-testid="${testId}"]`
    )!;

  /** The segment's button: the M3 button toggle is a radio in a group. */
  const segment = (testId: string): HTMLButtonElement =>
    query(testId).querySelector('button')!;

  const checked = (testId: string): boolean =>
    segment(testId).getAttribute('aria-checked') === 'true';

  it('starts on No AI', () => {
    expect(checked('ai-preference-none')).toBe(true);
    expect(checked('ai-preference-allow')).toBe(false);
  });

  it('switches between Allow AI and No AI', async () => {
    segment('ai-preference-allow').click();
    await settle();
    expect(setAiAllowed).toHaveBeenLastCalledWith(true);
    expect(checked('ai-preference-allow')).toBe(true);

    segment('ai-preference-none').click();
    await settle();
    expect(setAiAllowed).toHaveBeenLastCalledWith(false);
    expect(checked('ai-preference-none')).toBe(true);
  });

  it('is a single-choice group named for screen readers', () => {
    const group = (fixture.nativeElement as HTMLElement).querySelector(
      'mat-button-toggle-group'
    )!;
    expect(group.getAttribute('role')).toBe('radiogroup');
    expect(group.getAttribute('aria-label')).toBe('AI');
    expect(segment('ai-preference-none').getAttribute('role')).toBe('radio');
  });

  it('explains the choice from the help button', () => {
    query('ai-preference-help').click();
    expect(open).toHaveBeenCalledWith(
      AiPreferenceInfoDialogComponent,
      expect.any(Object)
    );
  });

  it('draws frosted surfaces for /setup', async () => {
    fixture.componentRef.setInput('floating', true);
    await settle();
    expect(query('ai-preference').classList).toContain(
      'ai-preference--floating'
    );
  });
});
