import {
  type ComponentRef,
  provideZonelessChangeDetection,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { describe, expect, it, vi } from 'vitest';

import {
  MediaFilterPanelComponent,
  type MediaFilterState,
} from './media-filter-panel.component';

describe('MediaFilterPanelComponent', () => {
  let component: MediaFilterPanelComponent;
  let fixture: ComponentFixture<MediaFilterPanelComponent>;
  let ref: ComponentRef<MediaFilterPanelComponent>;

  const defaultFilters: MediaFilterState = {
    category: 'all',
    elementIds: [],
    tagIds: [],
    dateFrom: null,
    dateTo: null,
  };

  function setup(filters: MediaFilterState = defaultFilters) {
    TestBed.configureTestingModule({
      imports: [MediaFilterPanelComponent, NoopAnimationsModule],
      providers: [provideZonelessChangeDetection()],
    });

    fixture = TestBed.createComponent(MediaFilterPanelComponent);
    component = fixture.componentInstance;
    ref = fixture.componentRef;
    ref.setInput('filters', filters);
    fixture.detectChanges();
  }

  it('should create', () => {
    setup();
    expect(component).toBeTruthy();
  });

  describe('activeFilterCount', () => {
    it('should return 0 when no filters active', () => {
      setup();
      expect(component.activeFilterCount()).toBe(0);
    });

    it('should count category filter', () => {
      setup({ ...defaultFilters, category: 'cover' });
      expect(component.activeFilterCount()).toBe(1);
    });

    it('should count element IDs', () => {
      setup({ ...defaultFilters, elementIds: ['e1', 'e2'] });
      expect(component.activeFilterCount()).toBe(2);
    });

    it('should count tag IDs', () => {
      setup({ ...defaultFilters, tagIds: ['t1'] });
      expect(component.activeFilterCount()).toBe(1);
    });

    it('should count date filters', () => {
      setup({
        ...defaultFilters,
        dateFrom: new Date('2025-01-01'),
        dateTo: new Date('2025-12-31'),
      });
      expect(component.activeFilterCount()).toBe(2);
    });

    it('should sum all active filters', () => {
      setup({
        category: 'generated',
        elementIds: ['e1'],
        tagIds: ['t1', 't2'],
        dateFrom: new Date('2025-01-01'),
        dateTo: null,
      });
      expect(component.activeFilterCount()).toBe(5);
    });
  });

  describe('selectedElements', () => {
    it('should resolve element IDs to element objects', () => {
      setup({ ...defaultFilters, elementIds: ['e1', 'e2'] });
      ref.setInput('availableElements', [
        { id: 'e1', name: 'Character', icon: 'person' },
        { id: 'e2', name: 'Location', icon: 'place' },
        { id: 'e3', name: 'Item', icon: 'inventory_2' },
      ]);
      fixture.detectChanges();
      const selected = component.selectedElements();
      expect(selected.length).toBe(2);
      expect(selected[0].name).toBe('Character');
    });

    it('should skip unknown element IDs', () => {
      setup({ ...defaultFilters, elementIds: ['e1', 'unknown'] });
      ref.setInput('availableElements', [
        { id: 'e1', name: 'Character', icon: 'person' },
      ]);
      fixture.detectChanges();
      expect(component.selectedElements().length).toBe(1);
    });
  });

  describe('selectedTags', () => {
    it('should resolve tag IDs to tag objects', () => {
      setup({ ...defaultFilters, tagIds: ['t1'] });
      ref.setInput('availableTags', [
        { id: 't1', name: 'Hero', icon: 'star', color: '#ff0000' },
      ]);
      fixture.detectChanges();
      expect(component.selectedTags().length).toBe(1);
      expect(component.selectedTags()[0].name).toBe('Hero');
    });
  });

  describe('filter mutations', () => {
    it('should emit new category on setCategory', () => {
      setup();
      const spy = vi.fn();
      component.filtersChange.subscribe(spy);
      component.setCategory('cover');
      expect(spy).toHaveBeenCalledWith({
        ...defaultFilters,
        category: 'cover',
      });
    });

    it('should emit without element on removeElement', () => {
      const filters = { ...defaultFilters, elementIds: ['e1', 'e2'] };
      setup(filters);
      const spy = vi.fn();
      component.filtersChange.subscribe(spy);
      component.removeElement('e1');
      expect(spy).toHaveBeenCalledWith({
        ...filters,
        elementIds: ['e2'],
      });
    });

    it('should emit without tag on removeTag', () => {
      const filters = { ...defaultFilters, tagIds: ['t1', 't2'] };
      setup(filters);
      const spy = vi.fn();
      component.filtersChange.subscribe(spy);
      component.removeTag('t1');
      expect(spy).toHaveBeenCalledWith({
        ...filters,
        tagIds: ['t2'],
      });
    });

    it('should emit dateFrom on setDateFrom', () => {
      setup();
      const spy = vi.fn();
      component.filtersChange.subscribe(spy);
      const date = new Date('2025-06-15');
      component.setDateFrom(date);
      expect(spy).toHaveBeenCalledWith({ ...defaultFilters, dateFrom: date });
    });

    it('should emit dateTo on setDateTo', () => {
      setup();
      const spy = vi.fn();
      component.filtersChange.subscribe(spy);
      const date = new Date('2025-12-31');
      component.setDateTo(date);
      expect(spy).toHaveBeenCalledWith({ ...defaultFilters, dateTo: date });
    });
  });

  describe('output events', () => {
    it('should emit addElement', () => {
      setup();
      const spy = vi.fn();
      component.addElement.subscribe(spy);
      component.onAddElement();
      expect(spy).toHaveBeenCalled();
    });

    it('should emit addTag', () => {
      setup();
      const spy = vi.fn();
      component.addTag.subscribe(spy);
      component.onAddTag();
      expect(spy).toHaveBeenCalled();
    });

    it('should emit clearAll', () => {
      setup();
      const spy = vi.fn();
      component.clearAll.subscribe(spy);
      component.onClearAll();
      expect(spy).toHaveBeenCalled();
    });

    it('should emit closePanel', () => {
      setup();
      const spy = vi.fn();
      component.closePanel.subscribe(spy);
      component.onClose();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('categories', () => {
    it('should have predefined categories', () => {
      setup();
      expect(component.categories.length).toBe(6);
      expect(component.categories[0].value).toBe('all');
    });
  });
});
