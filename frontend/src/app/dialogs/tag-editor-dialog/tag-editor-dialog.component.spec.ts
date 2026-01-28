import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { TagService } from '../../services/tag/tag.service';
import {
  TagEditorDialogComponent,
  TagEditorDialogData,
} from './tag-editor-dialog.component';

describe('TagEditorDialogComponent', () => {
  let component: TagEditorDialogComponent;
  let fixture: ComponentFixture<TagEditorDialogComponent>;
  let dialogRefMock: { close: Mock };

  const mockDialogData: TagEditorDialogData = {
    elementId: 'element-123',
    elementName: 'Test Element',
  };

  beforeEach(async () => {
    dialogRefMock = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [TagEditorDialogComponent, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
        {
          provide: TagService,
          useValue: {
            getTagsForElement: vi.fn().mockReturnValue([]),
            getAllTags: vi.fn().mockReturnValue([]),
            getResolvedTagsForElement: vi.fn().mockReturnValue([]),
            getAvailableTagsForElement: vi.fn().mockReturnValue([]),
            addTagToElement: vi.fn().mockResolvedValue(undefined),
            removeTagFromElement: vi.fn().mockResolvedValue(undefined),
            createTag: vi.fn().mockResolvedValue({ id: 'new-tag' }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TagEditorDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have dialog data', () => {
    expect(component.data.elementId).toBe('element-123');
    expect(component.data.elementName).toBe('Test Element');
  });

  it('should close dialog when close is called', () => {
    component.close();
    expect(dialogRefMock.close).toHaveBeenCalled();
  });
});
