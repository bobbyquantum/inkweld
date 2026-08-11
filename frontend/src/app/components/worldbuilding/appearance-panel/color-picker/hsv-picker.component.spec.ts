import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { HsvPickerComponent } from './hsv-picker.component';

describe('HsvPickerComponent', () => {
  let component: HsvPickerComponent;
  let fixture: ComponentFixture<HsvPickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HsvPickerComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(HsvPickerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('value', '#4fd8eb');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should sync HSV from the initial value', () => {
    fixture.detectChanges();
    expect(component['hue']()).toBeGreaterThanOrEqual(0);
    expect(component['saturation']()).toBeGreaterThan(0);
    expect(component['brightness']()).toBeGreaterThan(0);
  });

  it('should emit a hex colour when the square is clicked', () => {
    fixture.detectChanges();
    const emit = vi.fn();
    component.valueChange.subscribe(emit);
    const el = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
      }),
    } as unknown as HTMLElement;
    component['onSquarePointer']({
      clientX: 50,
      clientY: 50,
      currentTarget: el,
    } as unknown as PointerEvent);
    expect(emit).toHaveBeenCalledWith(expect.stringMatching(/^#[0-9a-f]{6}$/));
  });

  it('should emit when the hue changes', () => {
    fixture.detectChanges();
    const emit = vi.fn();
    component.valueChange.subscribe(emit);
    component['onHueInput']({ target: { value: '120' } } as unknown as Event);
    expect(component['hue']()).toBe(120);
    expect(emit).toHaveBeenCalled();
  });

  it('should emit a normalized hex from the hex input', () => {
    fixture.detectChanges();
    const emit = vi.fn();
    component.valueChange.subscribe(emit);
    component['onHexInput']({
      target: { value: '#ff0000' },
    } as unknown as Event);
    expect(emit).toHaveBeenCalledWith('#ff0000');
  });

  it('should ignore invalid hex input', () => {
    fixture.detectChanges();
    const emit = vi.fn();
    component.valueChange.subscribe(emit);
    component['onHexInput']({ target: { value: 'nope' } } as unknown as Event);
    expect(emit).not.toHaveBeenCalled();
  });
});
