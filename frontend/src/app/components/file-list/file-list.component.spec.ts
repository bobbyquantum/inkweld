import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

import { FileSizePipe } from '../../pipes/file-size.pipe';
import { DialogGatewayService } from '../../services/dialog-gateway.service';
import { ProjectFile } from '../../services/project-file.service';
import { FileListComponent } from './file-list.component';

describe('FileListComponent', () => {
  let component: FileListComponent;
  let fixture: ComponentFixture<FileListComponent>;

  const mockFiles: ProjectFile[] = [
    {
      originalName: 'test.txt',
      storedName: 'stored-test.txt',
      contentType: 'text/plain',
      size: 1024,
      uploadDate: new Date(),
      fileUrl: 'http://example.com/test.txt',
    },
  ];

  // Mock DialogGatewayService
  const mockDialogGateway = {
    openImageViewerDialog: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        FileListComponent,
        MatTableModule,
        MatButtonModule,
        MatIconModule,
        FileSizePipe,
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DialogGatewayService, useValue: mockDialogGateway },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FileListComponent);
    component = fixture.componentInstance;

    // Reset mock before each test
    vi.clearAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show "No files" message when files array is empty', () => {
    component.files = [];
    fixture.detectChanges();
    const noFilesMessage = fixture.debugElement.query(By.css('.no-files'));
    expect(noFilesMessage?.nativeElement.textContent).toContain(
      'No files uploaded yet'
    );
  });

  it('should display files in table when files are present', () => {
    component.files = mockFiles;
    // Access the protected columns property through the component instance
    expect(component['columns']).toEqual(['name', 'size', 'type', 'actions']);
    fixture.detectChanges();

    const rows = fixture.debugElement.queryAll(By.css('tr[mat-row]'));
    expect(rows.length).toBe(1);

    // Verify file content is displayed
    const nameCell = fixture.debugElement.query(By.css('td.mat-column-name'));
    expect(nameCell.nativeElement.textContent).toContain('test.txt');
  });

  it('should emit delete event when delete button is clicked', () => {
    component.files = mockFiles;
    fixture.detectChanges();

    const spy = vi.spyOn(component.deleteFile, 'emit');
    const deleteButton = fixture.debugElement.query(
      By.css('button[title="Delete file"]')
    );
    deleteButton.triggerEventHandler('click', null);

    expect(spy).toHaveBeenCalledWith(mockFiles[0]);
  });

  it('should detect image files correctly', () => {
    // Test proper MIME types
    expect(
      component.isImage({ contentType: 'image/jpeg' } as ProjectFile)
    ).toBe(true);
    expect(component.isImage({ contentType: 'image/png' } as ProjectFile)).toBe(
      true
    );

    // Test file extensions without MIME prefix
    expect(component.isImage({ contentType: 'jpeg' } as ProjectFile)).toBe(
      true
    );
    expect(component.isImage({ contentType: 'png' } as ProjectFile)).toBe(true);
    expect(component.isImage({ contentType: 'gif' } as ProjectFile)).toBe(true);

    // Test non-image content types
    expect(
      component.isImage({ contentType: 'text/plain' } as ProjectFile)
    ).toBe(false);
    expect(
      component.isImage({ contentType: 'application/pdf' } as ProjectFile)
    ).toBe(false);
    expect(component.isImage({ contentType: 'txt' } as ProjectFile)).toBe(
      false
    );
  });

  it('should open image viewer dialog when viewImage is called', () => {
    const imageFile: ProjectFile = {
      originalName: 'test.jpg',
      storedName: 'stored-test.jpg',
      contentType: 'image/jpeg',
      size: 1024,
      uploadDate: new Date(),
      fileUrl: 'http://example.com/test.jpg',
    };

    component.viewImage(imageFile);

    expect(mockDialogGateway.openImageViewerDialog).toHaveBeenCalledWith({
      imageUrl: 'http://example.com/test.jpg',
      fileName: 'test.jpg',
    });
  });
});
