import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NgxInputGradientComponent } from 'ngx-input-color/gradient-picker';
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

  /**
   * Mount the designer and hand back the wrapped library component. The mount
   * is held back until the wrapper has layout, with a short timer as the
   * fallback that actually fires in tests, so run the clock on first.
   */
  async function mountDesigner(): Promise<NgxInputGradientComponent> {
    vi.useFakeTimers();
    try {
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();
    } finally {
      vi.useRealTimers();
    }
    return fixture.debugElement.query(By.directive(NgxInputGradientComponent))
      .componentInstance as NgxInputGradientComponent;
  }

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

  it('should not emit a change while disabled', () => {
    fixture.componentRef.setInput('disabled', true);
    const emit = vi.fn();
    component.valueChange.subscribe(emit);
    component['onGradientChange'](
      'linear-gradient(135deg, #000 0%, #fff 100%)'
    );
    expect(emit).not.toHaveBeenCalled();
  });

  it('should write the value into the ngx designer', async () => {
    fixture.componentRef.setInput(
      'value',
      'linear-gradient(135deg, #000000 0%, #ffffff 100%)'
    );
    const designer = await mountDesigner();
    expect(designer.type).toBe('linear');
    expect(designer.rotation).toBe(135);
    expect(designer.rangeValues).toHaveLength(2);
  });

  it('should emit when the ngx designer reports a new gradient', async () => {
    fixture.componentRef.setInput(
      'value',
      'linear-gradient(135deg, #000000 0%, #ffffff 100%)'
    );
    const designer = await mountDesigner();
    const emit = vi.fn();
    component.valueChange.subscribe(emit);
    designer.rotation = 45;
    designer.generateGradient();
    expect(emit).toHaveBeenCalledWith(
      expect.stringContaining('linear-gradient(45deg')
    );
  });

  it('should not rewrite a gradient the designer itself reported', async () => {
    fixture.componentRef.setInput(
      'value',
      'linear-gradient(135deg, #000000 0%, #ffffff 100%)'
    );
    const designer = await mountDesigner();
    const emit = vi.fn();
    component.valueChange.subscribe(emit);
    const write = vi.spyOn(designer, 'writeValue');
    // Round-trip: the designer reports, the parent stores it and feeds it back.
    designer.generateGradient();
    fixture.componentRef.setInput('value', emit.mock.calls[0][0]);
    fixture.detectChanges();
    // A rewrite here would mint fresh stop ids underneath a drag in progress.
    expect(write).not.toHaveBeenCalled();
  });
  it('should not report a value it cannot show as a gradient', async () => {
    // The mirror of the colour picker case: handed a bare hex, the library
    // builds a *random* gradient and reports it straight back, which the panel
    // persisted over the user's colour.
    fixture.componentRef.setInput('value', '#b32d2d');
    const emit = vi.fn();
    component.valueChange.subscribe(emit);
    await mountDesigner();
    expect(emit).not.toHaveBeenCalled();
  });

  it('should not report a random gradient for an empty value', async () => {
    fixture.componentRef.setInput('value', '');
    const emit = vi.fn();
    component.valueChange.subscribe(emit);
    await mountDesigner();
    expect(emit).not.toHaveBeenCalled();
  });
});
