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
});
