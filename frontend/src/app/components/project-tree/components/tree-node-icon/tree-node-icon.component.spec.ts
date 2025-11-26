import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TreeNodeIconComponent } from './tree-node-icon.component';

describe('TreeNodeIconComponent', () => {
  let component: TreeNodeIconComponent;
  let fixture: ComponentFixture<TreeNodeIconComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
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

  it('should display image icon when not expandable and type is IMAGE', () => {
    component.isExpandable = false;
    component.type = 'IMAGE';
    fixture.detectChanges();
    const matIconEl: HTMLElement =
      fixture.nativeElement.querySelector('mat-icon');
    expect(matIconEl.textContent.trim()).toBe('image');
  });

  it('should display description icon when not expandable and type is not IMAGE', () => {
    component.isExpandable = false;
    component.type = 'OTHER';
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

  it.each([
    ['CHARACTER', 'person'],
    ['LOCATION', 'place'],
    ['WB_ITEM', 'category'],
    ['MAP', 'map'],
    ['RELATIONSHIP', 'diversity_1'],
    ['PHILOSOPHY', 'auto_stories'],
    ['CULTURE', 'groups'],
    ['SPECIES', 'pets'],
    ['SYSTEMS', 'settings'],
    ['item', 'description'],
  ])('should display %s icon for type %s', (type, expectedIcon) => {
    component.isExpandable = false;
    component.type = type;
    fixture.detectChanges();
    const matIconEl: HTMLElement =
      fixture.nativeElement.querySelector('mat-icon');
    expect(matIconEl.textContent.trim()).toBe(expectedIcon);
  });
});
