import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NgxInputColorComponent } from 'ngx-input-color/color-picker';
import { vi } from 'vitest';

import { ColorPickerComponent } from './color-picker.component';

describe('ColorPickerComponent', () => {
  let component: ColorPickerComponent;
  let fixture: ComponentFixture<ColorPickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ColorPickerComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(ColorPickerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('value', '#4fd8eb');
  });

  /**
   * Mount the picker and hand back the wrapped library component. The mount is
   * held back until the wrapper has layout, with a short timer as the fallback
   * that actually fires in tests, so run the clock on before querying.
   */
  async function mountPicker(): Promise<NgxInputColorComponent> {
    vi.useFakeTimers();
    try {
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();
    } finally {
      vi.useRealTimers();
    }
    return fixture.debugElement.query(By.directive(NgxInputColorComponent))
      .componentInstance as NgxInputColorComponent;
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit the colour on change', () => {
    const emit = vi.fn();
    component.valueChange.subscribe(emit);
    component['onColorChange']('#ff0000');
    expect(emit).toHaveBeenCalledWith('#ff0000');
  });

  it('should not emit an empty colour', () => {
    const emit = vi.fn();
    component.valueChange.subscribe(emit);
    component['onColorChange']('');
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
    component['onColorChange']('#ff0000');
    expect(emit).not.toHaveBeenCalled();
  });

  it('should write the value into the ngx picker', async () => {
    const picker = await mountPicker();
    expect(picker.hexColor).toBe('#4fd8eb');
  });

  it('should emit when the ngx picker reports a new colour', async () => {
    const picker = await mountPicker();
    const emit = vi.fn();
    component.valueChange.subscribe(emit);
    await picker.initColor(picker.color);
    expect(emit).toHaveBeenCalledWith('#4fd8eb');
  });

  it('should not write a colour the picker itself reported', async () => {
    const picker = await mountPicker();
    const write = vi.spyOn(picker, 'writeValue');
    // Round-trip: the picker reports, the parent stores it and feeds it back.
    await picker.initColor(picker.color);
    fixture.componentRef.setInput('value', '#4fd8eb');
    fixture.detectChanges();
    expect(write).not.toHaveBeenCalled();
  });
});
