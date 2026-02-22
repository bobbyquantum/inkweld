import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MockedObject, vi } from 'vitest';

import { Element } from '../../../api-client/model/element';
import { ProjectStateService } from '../../services/project/project-state.service';
import {
  CanvasPinDialogComponent,
  CanvasPinDialogData,
} from './canvas-pin-dialog.component';

describe('CanvasPinDialogComponent', () => {
  let component: CanvasPinDialogComponent;
  let fixture: ComponentFixture<CanvasPinDialogComponent>;
  let mockDialogRef: MockedObject<MatDialogRef<CanvasPinDialogComponent>>;

  const mockData: CanvasPinDialogData = {
    title: 'Place Pin',
    label: 'Test Pin',
    color: '#E53935',
  };

  const mockProjectState = {
    elements: signal<Element[]>([]),
  };

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    } as Partial<MatDialogRef<CanvasPinDialogComponent>> as MockedObject<
      MatDialogRef<CanvasPinDialogComponent>
    >;

    await TestBed.configureTestingModule({
      imports: [CanvasPinDialogComponent, MatDialogModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockData },
        { provide: ProjectStateService, useValue: mockProjectState },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CanvasPinDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize label control with provided label', () => {
    expect(component['labelControl'].value).toBe('Test Pin');
  });

  it('should initialize selected color', () => {
    expect(component['selectedColor']).toBe('#E53935');
  });

  it('should close dialog on cancel', () => {
    component['onCancel']();
    expect(mockDialogRef.close).toHaveBeenCalledWith();
  });

  it('should close with result on confirm when valid', () => {
    component['labelControl'].setValue('My Pin');
    component['selectedColor'] = '#1E88E5';
    component['onConfirm']();
    expect(mockDialogRef.close).toHaveBeenCalledWith({
      label: 'My Pin',
      color: '#1E88E5',
      linkedElementId: undefined,
    });
  });

  it('should not close on confirm when label is empty', () => {
    component['labelControl'].setValue('');
    component['labelControl'].markAsTouched();
    component['onConfirm']();
    expect(mockDialogRef.close).not.toHaveBeenCalled();
  });

  it('should update color on colorChange', () => {
    component['onColorChange']('#43A047');
    expect(component['selectedColor']).toBe('#43A047');
  });

  it('should initialize with linked element when provided', () => {
    component['linkedElementId'].set('el-123');
    component['linkedElementName'].set('Castle Town');

    expect(component['linkedElementId']()).toBe('el-123');
    expect(component['linkedElementName']()).toBe('Castle Town');
  });

  it('should clear linked element on clearLink', () => {
    component['linkedElementId'].set('el-123');
    component['linkedElementName'].set('Castle Town');

    component['clearLink']();

    expect(component['linkedElementId']()).toBeUndefined();
    expect(component['linkedElementName']()).toBeUndefined();
  });

  it('should include linkedElementId in confirm result', () => {
    component['labelControl'].setValue('Map Pin');
    component['selectedColor'] = '#E53935';
    component['linkedElementId'].set('el-456');

    component['onConfirm']();

    expect(mockDialogRef.close).toHaveBeenCalledWith({
      label: 'Map Pin',
      color: '#E53935',
      linkedElementId: 'el-456',
    });
  });
});
