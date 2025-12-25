import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiKillSwitchDialogComponent } from './ai-kill-switch-dialog.component';

describe('AiKillSwitchDialogComponent', () => {
  let component: AiKillSwitchDialogComponent;
  let fixture: ComponentFixture<AiKillSwitchDialogComponent>;
  let mockDialogRef: { close: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AiKillSwitchDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: mockDialogRef },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AiKillSwitchDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should close with false when cancel is clicked', () => {
    component.onCancel();
    expect(mockDialogRef.close).toHaveBeenCalledWith(false);
  });

  it('should close with true when confirm is clicked', () => {
    component.onConfirm();
    expect(mockDialogRef.close).toHaveBeenCalledWith(true);
  });

  it('should display warning message about third-party data', () => {
    const compiled = fixture.nativeElement;
    expect(
      compiled.textContent?.includes('third-party AI services')
    ).toBeTruthy();
    expect(compiled.textContent?.includes('external providers')).toBeTruthy();
  });

  it('should have cancel and confirm buttons', () => {
    const compiled = fixture.nativeElement;
    const cancelButton = compiled.querySelector(
      '[data-testid="cancel-ai-enable"]'
    );
    const confirmButton = compiled.querySelector(
      '[data-testid="confirm-ai-enable"]'
    );

    expect(cancelButton).toBeTruthy();
    expect(confirmButton).toBeTruthy();
  });
});
