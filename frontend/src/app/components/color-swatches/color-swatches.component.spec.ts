import { Component, EventEmitter, Input, Output } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { ColorPickerComponent } from '../worldbuilding/appearance-panel/color-picker/color-picker.component';
import { GradientDesignerComponent } from '../worldbuilding/appearance-panel/gradient-designer/gradient-designer.component';
import { ColorSwatchesComponent } from './color-swatches.component';

// The wrapped ngx pickers measure layout during mount and misbehave in
// jsdom; the chooser's own logic is what this spec covers, so stub them.
@Component({ selector: 'app-color-picker', template: '' })
class ColorPickerStubComponent {
  @Input() value = '';
  @Input() disabled = false;
  @Output() readonly valueChange = new EventEmitter<string>();
}

@Component({ selector: 'app-gradient-designer', template: '' })
class GradientDesignerStubComponent {
  @Input() value = '';
  @Input() disabled = false;
  @Output() readonly valueChange = new EventEmitter<string>();
}

describe('ColorSwatchesComponent', () => {
  let component: ColorSwatchesComponent;
  let fixture: ComponentFixture<ColorSwatchesComponent>;

  beforeEach(async () => {
    TestBed.overrideComponent(ColorSwatchesComponent, {
      remove: { imports: [ColorPickerComponent, GradientDesignerComponent] },
      add: {
        imports: [ColorPickerStubComponent, GradientDesignerStubComponent],
      },
    });
    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), ColorSwatchesComponent],
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
    expect(component.colors).toHaveLength(30);
  });

  it('should emit colorChange when a swatch is selected', () => {
    const spy = vi.spyOn(component.colorChange, 'emit');
    component.selectColor('#E53935');
    expect(spy).toHaveBeenCalledWith('#E53935');
    expect(component.selectedColor).toBe('#E53935');
  });

  it('expands the full picker on the custom-color toggle', () => {
    const nativeEl = fixture.nativeElement as HTMLElement;
    expect(
      nativeEl.querySelector('[data-testid="custom-color-picker"]')
    ).toBeNull();

    nativeEl
      .querySelector<HTMLButtonElement>('[data-testid="custom-color-toggle"]')!
      .click();
    fixture.detectChanges();

    expect(
      nativeEl.querySelector('[data-testid="custom-color-picker"]')
    ).not.toBeNull();
  });

  it('shows no gradient mode toggle by default', () => {
    const nativeEl = fixture.nativeElement as HTMLElement;
    expect(
      nativeEl.querySelector('[data-testid="color-mode-gradient"]')
    ).toBeNull();
  });

  it('offers gradient mode when allowGradient is set', () => {
    // Fresh fixture: the input must be set before the first change-detection
    // pass, since @if branch creation between passes trips dev-mode NG0100.
    const gradientFixture = TestBed.createComponent(ColorSwatchesComponent);
    gradientFixture.componentInstance.allowGradient = true;
    gradientFixture.detectChanges();

    const nativeEl = gradientFixture.nativeElement as HTMLElement;
    expect(
      nativeEl.querySelector('[data-testid="color-mode-gradient"]')
    ).not.toBeNull();

    gradientFixture.componentInstance['setMode']('gradient');
    expect(gradientFixture.componentInstance['mode']()).toBe('gradient');
  });

  it('starts in gradient mode when the value is a gradient', () => {
    component.allowGradient = true;
    component.selectedColor =
      'linear-gradient(90deg, #ff0000 0%, #0000ff 100%)';
    component.ngOnChanges();
    expect(component['mode']()).toBe('gradient');
  });

  it('switching back to solid re-emits the last solid color', () => {
    component.allowGradient = true;
    component.selectedColor = '#E53935';
    component.ngOnChanges();
    component.selectedColor =
      'linear-gradient(90deg, #ff0000 0%, #0000ff 100%)';
    component.ngOnChanges();

    const spy = vi.spyOn(component.colorChange, 'emit');
    component['setMode']('solid');
    expect(spy).toHaveBeenCalledWith('#E53935');
  });
});
