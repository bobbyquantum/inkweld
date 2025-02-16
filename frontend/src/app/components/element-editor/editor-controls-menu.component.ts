import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Editor } from 'ngx-editor';

@Component({
  selector: 'app-editor-controls-menu',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  template: `
    <div class="NgxEditor__Seperator"></div>
    <div class="NgxEditor__Dropdown">
      <button
        type="button"
        class="NgxEditor__MenuItem NgxEditor__Dropdown--Text"
        (click)="toggleViewModeDropdown()"
        (keydown.enter)="toggleViewModeDropdown()"
        [ngClass]="{ 'NgxEditor__MenuItem--Active': showViewModeDropdown }"
        [attr.aria-expanded]="showViewModeDropdown"
        tabindex="0">
        {{ viewMode === 'page' ? 'Page' : 'Fit Width' }}
      </button>
      @if (showViewModeDropdown) {
        <div class="NgxEditor__Dropdown--Items">
          <button
            type="button"
            class="NgxEditor__Dropdown--Item"
            (click)="setViewMode('fitWidth')"
            (keydown.enter)="setViewMode('fitWidth')"
            [ngClass]="{
              'NgxEditor__MenuItem--Active': viewMode === 'fitWidth',
            }"
            tabindex="0">
            Fit Width
          </button>
          <button
            type="button"
            class="NgxEditor__Dropdown--Item"
            (click)="setViewMode('page')"
            (keydown.enter)="setViewMode('page')"
            [ngClass]="{ 'NgxEditor__MenuItem--Active': viewMode === 'page' }"
            tabindex="0">
            Page
          </button>
        </div>
      }
    </div>
    <div class="NgxEditor__Seperator"></div>
    <div class="NgxEditor__MenuItem NgxEditor__MenuItem--Text">
      <button
        mat-icon-button
        class="NgxEditor__MenuItem--Icon"
        (click)="decreaseZoom()"
        [disabled]="zoomLevel <= 50">
        <mat-icon>remove</mat-icon>
      </button>
      <span>{{ zoomLevel }}%</span>
      <button
        mat-icon-button
        class="NgxEditor__MenuItem--Icon"
        (click)="increaseZoom()"
        [disabled]="zoomLevel >= 200">
        <mat-icon>add</mat-icon>
      </button>
    </div>
  `,
  styleUrl: './editor-controls-menu.component.scss',
})
export class EditorControlsMenuComponent {
  @Input() editor!: Editor;
  @Input() viewMode: 'page' | 'fitWidth' = 'fitWidth';
  @Input() zoomLevel = 100;
  @Output() viewModeChange = new EventEmitter<'page' | 'fitWidth'>();
  @Output() zoomLevelChange = new EventEmitter<number>();
  showViewModeDropdown = false;

  increaseZoom(): void {
    if (this.zoomLevel < 200) {
      this.zoomLevel += 10;
      this.emitZoomLevel();
    }
  }

  decreaseZoom(): void {
    if (this.zoomLevel > 50) {
      this.zoomLevel -= 10;
      this.emitZoomLevel();
    }
  }

  toggleViewModeDropdown(): void {
    this.showViewModeDropdown = !this.showViewModeDropdown;
  }

  setViewMode(mode: 'page' | 'fitWidth'): void {
    this.showViewModeDropdown = false;
    this.viewModeChange.emit(mode);
  }

  private emitZoomLevel(): void {
    this.zoomLevelChange.emit(this.zoomLevel);
  }
}
