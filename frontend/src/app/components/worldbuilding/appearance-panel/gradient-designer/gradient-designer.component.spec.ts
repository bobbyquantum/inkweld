import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../../../testing/transloco-test-provider';
import { GradientDesignerComponent } from './gradient-designer.component';

describe('GradientDesignerComponent', () => {
  let component: GradientDesignerComponent;
  let fixture: ComponentFixture<GradientDesignerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GradientDesignerComponent, translocoTestProvider()],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(GradientDesignerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('value', '');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the ngx gradient picker', async () => {
    vi.useFakeTimers();
    try {
      fixture.detectChanges();
      // The picker defers its mount until it has real layout; the mount is
      // triggered by a short timer fallback, so advance it and re-render.
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector('ngx-input-gradient')
      ).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should emit the gradient string on change', () => {
    fixture.detectChanges();
    const emit = vi.fn();
    component.valueChange.subscribe(emit);
    component['onGradientChange'](
      'linear-gradient(135deg, #000 0%, #fff 100%)'
    );
    expect(emit).toHaveBeenCalledWith(
      'linear-gradient(135deg, #000 0%, #fff 100%)'
    );
  });

  it('should not emit empty gradient strings', () => {
    fixture.detectChanges();
    const emit = vi.fn();
    component.valueChange.subscribe(emit);
    component['onGradientChange']('');
    expect(emit).not.toHaveBeenCalled();
  });

  it('should add a disabled class when disabled', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.classList).toContain('disabled');
  });
});
