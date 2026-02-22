import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ColorSwatchesComponent } from './color-swatches.component';

describe('ColorSwatchesComponent', () => {
  let component: ColorSwatchesComponent;
  let fixture: ComponentFixture<ColorSwatchesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ColorSwatchesComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ColorSwatchesComponent);
    component = fixture.componentInstance;
    // Set initial color before detectChanges
    component.selectedColor = '#333333';
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have a colors palette with 30 swatches', () => {
    expect(component.colors.length).toBe(30);
  });

  it('should derive hexValue from selectedColor', () => {
    component.selectedColor = '#FF5722';
    expect(component.hexValue).toBe('FF5722');
  });

  it('should emit colorChange when a swatch is selected', () => {
    const spy = vi.spyOn(component.colorChange, 'emit');
    component.selectColor('#E53935');
    expect(spy).toHaveBeenCalledWith('#E53935');
    expect(component.selectedColor).toBe('#E53935');
  });

  it('should update hexValue after selecting color', () => {
    component.selectColor('#1E88E5');
    expect(component.hexValue).toBe('1E88E5');
  });

  it('should strip non-hex chars in onHexInput', () => {
    const input = document.createElement('input');
    input.value = '#GG11ZZ';
    const event = { target: input } as unknown as Event;
    component.onHexInput(event);
    expect(input.value).toBe('11');
  });

  it('should emit on valid 6-char hex via onHexBlur', () => {
    const spy = vi.spyOn(component.colorChange, 'emit');
    fixture.detectChanges();

    // Set the hex input value via the DOM
    const nativeEl = fixture.nativeElement as HTMLElement;
    const hexInput = nativeEl.querySelector<HTMLInputElement>('#hexInput');
    if (hexInput) {
      hexInput.value = 'FF5722';
      component.onHexBlur();
      expect(spy).toHaveBeenCalledWith('#FF5722');
    }
  });

  it('should emit on valid 3-char hex via onHexBlur', () => {
    const spy = vi.spyOn(component.colorChange, 'emit');
    fixture.detectChanges();

    const nativeEl = fixture.nativeElement as HTMLElement;
    const hexInput = nativeEl.querySelector<HTMLInputElement>('#hexInput');
    if (hexInput) {
      hexInput.value = 'F00';
      component.onHexBlur();
      expect(spy).toHaveBeenCalledWith('#F00');
    }
  });

  it('should not emit on invalid hex via onHexBlur', () => {
    const spy = vi.spyOn(component.colorChange, 'emit');
    fixture.detectChanges();

    const nativeEl = fixture.nativeElement as HTMLElement;
    const hexInput = nativeEl.querySelector<HTMLInputElement>('#hexInput');
    if (hexInput) {
      hexInput.value = 'GG';
      component.onHexBlur();
      // Only non-hex chars stripped → empty → invalid length
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
