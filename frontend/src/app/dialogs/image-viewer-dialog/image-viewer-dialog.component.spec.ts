import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import {
  ImageViewerDialogComponent,
  ImageViewerDialogData,
} from './image-viewer-dialog.component';

describe('ImageViewerDialogComponent', () => {
  let component: ImageViewerDialogComponent;
  let fixture: ComponentFixture<ImageViewerDialogComponent>;

  const mockDialogRef = {
    close: jest.fn(),
  };

  const mockDialogData: ImageViewerDialogData = {
    imageUrl: 'http://example.com/test.jpg',
    fileName: 'test.jpg',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImageViewerDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ImageViewerDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display the image and filename', () => {
    const titleElement = fixture.nativeElement.querySelector('.image-title');
    const imageElement = fixture.nativeElement.querySelector('img');

    expect(titleElement.textContent).toBe('test.jpg');
    expect(imageElement.src).toContain('http://example.com/test.jpg');
    expect(imageElement.alt).toBe('test.jpg');
  });

  it('should close the dialog when closeDialog is called', () => {
    component.closeDialog();
    expect(mockDialogRef.close).toHaveBeenCalled();
  });
});
