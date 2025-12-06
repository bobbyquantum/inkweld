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

import { ElementType } from '../../../../api-client';

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
  | { type: 'delete'; nodePos: number }
  | { type: 'close' };

@Component({
  selector: 'app-element-ref-context-menu',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
  ],
  template: `
    @if (isOpen()) {
      <div
        class="context-menu-backdrop"
        role="presentation"
        tabindex="-1"
        (click)="close()"
        (keydown.escape)="close()"
        (contextmenu)="$event.preventDefault(); close()"></div>
      <div
        class="context-menu"
        [style.left.px]="menuPosition().x"
        [style.top.px]="menuPosition().y"
        role="menu"
        aria-label="Element reference actions"
        data-testid="element-ref-context-menu">
        @if (!isEditing()) {
          <!-- Normal menu mode -->
          <button
            class="menu-item"
            (click)="navigateToElement()"
            data-testid="context-menu-navigate">
            <mat-icon>open_in_new</mat-icon>
            <span>Go to element</span>
          </button>

          <button
            class="menu-item"
            (click)="startEditing()"
            data-testid="context-menu-edit">
            <mat-icon>edit</mat-icon>
            <span>Edit display text</span>
          </button>

          <mat-divider></mat-divider>

          <button
            class="menu-item danger"
            (click)="deleteReference()"
            data-testid="context-menu-delete">
            <mat-icon>delete</mat-icon>
            <span>Delete reference</span>
          </button>
        } @else {
          <!-- Editing mode -->
          <div class="edit-mode">
            <div class="edit-header">
              <span>Edit display text</span>
              <button mat-icon-button (click)="cancelEditing()">
                <mat-icon>close</mat-icon>
              </button>
            </div>
            <input
              #editInput
              type="text"
              class="edit-input"
              [value]="editText()"
              (input)="editText.set($any($event.target).value)"
              (keydown.enter)="saveEdit()"
              (keydown.escape)="cancelEditing()"
              data-testid="context-menu-edit-input" />
            <div class="edit-actions">
              <button
                class="menu-item small"
                (click)="resetToOriginal()"
                [disabled]="editText() === data()?.originalName">
                <mat-icon>refresh</mat-icon>
                <span>Reset to original</span>
              </button>
              <button
                mat-flat-button
                color="primary"
                (click)="saveEdit()"
                [disabled]="!editText().trim()"
                data-testid="context-menu-save">
                Save
              </button>
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      .context-menu-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 1000;
      }

      .context-menu {
        position: fixed;
        z-index: 1001;
        min-width: 200px;
        max-width: 280px;
        background: var(--sys-surface-container, #fff);
        border-radius: 8px;
        box-shadow:
          0 4px 16px rgba(0, 0, 0, 0.15),
          0 1px 4px rgba(0, 0, 0, 0.1);
        border: 1px solid var(--sys-outline-variant, rgba(0, 0, 0, 0.12));
        padding: 4px 0;
        overflow: hidden;

        :host-context(.dark-theme) & {
          background: var(--sys-surface-container, #2d2d2d);
          border-color: var(--sys-outline-variant, rgba(255, 255, 255, 0.12));
        }
      }

      .menu-item {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 10px 16px;
        border: none;
        background: transparent;
        color: var(--sys-on-surface, #1c1b1f);
        font-size: 14px;
        cursor: pointer;
        text-align: left;
        transition: background-color 0.15s ease;

        :host-context(.dark-theme) & {
          color: var(--sys-on-surface, #e6e1e5);
        }

        &:hover {
          background: var(--sys-surface-container-high, #f3f3f3);

          :host-context(.dark-theme) & {
            background: var(--sys-surface-container-high, #3d3d3d);
          }
        }

        &:focus {
          outline: none;
          background: var(--sys-surface-container-high, #f3f3f3);
        }

        mat-icon {
          font-size: 20px;
          width: 20px;
          height: 20px;
          color: var(--sys-on-surface-variant, #49454f);

          :host-context(.dark-theme) & {
            color: var(--sys-on-surface-variant, #cac4d0);
          }
        }

        &.danger {
          color: var(--sys-error, #b3261e);

          mat-icon {
            color: var(--sys-error, #b3261e);
          }
        }

        &.small {
          padding: 6px 12px;
          font-size: 12px;

          mat-icon {
            font-size: 16px;
            width: 16px;
            height: 16px;
          }
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }

      mat-divider {
        margin: 4px 0;
      }

      .edit-mode {
        padding: 12px;
      }

      .edit-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        font-weight: 500;
        font-size: 14px;
        color: var(--sys-on-surface, #1c1b1f);

        :host-context(.dark-theme) & {
          color: var(--sys-on-surface, #e6e1e5);
        }

        button {
          margin: -8px -8px -8px 0;
        }
      }

      .edit-input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--sys-outline, #79747e);
        border-radius: 4px;
        font-size: 14px;
        background: var(--sys-surface, #fff);
        color: var(--sys-on-surface, #1c1b1f);
        box-sizing: border-box;

        :host-context(.dark-theme) & {
          background: var(--sys-surface, #1c1b1f);
          color: var(--sys-on-surface, #e6e1e5);
          border-color: var(--sys-outline, #938f99);
        }

        &:focus {
          outline: none;
          border-color: var(--sys-primary, #6750a4);
          box-shadow: 0 0 0 1px var(--sys-primary, #6750a4);
        }
      }

      .edit-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 12px;
        gap: 8px;
      }
    `,
  ],
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
  private _data = signal<ElementRefContextData | null>(null);
  private _isEditing = signal(false);

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
    if (x + menuWidth > window.innerWidth - padding) {
      x = window.innerWidth - menuWidth - padding;
    }
    if (y + menuHeight > window.innerHeight - padding) {
      y = window.innerHeight - menuHeight - padding;
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
