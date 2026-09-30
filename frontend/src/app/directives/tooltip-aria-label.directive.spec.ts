import {
  Component,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { beforeEach, describe, expect, it } from 'vitest';

import { TooltipAriaLabelDirective } from './tooltip-aria-label.directive';

@Component({
  selector: 'app-host',
  imports: [MatButtonModule, MatTooltipModule, TooltipAriaLabelDirective],
  template: `
    <button id="plain" mat-icon-button appTooltipAriaLabel [matTooltip]="tip()">
      x
    </button>
    <button
      id="static"
      mat-icon-button
      appTooltipAriaLabel
      aria-label="Static"
      matTooltip="Tip">
      x
    </button>
    <button
      id="bound"
      mat-icon-button
      appTooltipAriaLabel
      [attr.aria-label]="'Bound'"
      matTooltip="Tip">
      x
    </button>
    <button id="text" mat-button matTooltip="Tip">Save</button>
  `,
})
class HostComponent {
  tip = signal('First');
}

describe('TooltipAriaLabelDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  const label = (id: string) =>
    (fixture.nativeElement as HTMLElement)
      .querySelector(`#${id}`)
      ?.getAttribute('aria-label');

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
  });

  it('mirrors the tooltip text into aria-label for icon buttons', () => {
    expect(label('plain')).toBe('First');
  });

  it('follows tooltip changes', async () => {
    fixture.componentInstance.tip.set('Second');
    await fixture.whenStable();
    expect(label('plain')).toBe('Second');
  });

  it('keeps an explicit aria-label', () => {
    expect(label('static')).toBe('Static');
    expect(label('bound')).toBe('Bound');
  });

  it('ignores buttons without the opt-in attribute', () => {
    expect(label('text')).toBeNull();
  });
});
