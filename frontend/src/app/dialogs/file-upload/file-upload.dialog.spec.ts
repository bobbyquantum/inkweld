import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { FileUploadComponent } from './file-upload.component';

describe('FileUploadDialogComponent', () => {
  let component: FileUploadComponent;
  let fixture: ComponentFixture<FileUploadComponent>;
  let dialogRef: jest.Mocked<MatDialogRef<FileUploadComponent>>;

  // Create a reusable test file with minimal size
  const createTestFile = () =>
    new File(['test'], 'test.txt', { type: 'text/plain' });

  beforeEach(async () => {
    // Simplified mock
    dialogRef = { close: jest.fn() } as any;

    await TestBed.configureTestingModule({
      imports: [FileUploadComponent, NoopAnimationsModule],
      providers: [{ provide: MatDialogRef, useValue: dialogRef }],
    }).compileComponents();

    fixture = TestBed.createComponent(FileUploadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should handle file selection via input', () => {
    const file = createTestFile();
    const event = { target: { files: [file] } } as unknown as Event;

    component.onFileSelected(event);
    expect(component.selectedFile).toBe(file);
  });

  it('should handle file drop', () => {
    const file = createTestFile();
    const event = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      dataTransfer: { files: [file] },
    } as unknown as DragEvent;

    component.onDrop(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(component.selectedFile).toBe(file);
  });

  it('should prevent default on dragover', () => {
    const event = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    } as unknown as DragEvent;

    component.onDragOver(event);

    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('should handle file upload workflow', () => {
    // Test both paths in one test to reduce setup overhead

    // Test: should not close when no file selected
    component.selectedFile = null;
    component.onUpload();
    expect(dialogRef.close).not.toHaveBeenCalled();

    // Test: should close with file when selected
    const file = createTestFile();
    component.selectedFile = file;
    component.onUpload();
    expect(dialogRef.close).toHaveBeenCalledWith(file);
  });

  it('should have the proper accessibility attributes', () => {
    const uploadArea = fixture.nativeElement.querySelector('.upload-area');
    expect(uploadArea.getAttribute('tabindex')).toBe('0');
    expect(uploadArea.getAttribute('role')).toBe('button');
    expect(uploadArea.hasAttribute('aria-label')).toBe(true);
  });

  it('should handle Enter key press for file selection', () => {
    const fileInput = fixture.nativeElement.querySelector('input[type="file"]');
    jest.spyOn(fileInput, 'click');

    const uploadArea = fixture.nativeElement.querySelector('.upload-area');
    const keyEvent = new KeyboardEvent('keydown', { key: 'Enter' });
    uploadArea.dispatchEvent(keyEvent);

    expect(fileInput.click).toHaveBeenCalled();
  });

  it('should handle Space key press for file selection', () => {
    const fileInput = fixture.nativeElement.querySelector('input[type="file"]');
    jest.spyOn(fileInput, 'click');

    const uploadArea = fixture.nativeElement.querySelector('.upload-area');
    const keyEvent = new KeyboardEvent('keydown', { key: ' ' });

    // Create a mock preventDefault function
    keyEvent.preventDefault = jest.fn();

    // Dispatch the event
    uploadArea.dispatchEvent(keyEvent);

    expect(fileInput.click).toHaveBeenCalled();
    expect(keyEvent.preventDefault).toHaveBeenCalled();
  });
});
