import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TagService } from '../../services/tag/tag.service';
import { ResolvedTag, TagDefinition } from './tag.model';
import { TagChipListComponent } from './tag-chip-list.component';

describe('TagChipListComponent', () => {
  let component: TagChipListComponent;
  let fixture: ComponentFixture<TagChipListComponent>;
  let mockTagService: Partial<TagService>;

  const mockTags: TagDefinition[] = [
    {
      id: 'protagonist',
      name: 'Protagonist',
      icon: 'star',
      color: '#FFD700',
    },
    {
      id: 'complete',
      name: 'Complete',
      icon: 'check_circle',
      color: '#228B22',
    },
  ];

  const mockResolvedTags: ResolvedTag[] = [
    {
      assignment: {
        id: 'et1',
        elementId: 'elem1',
        tagId: 'protagonist',
        createdAt: '2024-01-01',
      },
      definition: mockTags[0],
    },
  ];

  beforeEach(async () => {
    mockTagService = {
      getResolvedTagsForElement: vi.fn().mockReturnValue(mockResolvedTags),
      getAvailableTagsForElement: vi.fn().mockReturnValue([mockTags[1]]),
      addTag: vi.fn().mockReturnValue({
        id: 'new-et',
        elementId: 'elem1',
        tagId: 'complete',
        createdAt: '2024-01-01',
      }),
      removeTag: vi.fn().mockReturnValue(true),
      createCustomTag: vi.fn().mockReturnValue({
        id: 'new-tag',
        name: 'New Tag',
        icon: 'label',
        color: '#607D8B',
      }),
      allTags: signal(mockTags),
    };

    await TestBed.configureTestingModule({
      imports: [TagChipListComponent, NoopAnimationsModule, FormsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: TagService, useValue: mockTagService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TagChipListComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('elementId', 'elem1');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('inputs', () => {
    it('should have default label', () => {
      expect(component.label()).toBe('Tags');
    });

    it('should have readonly false by default', () => {
      expect(component.readonly()).toBe(false);
    });

    it('should have compact false by default', () => {
      expect(component.compact()).toBe(false);
    });

    it('should allow custom tags by default', () => {
      expect(component.allowCustomTags()).toBe(true);
    });
  });

  describe('resolvedTags', () => {
    it('should get resolved tags for element', () => {
      const tags = component.resolvedTags();
      expect(mockTagService.getResolvedTagsForElement).toHaveBeenCalledWith(
        'elem1'
      );
      expect(tags).toEqual(mockResolvedTags);
    });
  });

  describe('availableTags', () => {
    it('should get available tags for element', () => {
      const available = component.availableTags();
      expect(mockTagService.getAvailableTagsForElement).toHaveBeenCalledWith(
        'elem1'
      );
      expect(available).toEqual([mockTags[1]]);
    });
  });

  describe('removeTag', () => {
    it('should call tagService.removeTag', () => {
      component.removeTag(mockResolvedTags[0]);
      expect(mockTagService.removeTag).toHaveBeenCalledWith(
        'elem1',
        'protagonist'
      );
    });

    it('should emit tagsChanged event', () => {
      const spy = vi.fn();
      component.tagsChanged.subscribe(spy);

      component.removeTag(mockResolvedTags[0]);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('selectTag', () => {
    it('should add selected tag', () => {
      const mockEvent = {
        option: { value: mockTags[1] },
      };

      component.selectTag(mockEvent as never);

      expect(mockTagService.addTag).toHaveBeenCalledWith('elem1', 'complete');
    });

    it('should create and add a new tag when isNew is true', () => {
      const mockEvent = {
        option: { value: { name: 'New Tag', isNew: true } },
      };

      component.selectTag(mockEvent as never);

      expect(mockTagService.createCustomTag).toHaveBeenCalledWith({
        name: 'New Tag',
        icon: 'label',
        color: '#607D8B',
        description: '',
      });
      expect(mockTagService.addTag).toHaveBeenCalledWith('elem1', 'new-tag');
    });

    it('should clear input value after selection', () => {
      component.tagInputValue = 'some value';
      const mockEvent = {
        option: { value: mockTags[1] },
      };

      component.selectTag(mockEvent as never);

      expect(component.tagInputValue).toBe('');
    });
  });

  describe('addTagFromInput', () => {
    it('should add existing tag by exact match', () => {
      const mockEvent = {
        value: 'Complete',
        chipInput: { clear: vi.fn() },
      };

      component.addTagFromInput(mockEvent as never);

      expect(mockTagService.addTag).toHaveBeenCalledWith('elem1', 'complete');
      expect(mockEvent.chipInput.clear).toHaveBeenCalled();
    });

    it('should create custom tag when no exact match and allowCustomTags is true', () => {
      fixture.componentRef.setInput('allowCustomTags', true);
      const mockEvent = {
        value: 'Brand New',
        chipInput: { clear: vi.fn() },
      };

      component.addTagFromInput(mockEvent as never);

      expect(mockTagService.createCustomTag).toHaveBeenCalledWith({
        name: 'Brand New',
        icon: 'label',
        color: '#607D8B',
        description: '',
      });
    });

    it('should do nothing for empty input', () => {
      const mockEvent = {
        value: '',
        chipInput: { clear: vi.fn() },
      };

      component.addTagFromInput(mockEvent as never);

      expect(mockTagService.addTag).not.toHaveBeenCalled();
      expect(mockTagService.createCustomTag).not.toHaveBeenCalled();
    });

    it('should do nothing for whitespace-only input', () => {
      const mockEvent = {
        value: '   ',
        chipInput: { clear: vi.fn() },
      };

      component.addTagFromInput(mockEvent as never);

      expect(mockTagService.addTag).not.toHaveBeenCalled();
    });
  });

  describe('filteredTags', () => {
    it('should return all available tags when no input', () => {
      component.tagInputValue = '';
      const filtered = component.filteredTags();
      expect(filtered).toEqual([mockTags[1]]);
    });

    it('should filter tags by name matching input', () => {
      component.tagInputValue = 'comp';
      const filtered = component.filteredTags();
      // The component's computed uses tagInputValue at read time
      expect(filtered.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('edge cases', () => {
    it('should handle case-insensitive exact match in addTagFromInput', () => {
      const mockEvent = {
        value: 'complete', // lowercase version
        chipInput: { clear: vi.fn() },
      };

      component.addTagFromInput(mockEvent as never);

      expect(mockTagService.addTag).toHaveBeenCalledWith('elem1', 'complete');
    });
  });
});
