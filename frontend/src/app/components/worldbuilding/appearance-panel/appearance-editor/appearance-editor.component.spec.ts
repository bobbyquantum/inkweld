import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { translocoTestProvider } from '../../../../../testing/transloco-test-provider';
import { AppearanceEditorComponent } from './appearance-editor.component';

describe('AppearanceEditorComponent', () => {
  let component: AppearanceEditorComponent;
  let fixture: ComponentFixture<AppearanceEditorComponent>;

  beforeEach(async () => {
    const matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal('matchMedia', matchMedia);

    await TestBed.configureTestingModule({
      imports: [AppearanceEditorComponent, translocoTestProvider()],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(AppearanceEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('value', {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit an updated appearance when a region is enabled', () => {
    fixture.detectChanges();
    const emit = vi.fn();
    component.valueChange.subscribe(emit);
    component['setEnabled']('menu', true);
    expect(emit).toHaveBeenCalledWith({
      menu: { type: 'color', mode: 'auto' },
    });
  });

  it('should emit a delete marker when a region is disabled', () => {
    fixture.componentRef.setInput('value', {
      menu: { type: 'color', mode: 'auto', value: '#123456' },
    });
    fixture.detectChanges();
    const deletes = vi.fn();
    component.deletes.subscribe(deletes);
    component['setEnabled']('menu', false);
    expect(deletes).toHaveBeenCalledWith({ menu: true });
  });

  it('should emit a delete marker when a value slot is cleared', () => {
    fixture.componentRef.setInput('value', {
      menu: { type: 'color', mode: 'auto', value: '#123456' },
    });
    fixture.detectChanges();
    const deletes = vi.fn();
    component.deletes.subscribe(deletes);
    component['setValue']('menu', 'value', '');
    expect(deletes).toHaveBeenCalledWith({ 'menu.value': true });
  });

  it("should drop the old type's value when the type changes", () => {
    // A colour is not a gradient: carried over, it reaches the gradient
    // designer, which answers an unreadable value with a random gradient.
    fixture.componentRef.setInput('value', {
      menu: { type: 'color', mode: 'auto', value: '#123456' },
    });
    fixture.detectChanges();
    const emit = vi.fn();
    component.valueChange.subscribe(emit);
    component['setType']('menu', 'gradient');
    expect(emit).toHaveBeenCalledWith({
      menu: { type: 'gradient', mode: 'auto' },
    });
  });

  it('should mark the dropped slots for deletion when the type changes', () => {
    fixture.componentRef.setInput('value', {
      menu: {
        type: 'gradient',
        mode: 'manual',
        light: 'linear-gradient(135deg, #000 0%, #fff 100%)',
        dark: 'linear-gradient(135deg, #fff 0%, #000 100%)',
      },
    });
    fixture.detectChanges();
    const deletes = vi.fn();
    component.deletes.subscribe(deletes);
    component['setType']('menu', 'color');
    expect(deletes).toHaveBeenCalledWith({
      'menu.light': true,
      'menu.dark': true,
    });
  });

  it('should keep the value when the type is re-set to what it already was', () => {
    fixture.componentRef.setInput('value', {
      menu: { type: 'color', mode: 'auto', value: '#123456' },
    });
    fixture.detectChanges();
    const emit = vi.fn();
    component.valueChange.subscribe(emit);
    component['setType']('menu', 'color');
    expect(emit).toHaveBeenCalledWith({
      menu: { type: 'color', mode: 'auto', value: '#123456' },
    });
  });

  it('should keep the value when a different field is patched', () => {
    fixture.componentRef.setInput('value', {
      menu: { type: 'color', mode: 'auto', value: '#123456' },
    });
    fixture.detectChanges();
    const emit = vi.fn();
    component.valueChange.subscribe(emit);
    component['setMode']('menu', 'manual');
    expect(emit).toHaveBeenCalledWith({
      menu: { type: 'color', mode: 'manual', value: '#123456' },
    });
  });

  it('should set the intensity', () => {
    fixture.componentRef.setInput('value', {
      menu: { type: 'color', mode: 'auto', value: '#123456' },
    });
    fixture.detectChanges();
    const emit = vi.fn();
    component.valueChange.subscribe(emit);
    component['setIntensity']('menu', 60);
    expect(emit).toHaveBeenCalledWith({
      menu: { type: 'color', mode: 'auto', value: '#123456', intensity: 60 },
    });
  });

  it('should emit an image pick request with region and slot', () => {
    fixture.componentRef.setInput('value', {
      content: { type: 'image', mode: 'auto' },
    });
    fixture.detectChanges();
    const picked = vi.fn();
    component.imagePicker.subscribe(picked);
    component.imagePicker.emit({ region: 'content', slot: 'value' });
    expect(picked).toHaveBeenCalledWith({ region: 'content', slot: 'value' });
  });
});
