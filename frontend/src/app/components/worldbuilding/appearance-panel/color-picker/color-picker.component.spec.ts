import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { type MockedObject, vi } from 'vitest';

import { ColorPickerComponent } from './color-picker.component';

describe('ColorPickerComponent', () => {
  let component: ColorPickerComponent;
  let fixture: ComponentFixture<ColorPickerComponent>;
  let dialogGateway: MockedObject<DialogGatewayService>;

  beforeEach(async () => {
    dialogGateway = {
      openColourChooserDialog: vi.fn().mockResolvedValue(null),
    } as unknown as MockedObject<DialogGatewayService>;

    await TestBed.configureTestingModule({
      imports: [ColorPickerComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DialogGatewayService, useValue: dialogGateway },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ColorPickerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('value', '#4fd8eb');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should open the colour dialog and emit the chosen colour', async () => {
    dialogGateway.openColourChooserDialog.mockResolvedValue('#ff0000');
    const emit = vi.fn();
    component.valueChange.subscribe(emit);

    await component['openPicker']();

    expect(dialogGateway.openColourChooserDialog).toHaveBeenCalledWith({
      colour: '#4fd8eb',
    });
    expect(emit).toHaveBeenCalledWith('#ff0000');
  });

  it('should not emit when the dialog is cancelled', async () => {
    dialogGateway.openColourChooserDialog.mockResolvedValue(undefined);
    const emit = vi.fn();
    component.valueChange.subscribe(emit);

    await component['openPicker']();

    expect(emit).not.toHaveBeenCalled();
  });

  it('should not open the dialog when disabled', async () => {
    fixture.componentRef.setInput('disabled', true);
    await component['openPicker']();
    expect(dialogGateway.openColourChooserDialog).not.toHaveBeenCalled();
  });
});
