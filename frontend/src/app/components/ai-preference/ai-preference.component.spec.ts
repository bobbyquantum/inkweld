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

  const radio = (testId: string): HTMLInputElement =>
    query(testId).querySelector('input')!;

  it('starts on No AI', () => {
    expect(radio('ai-preference-none').checked).toBe(true);
    expect(radio('ai-preference-allow').checked).toBe(false);
  });

  it('switches between Allow AI and No AI', async () => {
    radio('ai-preference-allow').click();
    await settle();
    expect(setAiAllowed).toHaveBeenLastCalledWith(true);
    expect(radio('ai-preference-allow').checked).toBe(true);
    expect(query('ai-preference-allow').classList).toContain(
      'ai-choice__option--selected'
    );

    radio('ai-preference-none').click();
    await settle();
    expect(setAiAllowed).toHaveBeenLastCalledWith(false);
  });

  it('is a native radio group, named for screen readers', () => {
    const none = radio('ai-preference-none');
    const allow = radio('ai-preference-allow');
    expect(none.type).toBe('radio');
    expect(none.name).toBe(allow.name);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('legend')
        ?.textContent
    ).toContain('AI');
  });

  it('explains the choice from the help button', () => {
    query('ai-preference-help').click();
    expect(open).toHaveBeenCalledWith(
      AiPreferenceInfoDialogComponent,
      expect.any(Object)
    );
  });

  it('draws the setup pill', async () => {
    fixture.componentRef.setInput('pill', true);
    await settle();
    expect(query('ai-preference').classList).toContain('ai-preference--pill');
  });
});
