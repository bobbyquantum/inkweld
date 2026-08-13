import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { translocoTestProvider } from '../../../../../testing/transloco-test-provider';
import { AppearanceEditorComponent } from './appearance-editor.component';

describe('AppearanceEditorComponent', () => {
  let component: AppearanceEditorComponent;
  let fixture: ComponentFixture<AppearanceEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppearanceEditorComponent, translocoTestProvider()],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(AppearanceEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('value', {});
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

  it('should set the type via patchSetting', () => {
    fixture.componentRef.setInput('value', {
      menu: { type: 'color', mode: 'auto', value: '#123456' },
    });
    fixture.detectChanges();
    const emit = vi.fn();
    component.valueChange.subscribe(emit);
    component['setType']('menu', 'gradient');
    expect(emit).toHaveBeenCalledWith({
      menu: { type: 'gradient', mode: 'auto', value: '#123456' },
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
});
