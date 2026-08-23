import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { WorldbuildingService } from '../../services/worldbuilding/worldbuilding.service';
import {
  FieldConfigDialogComponent,
  type FieldConfigDialogData,
} from './field-config-dialog.component';

describe('FieldConfigDialogComponent', () => {
  let component: FieldConfigDialogComponent;
  let fixture: ComponentFixture<FieldConfigDialogComponent>;
  const dialogRefMock = { close: vi.fn() };

  const mockWorldbuildingService = {
    schemas: signal([
      { id: 'character-v1', name: 'Character', icon: 'person' },
      { id: 'location-v1', name: 'Location', icon: 'place' },
    ]),
  };

  const fieldTypes = [
    { value: 'text', label: 'Text' },
    { value: 'select', label: 'Select' },
    { value: 'textarea', label: 'Text Area' },
  ];

  const data: FieldConfigDialogData = {
    field: {
      key: 'gender',
      label: 'Gender',
      type: 'select',
      options: ['Male', 'Female'],
      layout: { span: 6 },
    },
    fieldTypes,
  };

  /** Set a DOM input's value and fire an input event (like user typing). */
  const setInput = (testId: string, value: string) => {
    const el = fixture.nativeElement.querySelector(
      `[data-testid="${testId}"]`
    ) as HTMLInputElement;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  beforeEach(async () => {
    dialogRefMock.close.mockClear();
    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), FieldConfigDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: WorldbuildingService, useValue: mockWorldbuildingService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FieldConfigDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should seed the DOM inputs from the field data', () => {
    const read = (testId: string) =>
      (
        fixture.nativeElement.querySelector(
          `[data-testid="${testId}"]`
        ) as HTMLInputElement
      ).value;
    expect(read('fc-label')).toBe('Gender');
    expect(read('fc-key')).toBe('gender');
    expect(component['type']()).toBe('select');
    expect(component['options']()).toEqual(['Male', 'Female']);
    expect(component['span']()).toBe(6);
  });

  it('should close with a patch on save', () => {
    setInput('fc-label', 'Gender');
    setInput('fc-key', 'gender');
    component['options'].update(o => [...o, 'Other']);
    component['required'].set(true);

    component.onSave();

    expect(dialogRefMock.close).toHaveBeenCalledWith({
      key: 'gender',
      label: 'Gender',
      type: 'select',
      validation: { required: true },
      layout: { span: 6 },
      options: ['Male', 'Female', 'Other'],
    });
  });

  it('should replace the whole key when retyped (no stale concat)', () => {
    // Simulate the zoneless race regression: the seeded key must be fully
    // replaced by the typed value, not concatenated with it.
    setInput('fc-key', 'traits.origin');
    component.onSave();
    expect(dialogRefMock.close).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'traits.origin' })
    );
  });

  it('should set the span from a clicked grid cell', () => {
    component['onSpanCell'](7);
    expect(component['span']()).toBe(8);
  });

  it('should track the span during a handle drag', () => {
    const grid = document.createElement('div');
    grid.className = 'span-grid';
    grid.getBoundingClientRect = () =>
      ({ left: 0, width: 200, top: 0, height: 0 }) as DOMRect;
    const handle = document.createElement('div');
    handle.className = 'span-handle';
    grid.appendChild(handle);

    component['spanDragging'] = true;
    component['updateSpanDrag']({
      currentTarget: handle,
      clientX: 100,
    } as unknown as PointerEvent);
    expect(component['span']()).toBe(6);
  });

  it('should ignore drag updates when not dragging', () => {
    component['span'].set(3);
    component['spanDragging'] = false;
    const grid = document.createElement('div');
    grid.className = 'span-grid';
    grid.getBoundingClientRect = () => ({ left: 0, width: 200 }) as DOMRect;
    component['updateSpanDrag']({
      currentTarget: grid,
      clientX: 150,
    } as unknown as PointerEvent);
    expect(component['span']()).toBe(3);
  });

  it('should include rows for textarea fields', () => {
    component['type'].set('textarea');
    component['rows'].set(6);
    component.onSave();
    expect(dialogRefMock.close).toHaveBeenCalledWith(
      expect.objectContaining({ rows: 6, type: 'textarea' })
    );
  });

  it('should not close when the key is empty', () => {
    setInput('fc-key', '   ');
    component.onSave();
    expect(dialogRefMock.close).not.toHaveBeenCalled();
  });

  it('should close without a result on cancel', () => {
    component.onCancel();
    expect(dialogRefMock.close).toHaveBeenCalledWith();
  });

  describe('relationship fields', () => {
    it('should expose relationship config signals from the field', () => {
      component['type'].set('relationship');
      component['targetSchemaId'].set('character-v1');
      component['multiple'].set(true);
      component['inverseLabel'].set('Child of');

      expect(component['isRelationshipType']()).toBe(true);
      expect(component['targetSchemaId']()).toBe('character-v1');
      expect(component['multiple']()).toBe(true);
      expect(component['inverseLabel']()).toBe('Child of');
    });

    it('should include relationship config in the save patch', () => {
      component['type'].set('relationship');
      component['targetSchemaId'].set('character-v1');
      component['multiple'].set(false);
      component['inverseLabel'].set('Child of');

      component.onSave();

      expect(dialogRefMock.close).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'relationship',
          targetSchemaId: 'character-v1',
          multiple: false,
          inverseLabel: 'Child of',
        })
      );
    });

    it('should clear empty target schema and inverse label on save', () => {
      component['type'].set('relationship');
      component['targetSchemaId'].set('');
      component['inverseLabel'].set('   ');

      component.onSave();

      expect(dialogRefMock.close).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'relationship',
          targetSchemaId: undefined,
          inverseLabel: undefined,
        })
      );
    });

    it('should not include relationship config for non-relationship types', () => {
      component['type'].set('text');
      component.onSave();

      const patch = dialogRefMock.close.mock.calls[0][0];
      expect(patch).not.toHaveProperty('targetSchemaId');
      expect(patch).not.toHaveProperty('multiple');
      expect(patch).not.toHaveProperty('inverseLabel');
    });

    it('should render the relationship section only for relationship type', () => {
      component['type'].set('relationship');
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector('[data-testid="fc-relationship"]')
      ).not.toBeNull();

      component['type'].set('text');
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector('[data-testid="fc-relationship"]')
      ).toBeNull();
    });

    it('should list schema options in the target select', () => {
      component['type'].set('relationship');
      fixture.detectChanges();
      const options = fixture.nativeElement.querySelectorAll(
        '[data-testid="fc-target-schema"] mat-option'
      );
      expect(component['schemaOptions']()).toHaveLength(2);
      expect(options).toBeDefined();
    });
  });
});
