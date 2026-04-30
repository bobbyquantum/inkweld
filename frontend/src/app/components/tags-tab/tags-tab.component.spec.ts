import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { type TagDefinition, type TagIndexEntry } from '@models/tag.model';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { TagService } from '@services/tag/tag.service';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TagsTabComponent } from './tags-tab.component';

describe('TagsTabComponent', () => {
  let component: TagsTabComponent;
  let fixture: ComponentFixture<TagsTabComponent>;
  let mockTagService: Partial<TagService>;
  let mockProjectState: Partial<ProjectStateService>;
  let mockSnackBar: Partial<MatSnackBar>;
  let mockDialog: Partial<MatDialog>;
  let mockDialogGateway: Partial<DialogGatewayService>;

  const mockTags: TagDefinition[] = [
    {
      id: 'tag-1',
      name: 'Protagonist',
      icon: 'star',
      color: '#FFD700',
      description: 'Main character',
    },
    {
      id: 'tag-2',
      name: 'Complete',
      icon: 'check_circle',
      color: '#228B22',
    },
  ];

  const mockTagIndex: TagIndexEntry[] = [
    {
      definition: mockTags[0],
      count: 2,
      elementIds: ['elem1', 'elem2'],
    },
    {
      definition: mockTags[1],
      count: 1,
      elementIds: ['elem1'],
    },
  ];

  beforeEach(async () => {
    mockTagService = {
      tagIndex: signal(mockTagIndex),
      createCustomTag: vi.fn().mockReturnValue({ id: 'new-tag', name: 'New' }),
      updateCustomTag: vi
        .fn()
        .mockReturnValue({ id: 'tag-1', name: 'Updated' }),
      deleteCustomTag: vi.fn().mockReturnValue(true),
    };

    mockProjectState = {
      project: signal({
        id: 1,
        name: 'Test Project',
        slug: 'test-project',
        owner: { username: 'testuser' },
      } as never),
      openSystemTab: vi.fn(),
      elements: signal([
        { id: 'a', name: 'Element A', type: 'ITEM' },
        { id: 'b', name: 'Element B', type: 'ITEM' },
        { id: 'c', name: 'Element C', type: 'ITEM' },
      ] as never[]),
      openDocument: vi.fn(),
    };

    mockSnackBar = {
      open: vi.fn(),
    };

    mockDialog = {
      open: vi.fn().mockReturnValue({
        afterClosed: () =>
          of({ name: 'New Tag', icon: 'star', color: '#FF0000' }),
      }),
    };

    mockDialogGateway = {
      openConfirmationDialog: vi.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [TagsTabComponent, NoopAnimationsModule, FormsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: TagService, useValue: mockTagService },
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: MatDialog, useValue: mockDialog },
        { provide: DialogGatewayService, useValue: mockDialogGateway },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TagsTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initialization', () => {
    it('should have tags signal', () => {
      expect(component.tags).toBeDefined();
    });

    it('should have empty search query by default', () => {
      expect(component.searchQuery()).toBe('');
    });

    it('should have isLoading false by default', () => {
      expect(component.isLoading()).toBe(false);
    });

    it('should have error null by default', () => {
      expect(component.error()).toBe(null);
    });
  });

  describe('hasTags computed', () => {
    it('should return true when tags exist', () => {
      component.tags.set([
        {
          id: '1',
          name: 'Test',
          icon: 'star',
          color: '#FFF',
          count: 0,
          elementIds: [],
        },
      ]);
      expect(component.hasTags()).toBe(true);
    });

    it('should return false when no tags', () => {
      component.tags.set([]);
      expect(component.hasTags()).toBe(false);
    });
  });

  describe('filteredTags computed', () => {
    beforeEach(() => {
      component.tags.set([
        {
          id: '1',
          name: 'Protagonist',
          icon: 'star',
          color: '#FFD700',
          count: 2,
          elementIds: [],
        },
        {
          id: '2',
          name: 'Complete',
          icon: 'check',
          color: '#228B22',
          count: 1,
          elementIds: [],
        },
      ]);
    });

    it('should return all tags when no search query', () => {
      component.searchQuery.set('');
      expect(component.filteredTags().length).toBe(2);
    });

    it('should filter tags by name', () => {
      component.searchQuery.set('prot');
      expect(component.filteredTags().length).toBe(1);
      expect(component.filteredTags()[0].name).toBe('Protagonist');
    });

    it('should be case-insensitive', () => {
      component.searchQuery.set('COMPLETE');
      expect(component.filteredTags().length).toBe(1);
      expect(component.filteredTags()[0].name).toBe('Complete');
    });
  });

  describe('getTextColor', () => {
    it('should return black for light backgrounds', () => {
      expect(component.getTextColor('#FFFFFF')).toBe('#000000');
      expect(component.getTextColor('#FFD700')).toBe('#000000');
    });

    it('should return white for dark backgrounds', () => {
      expect(component.getTextColor('#000000')).toBe('#ffffff');
      expect(component.getTextColor('#1E90FF')).toBe('#ffffff');
    });
  });

  describe('viewTaggedElements', () => {
    it('should show message when tag has no elements', () => {
      const tag = {
        id: '1',
        name: 'Empty',
        icon: 'star',
        color: '#FFF',
        count: 0,
        elementIds: [],
      };
      component.viewTaggedElements(tag);
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'No elements have this tag',
        'Dismiss',
        { duration: 3000 }
      );
    });

    it('should open first tagged element and show count message when tag has multiple elements', () => {
      const tag = {
        id: '1',
        name: 'Test',
        icon: 'star',
        color: '#FFF',
        count: 3,
        elementIds: ['a', 'b', 'c'],
      };
      component.viewTaggedElements(tag);
      expect(mockProjectState.openDocument).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'a', name: 'Element A' })
      );
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Opened "Element A". 2 more element(s) also have this tag.',
        'Dismiss',
        { duration: 4000 }
      );
    });

    it('should open single tagged element without extra message', () => {
      const tag = {
        id: '1',
        name: 'Single',
        icon: 'star',
        color: '#FFF',
        count: 1,
        elementIds: ['a'],
      };
      component.viewTaggedElements(tag);
      expect(mockProjectState.openDocument).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'a', name: 'Element A' })
      );
      expect(mockSnackBar.open).not.toHaveBeenCalled();
    });

    it('should show message when tagged elements are not found in project', () => {
      const tag = {
        id: '1',
        name: 'Orphan',
        icon: 'star',
        color: '#FFF',
        count: 2,
        elementIds: ['nonexistent-1', 'nonexistent-2'],
      };
      component.viewTaggedElements(tag);
      expect(mockProjectState.openDocument).not.toHaveBeenCalled();
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Tagged elements not found',
        'Dismiss',
        { duration: 3000 }
      );
    });
  });

  describe('loadTags', () => {
    it('should set isLoading true then false', () => {
      component.loadTags();
      expect(component.isLoading()).toBe(false); // Already finished in sync mode
    });

    it('should not throw when project is null', () => {
      (mockProjectState.project as ReturnType<typeof signal>).set(null);
      expect(() => component.loadTags()).not.toThrow();
    });
  });

  describe('createTag', () => {
    it('should open tag edit dialog', async () => {
      await component.createTag();
      expect(mockDialog.open).toHaveBeenCalled();
    });

    it('should create tag on successful dialog', async () => {
      await component.createTag();
      expect(mockTagService.createCustomTag).toHaveBeenCalled();
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        expect.stringContaining('Created tag'),
        'Dismiss',
        { duration: 3000 }
      );
    });

    it('should not create tag if dialog cancelled', async () => {
      (mockDialog.open as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        afterClosed: () => of(undefined),
      });
      await component.createTag();
      expect(mockTagService.createCustomTag).not.toHaveBeenCalled();
    });
  });

  describe('editTag', () => {
    it('should open tag edit dialog with existing tag', async () => {
      const tag = {
        id: '1',
        name: 'Test',
        icon: 'star',
        color: '#FFF',
        count: 0,
        elementIds: [],
      };
      await component.editTag(tag);
      expect(mockDialog.open).toHaveBeenCalled();
    });

    it('should update tag on successful dialog', async () => {
      const tag = {
        id: '1',
        name: 'Test',
        icon: 'star',
        color: '#FFF',
        count: 0,
        elementIds: [],
      };
      await component.editTag(tag);
      expect(mockTagService.updateCustomTag).toHaveBeenCalled();
    });
  });

  describe('deleteTag', () => {
    it('should show confirmation dialog', async () => {
      const tag = {
        id: '1',
        name: 'Test',
        icon: 'star',
        color: '#FFF',
        count: 0,
        elementIds: [],
      };
      await component.deleteTag(tag);
      expect(mockDialogGateway.openConfirmationDialog).toHaveBeenCalled();
    });

    it('should delete tag when confirmed', async () => {
      const tag = {
        id: '1',
        name: 'Test',
        icon: 'star',
        color: '#FFF',
        count: 0,
        elementIds: [],
      };
      await component.deleteTag(tag);
      expect(mockTagService.deleteCustomTag).toHaveBeenCalledWith('1');
    });

    it('should not delete tag when cancelled', async () => {
      (
        mockDialogGateway.openConfirmationDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(false);
      const tag = {
        id: '1',
        name: 'Test',
        icon: 'star',
        color: '#FFF',
        count: 0,
        elementIds: [],
      };
      await component.deleteTag(tag);
      expect(mockTagService.deleteCustomTag).not.toHaveBeenCalled();
    });
  });
});
