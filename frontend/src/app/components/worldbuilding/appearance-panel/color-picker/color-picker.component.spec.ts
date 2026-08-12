import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
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
});
