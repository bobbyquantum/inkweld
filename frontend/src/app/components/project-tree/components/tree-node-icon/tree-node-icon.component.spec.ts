import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ElementType } from '@inkweld/index';

import { WorldbuildingService } from '../../../../services/worldbuilding/worldbuilding.service';
import { TreeNodeIconComponent } from './tree-node-icon.component';

describe('TreeNodeIconComponent', () => {
  let component: TreeNodeIconComponent;
  let fixture: ComponentFixture<TreeNodeIconComponent>;
  let mockWorldbuildingService: { getSchemaById: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockWorldbuildingService = {
      getSchemaById: vi.fn().mockReturnValue(null),
    };

    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: WorldbuildingService, useValue: mockWorldbuildingService },
      ],
      imports: [TreeNodeIconComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TreeNodeIconComponent);
    component = fixture.componentInstance;
  });

  it('should display folder_open icon when expandable and expanded', () => {
    component.isExpandable = true;
    component.isExpanded = true;
    fixture.detectChanges();
    const matIconEl: HTMLElement =
      fixture.nativeElement.querySelector('mat-icon');
    expect(matIconEl.textContent.trim()).toBe('folder_open');
  });

  it('should display folder icon when expandable and not expanded', () => {
    component.isExpandable = true;
    component.isExpanded = false;
    fixture.detectChanges();
    const matIconEl: HTMLElement =
      fixture.nativeElement.querySelector('mat-icon');
    expect(matIconEl.textContent.trim()).toBe('folder');
  });

  it('should display description icon for Item type', () => {
    component.isExpandable = false;
    component.type = ElementType.Item;
    fixture.detectChanges();
    const matIconEl: HTMLElement =
      fixture.nativeElement.querySelector('mat-icon');
    expect(matIconEl.textContent.trim()).toBe('description');
  });

  it('should display description icon for unknown type', () => {
    component.isExpandable = false;
    component.type = 'UNKNOWN';
    fixture.detectChanges();
    const matIconEl: HTMLElement =
      fixture.nativeElement.querySelector('mat-icon');
    expect(matIconEl.textContent.trim()).toBe('description');
  });

  it('should display custom icon from metadata for unknown type', () => {
    component.isExpandable = false;
    component.type = 'CUSTOM_TYPE';
    component.metadata = { icon: 'star' };
    fixture.detectChanges();
    const matIconEl: HTMLElement =
      fixture.nativeElement.querySelector('mat-icon');
    expect(matIconEl.textContent.trim()).toBe('star');
  });

  describe('Worldbuilding elements', () => {
    it('should display schema icon for worldbuilding element', () => {
      mockWorldbuildingService.getSchemaById.mockReturnValue({
        icon: 'person',
      });
      component.isExpandable = false;
      component.type = ElementType.Worldbuilding;
      component.schemaId = 'character-v1';
      fixture.detectChanges();
      const matIconEl: HTMLElement =
        fixture.nativeElement.querySelector('mat-icon');
      expect(matIconEl.textContent.trim()).toBe('person');
      expect(mockWorldbuildingService.getSchemaById).toHaveBeenCalledWith(
        'character-v1'
      );
    });

    it('should display category fallback when schema has no icon', () => {
      mockWorldbuildingService.getSchemaById.mockReturnValue({});
      component.isExpandable = false;
      component.type = ElementType.Worldbuilding;
      component.schemaId = 'custom-schema';
      fixture.detectChanges();
      const matIconEl: HTMLElement =
        fixture.nativeElement.querySelector('mat-icon');
      expect(matIconEl.textContent.trim()).toBe('category');
    });

    it('should display category fallback when schema not found', () => {
      mockWorldbuildingService.getSchemaById.mockReturnValue(null);
      component.isExpandable = false;
      component.type = ElementType.Worldbuilding;
      component.schemaId = 'nonexistent-schema';
      fixture.detectChanges();
      const matIconEl: HTMLElement =
        fixture.nativeElement.querySelector('mat-icon');
      expect(matIconEl.textContent.trim()).toBe('category');
    });

    it('should display category fallback when worldbuilding has no schemaId', () => {
      component.isExpandable = false;
      component.type = ElementType.Worldbuilding;
      component.schemaId = null;
      fixture.detectChanges();
      const matIconEl: HTMLElement =
        fixture.nativeElement.querySelector('mat-icon');
      // Falls through to default since no schemaId
      expect(matIconEl.textContent.trim()).toBe('description');
    });
  });
});
