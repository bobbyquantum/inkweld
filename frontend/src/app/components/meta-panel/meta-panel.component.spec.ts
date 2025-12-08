import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { DocumentSnapshotService } from '@services/project/document-snapshot.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { MetaPanelComponent } from './meta-panel.component';

describe('MetaPanelComponent', () => {
  let component: MetaPanelComponent;
  let fixture: ComponentFixture<MetaPanelComponent>;

  beforeEach(async () => {
    // Mock services to prevent errors when panel opens
    const snapshotServiceMock = {
      listSnapshots: vi.fn().mockReturnValue(of([])),
    };

    const relationshipServiceMock = {
      relationships: signal([]),
      customRelationshipTypes: signal([]),
    };

    const projectStateMock = {
      elements: signal([]),
      openDocument: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [MetaPanelComponent, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        { provide: DocumentSnapshotService, useValue: snapshotServiceMock },
        { provide: RelationshipService, useValue: relationshipServiceMock },
        { provide: ProjectStateService, useValue: projectStateMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MetaPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('documentId', 'test-doc-id');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('toggle', () => {
    it('should emit openChange with true when panel is closed', () => {
      fixture.componentRef.setInput('isOpen', false);
      fixture.detectChanges();

      const openChangeSpy = vi.fn();
      component.openChange.subscribe(openChangeSpy);

      component.toggle();

      expect(openChangeSpy).toHaveBeenCalledWith(true);
    });

    it('should emit openChange with false when panel is open', () => {
      fixture.componentRef.setInput('isOpen', true);
      fixture.detectChanges();

      const openChangeSpy = vi.fn();
      component.openChange.subscribe(openChangeSpy);

      component.toggle();

      expect(openChangeSpy).toHaveBeenCalledWith(false);
    });
  });

  describe('open', () => {
    it('should emit openChange with true when closed', () => {
      fixture.componentRef.setInput('isOpen', false);
      fixture.detectChanges();

      const openChangeSpy = vi.fn();
      component.openChange.subscribe(openChangeSpy);

      component.open();

      expect(openChangeSpy).toHaveBeenCalledWith(true);
    });

    it('should not emit when already open', () => {
      fixture.componentRef.setInput('isOpen', true);
      fixture.detectChanges();

      const openChangeSpy = vi.fn();
      component.openChange.subscribe(openChangeSpy);

      component.open();

      expect(openChangeSpy).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should emit openChange with false when open', () => {
      fixture.componentRef.setInput('isOpen', true);
      fixture.detectChanges();

      const openChangeSpy = vi.fn();
      component.openChange.subscribe(openChangeSpy);

      component.close();

      expect(openChangeSpy).toHaveBeenCalledWith(false);
    });

    it('should not emit when already closed', () => {
      fixture.componentRef.setInput('isOpen', false);
      fixture.detectChanges();

      const openChangeSpy = vi.fn();
      component.openChange.subscribe(openChangeSpy);

      component.close();

      expect(openChangeSpy).not.toHaveBeenCalled();
    });
  });

  describe('accordion sections', () => {
    it('should start with relationships section expanded', () => {
      expect(component.expandedSection()).toBe('relationships');
    });

    it('should change expanded section on onSectionChange', () => {
      component.onSectionChange('snapshots');
      expect(component.expandedSection()).toBe('snapshots');

      component.onSectionChange('relationships');
      expect(component.expandedSection()).toBe('relationships');

      component.onSectionChange(null);
      expect(component.expandedSection()).toBeNull();
    });
  });
});
