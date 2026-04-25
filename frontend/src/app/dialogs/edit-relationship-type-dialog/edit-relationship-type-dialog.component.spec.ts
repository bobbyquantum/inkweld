import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RelationshipCategory } from '../../components/element-ref/element-ref.model';
import { type ElementTypeSchema } from '../../models/schema-types';
import {
  CATEGORY_OPTIONS,
  EditRelationshipTypeDialogComponent,
  type EditRelationshipTypeDialogData,
  RELATIONSHIP_COLOR_OPTIONS,
  RELATIONSHIP_ICON_OPTIONS,
} from './edit-relationship-type-dialog.component';

const MOCK_SCHEMAS: ElementTypeSchema[] = [
  {
    id: 'character-v1',
    name: 'Character',
    icon: 'person',
    description: '',
    version: 1,
    tabs: [],
  },
  {
    id: 'location-v1',
    name: 'Location',
    icon: 'place',
    description: '',
    version: 1,
    tabs: [],
  },
];

function createComponent(data: EditRelationshipTypeDialogData): {
  fixture: ComponentFixture<EditRelationshipTypeDialogComponent>;
  component: EditRelationshipTypeDialogComponent;
  dialogRefMock: { close: ReturnType<typeof vi.fn> };
} {
  const dialogRefMock = { close: vi.fn() };

  TestBed.configureTestingModule({
    imports: [EditRelationshipTypeDialogComponent, NoopAnimationsModule],
    providers: [
      provideZonelessChangeDetection(),
      { provide: MatDialogRef, useValue: dialogRefMock },
      { provide: MAT_DIALOG_DATA, useValue: data },
    ],
  });

  const fixture = TestBed.createComponent(EditRelationshipTypeDialogComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  return { fixture, component, dialogRefMock };
}

describe('EditRelationshipTypeDialogComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  // ── Module constants ───────────────────────────────────────────────────────

  it('should export non-empty RELATIONSHIP_ICON_OPTIONS', () => {
    expect(RELATIONSHIP_ICON_OPTIONS.length).toBeGreaterThan(0);
  });

  it('should export exactly 16 color options', () => {
    expect(RELATIONSHIP_COLOR_OPTIONS).toHaveLength(16);
  });

  it('should export all 8 categories', () => {
    expect(CATEGORY_OPTIONS).toHaveLength(8);
    const values = CATEGORY_OPTIONS.map(c => c.value);
    expect(values).toContain(RelationshipCategory.Custom);
    expect(values).toContain(RelationshipCategory.Familial);
  });

  it('should display "Other" for the Custom category', () => {
    const custom = CATEGORY_OPTIONS.find(
      c => c.value === RelationshipCategory.Custom
    );
    expect(custom?.label).toBe('Other');
  });

  // ── Create mode ────────────────────────────────────────────────────────────

  describe('create mode (isNew = true)', () => {
    it('should create the component', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: MOCK_SCHEMAS,
      });
      expect(component).toBeTruthy();
    });

    it('should initialise with empty name and inverseLabel', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: [],
      });
      expect(component.name()).toBe('');
      expect(component.inverseLabel()).toBe('');
    });

    it('should default icon to "hub" and color to #607D8B', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: [],
      });
      expect(component.icon()).toBe('hub');
      expect(component.color()).toBe('#607D8B');
    });

    it('should default showInverse to true', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: [],
      });
      expect(component.showInverse()).toBe(true);
    });

    it('should default sourceAnyType and targetAnyType to true (empty schemas)', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: [],
      });
      expect(component.sourceAnyType()).toBe(true);
      expect(component.targetAnyType()).toBe(true);
    });

    it('should be invalid when name or inverseLabel is empty', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: [],
      });
      expect(component.isFormValid()).toBe(false);
      component.name.set('Friend');
      expect(component.isFormValid()).toBe(false);
      component.inverseLabel.set('Friend of');
      expect(component.isFormValid()).toBe(true);
    });

    it('should not call dialogRef.close on save when invalid', () => {
      const { component, dialogRefMock } = createComponent({
        isNew: true,
        availableSchemas: [],
      });
      component.onSave();
      expect(dialogRefMock.close).not.toHaveBeenCalled();
    });

    it('should call dialogRef.close with result on valid save', () => {
      const { component, dialogRefMock } = createComponent({
        isNew: true,
        availableSchemas: [],
      });
      component.name.set('Friend');
      component.inverseLabel.set('Friend of');
      component.onSave();

      expect(dialogRefMock.close).toHaveBeenCalledOnce();
      const result = dialogRefMock.close.mock.calls[0][0];
      expect(result).not.toBeNull();
      expect(result.name).toBe('Friend');
      expect(result.inverseLabel).toBe('Friend of');
    });

    it('should trim whitespace from name and inverseLabel on save', () => {
      const { component, dialogRefMock } = createComponent({
        isNew: true,
        availableSchemas: [],
      });
      component.name.set('  Friend  ');
      component.inverseLabel.set('  Friend of  ');
      component.onSave();

      const result = dialogRefMock.close.mock.calls[0][0];
      expect(result.name).toBe('Friend');
      expect(result.inverseLabel).toBe('Friend of');
    });

    it('should call dialogRef.close(null) on cancel', () => {
      const { component, dialogRefMock } = createComponent({
        isNew: true,
        availableSchemas: [],
      });
      component.onCancel();
      expect(dialogRefMock.close).toHaveBeenCalledWith(null);
    });
  });

  // ── Edit mode ──────────────────────────────────────────────────────────────

  describe('edit mode (existing type)', () => {
    const existingType = {
      id: 'custom-test',
      name: 'Rival',
      inverseLabel: 'Rivalled by',
      showInverse: false,
      category: RelationshipCategory.Social,
      isBuiltIn: false,
      icon: 'bolt',
      color: '#FF4500',
      sourceEndpoint: { allowedSchemas: ['character-v1'], maxCount: 1 },
      targetEndpoint: { allowedSchemas: [], maxCount: null },
    };

    it('should pre-populate all fields from the existing type', () => {
      const { component } = createComponent({
        type: existingType,
        isNew: false,
        availableSchemas: MOCK_SCHEMAS,
      });
      expect(component.name()).toBe('Rival');
      expect(component.inverseLabel()).toBe('Rivalled by');
      expect(component.showInverse()).toBe(false);
      expect(component.category()).toBe(RelationshipCategory.Social);
      expect(component.icon()).toBe('bolt');
      expect(component.color()).toBe('#FF4500');
    });

    it('should set sourceAnyType=false when allowedSchemas is non-empty', () => {
      const { component } = createComponent({
        type: existingType,
        isNew: false,
        availableSchemas: MOCK_SCHEMAS,
      });
      expect(component.sourceAnyType()).toBe(false);
      expect(component.sourceSchemas()).toEqual(['character-v1']);
    });

    it('should set targetAnyType=true when allowedSchemas is empty', () => {
      const { component } = createComponent({
        type: existingType,
        isNew: false,
        availableSchemas: MOCK_SCHEMAS,
      });
      expect(component.targetAnyType()).toBe(true);
    });

    it('should pre-populate sourceMaxCount', () => {
      const { component } = createComponent({
        type: existingType,
        isNew: false,
        availableSchemas: MOCK_SCHEMAS,
      });
      expect(component.sourceMaxCount()).toBe(1);
    });

    it('should be valid immediately with pre-populated data', () => {
      const { component } = createComponent({
        type: existingType,
        isNew: false,
        availableSchemas: MOCK_SCHEMAS,
      });
      expect(component.isFormValid()).toBe(true);
    });

    it('should save with sourceEndpoint using selected schemas when anyType=false', () => {
      const { component, dialogRefMock } = createComponent({
        type: existingType,
        isNew: false,
        availableSchemas: MOCK_SCHEMAS,
      });
      component.onSave();
      const result = dialogRefMock.close.mock.calls[0][0];
      expect(result.sourceEndpoint.allowedSchemas).toEqual(['character-v1']);
      expect(result.targetEndpoint.allowedSchemas).toEqual([]);
    });
  });

  // ── Icon selection ─────────────────────────────────────────────────────────

  describe('icon selection', () => {
    it('should update icon signal when icon is set', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: [],
      });
      component.icon.set('star');
      expect(component.icon()).toBe('star');
    });
  });

  // ── Color selection ────────────────────────────────────────────────────────

  describe('color selection', () => {
    it('should update color signal when color is set', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: [],
      });
      component.color.set('#DC143C');
      expect(component.color()).toBe('#DC143C');
    });

    it('getTextColor should return white for dark colors', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: [],
      });
      expect(component.getTextColor('#000000')).toBe('#ffffff');
    });

    it('getTextColor should return black for light colors', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: [],
      });
      expect(component.getTextColor('#FFFFFF')).toBe('#000000');
    });
  });

  // ── Schema toggles ─────────────────────────────────────────────────────────

  describe('schema toggles', () => {
    it('should add a schema to sourceSchemas when toggled on', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: MOCK_SCHEMAS,
      });
      component.sourceAnyType.set(false);
      component.toggleSourceSchema('character-v1', true);
      expect(component.isSourceSchemaSelected('character-v1')).toBe(true);
    });

    it('should remove a schema from sourceSchemas when toggled off', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: MOCK_SCHEMAS,
      });
      component.sourceSchemas.set(['character-v1', 'location-v1']);
      component.toggleSourceSchema('character-v1', false);
      expect(component.sourceSchemas()).toEqual(['location-v1']);
    });

    it('should add a schema to targetSchemas when toggled on', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: MOCK_SCHEMAS,
      });
      component.targetAnyType.set(false);
      component.toggleTargetSchema('location-v1', true);
      expect(component.isTargetSchemaSelected('location-v1')).toBe(true);
    });

    it('should remove a schema from targetSchemas when toggled off', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: MOCK_SCHEMAS,
      });
      component.targetSchemas.set(['character-v1', 'location-v1']);
      component.toggleTargetSchema('location-v1', false);
      expect(component.targetSchemas()).toEqual(['character-v1']);
    });

    it('should output empty allowedSchemas when anyType toggle is on', () => {
      const { component, dialogRefMock } = createComponent({
        isNew: true,
        availableSchemas: MOCK_SCHEMAS,
      });
      component.name.set('Test');
      component.inverseLabel.set('Test of');
      component.sourceAnyType.set(true);
      component.sourceSchemas.set(['character-v1']);
      component.targetAnyType.set(true);
      component.onSave();
      const result = dialogRefMock.close.mock.calls[0][0];
      expect(result.sourceEndpoint.allowedSchemas).toEqual([]);
      expect(result.targetEndpoint.allowedSchemas).toEqual([]);
    });
  });

  // ── Max count ──────────────────────────────────────────────────────────────

  describe('max count parsing', () => {
    it('should parse empty string as null (unlimited)', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: [],
      });
      expect(component.parseMaxCount('')).toBeNull();
    });

    it('should parse "0" as null (unlimited)', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: [],
      });
      expect(component.parseMaxCount('0')).toBeNull();
    });

    it('should parse "3" as 3', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: [],
      });
      expect(component.parseMaxCount('3')).toBe(3);
    });

    it('should parse invalid string as null', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: [],
      });
      expect(component.parseMaxCount('abc')).toBeNull();
    });

    it('onSourceMaxCountChange should update sourceMaxCount signal', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: [],
      });
      component.onSourceMaxCountChange('5');
      expect(component.sourceMaxCount()).toBe(5);
    });

    it('onTargetMaxCountChange should update targetMaxCount signal', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: [],
      });
      component.onTargetMaxCountChange('2');
      expect(component.targetMaxCount()).toBe(2);
    });

    it('maxCountDisplay should return empty string for null', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: [],
      });
      expect(component.maxCountDisplay(null)).toBe('');
    });

    it('maxCountDisplay should return string representation for a number', () => {
      const { component } = createComponent({
        isNew: true,
        availableSchemas: [],
      });
      expect(component.maxCountDisplay(4)).toBe('4');
    });
  });
});
