/**
 * Element Reference Context Menu Component
 *
 * A popup menu shown when right-clicking or long-pressing an element reference.
 * Provides actions like:
 * - Go to element (navigate to the referenced element)
 * - Edit display text
 * - Delete reference
 */

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  EventEmitter,
  HostListener,
  Input,
  Output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';

import { type ElementType } from '../../../../api-client';

/**
 * Data about the element reference being acted upon
 */
export interface ElementRefContextData {
  /** Element ID being referenced */
  elementId: string;
  /** Element type */
  elementType: ElementType;
  /** Current display text */
  displayText: string;
  /** Original element name */
  originalName: string;
  /** Position in the document (for editing) */
  nodePos: number;
  /** Screen position for menu */
  position: { x: number; y: number };
}

/**
 * Actions that can be performed on an element reference
 */
export type ElementRefAction =
  | { type: 'navigate'; elementId: string; elementType: ElementType }
  | { type: 'edit-text'; nodePos: number; newText: string }
  | { type: 'delete'; nodePos: number; elementId: string }
  | { type: 'close' };

@Component({
  selector: 'app-element-ref-context-menu',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
  ],
  templateUrl: './element-ref-context-menu.component.html',
  styleUrls: ['./element-ref-context-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ElementRefContextMenuComponent {
  /** The element reference data */
  @Input() set contextData(value: ElementRefContextData | null) {
    this._data.set(value);
    if (value) {
      this.editText.set(value.displayText);
      this._isEditing.set(false);
    }
  }

  /** Emitted when an action is selected */
  @Output() action = new EventEmitter<ElementRefAction>();

  // Internal state
  private readonly _data = signal<ElementRefContextData | null>(null);
  private readonly _isEditing = signal(false);

  /** Text being edited */
  editText = signal('');

  /** Computed data accessor */
  data = this._data.asReadonly();

  /** Whether menu is open */
  isOpen = computed(() => this._data() !== null);

  /** Whether in editing mode */
  isEditing = this._isEditing.asReadonly();

  /** Menu position with viewport boundary checks */
  menuPosition = computed(() => {
    const data = this._data();
    if (!data) return { x: 0, y: 0 };

    const menuWidth = 280;
    const menuHeight = 200;
    const padding = 8;

    let x = data.position.x;
    let y = data.position.y;

    // Keep within viewport
    if (x + menuWidth > globalThis.innerWidth - padding) {
      x = globalThis.innerWidth - menuWidth - padding;
    }
    if (y + menuHeight > globalThis.innerHeight - padding) {
      y = globalThis.innerHeight - menuHeight - padding;
    }
    if (x < padding) x = padding;
    if (y < padding) y = padding;

    return { x, y };
  });

  /** Close the menu */
  close(): void {
    this._data.set(null);
    this._isEditing.set(false);
    this.action.emit({ type: 'close' });
  }

  /** Navigate to the referenced element */
  navigateToElement(): void {
    const data = this._data();
    if (data) {
      this.action.emit({
        type: 'navigate',
        elementId: data.elementId,
        elementType: data.elementType,
      });
    }
    this.close();
  }

  /** Start editing the display text */
  startEditing(): void {
    this._isEditing.set(true);
    // Focus input after a tick
    setTimeout(() => {
      const input = document.querySelector(
        '[data-testid="context-menu-edit-input"]'
      ) as HTMLInputElement;
      input?.focus();
      input?.select();
    }, 0);
  }

  /** Cancel editing */
  cancelEditing(): void {
    const data = this._data();
    if (data) {
      this.editText.set(data.displayText);
    }
    this._isEditing.set(false);
  }

  /** Reset text to original element name */
  resetToOriginal(): void {
    const data = this._data();
    if (data) {
      this.editText.set(data.originalName);
    }
  }

  /** Save the edited text */
  saveEdit(): void {
    const data = this._data();
    const text = this.editText().trim();
    if (data && text) {
      this.action.emit({
        type: 'edit-text',
        nodePos: data.nodePos,
        newText: text,
      });
    }
    this.close();
  }

  /** Delete the reference */
  deleteReference(): void {
    const data = this._data();
    if (data) {
      this.action.emit({
        type: 'delete',
        nodePos: data.nodePos,
        elementId: data.elementId,
      });
    }
    this.close();
  }

  /** Handle Escape key to close */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen()) {
      this.close();
    }
  }
}
