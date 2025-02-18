import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Editor } from 'ngx-editor';

import { EditorControlsMenuComponent } from './editor-controls-menu.component';

describe('EditorControlsMenuComponent', () => {
  let component: EditorControlsMenuComponent;
  let fixture: ComponentFixture<EditorControlsMenuComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        CommonModule,
        MatButtonModule,
        MatIconModule,
        EditorControlsMenuComponent,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EditorControlsMenuComponent);
    component = fixture.componentInstance;
    component.editor = new Editor();
    fixture.detectChanges();
  });

  afterEach(() => {
    component.editor.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle view mode dropdown', () => {
    expect(component.showViewModeDropdown).toBeFalsy();
    component.toggleViewModeDropdown();
    expect(component.showViewModeDropdown).toBeTruthy();
    component.toggleViewModeDropdown();
    expect(component.showViewModeDropdown).toBeFalsy();
  });

  it('should emit view mode changes', () => {
    const spy = jest.spyOn(component.viewModeChange, 'emit');
    component.setViewMode('page');
    expect(spy).toHaveBeenCalledWith('page');
    expect(component.showViewModeDropdown).toBeFalsy();
  });

  it('should handle zoom level changes', () => {
    const spy = jest.spyOn(component.zoomLevelChange, 'emit');

    component.increaseZoom();
    expect(component.zoomLevel).toBe(110);
    expect(spy).toHaveBeenCalledWith(110);

    component.decreaseZoom();
    expect(component.zoomLevel).toBe(100);
    expect(spy).toHaveBeenCalledWith(100);
  });

  it('should respect zoom level limits', () => {
    // Test upper limit
    component.zoomLevel = 190;
    component.increaseZoom();
    expect(component.zoomLevel).toBe(200);
    component.increaseZoom();
    expect(component.zoomLevel).toBe(200); // Should not increase further

    // Test lower limit
    component.zoomLevel = 60;
    component.decreaseZoom();
    expect(component.zoomLevel).toBe(50);
    component.decreaseZoom();
    expect(component.zoomLevel).toBe(50); // Should not decrease further
  });
});
