import {
  Component,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Editor } from '@bobbyquantum/ngx-editor';
import { TextSelection } from 'prosemirror-state';
import { Subscription } from 'rxjs';

import { ExtendedCorrectionDto } from './correction-dto.extension';
import { pluginKey } from './lint-plugin';

@Component({
  selector: 'app-lint-floating-menu',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  template: `
    @if (activeSuggestion) {
      <div class="lint-floating-menu">
        <div class="lint-tooltip-title">
          {{ activeSuggestion.correctedText }}
        </div>
        <div class="lint-tooltip-reason">{{ activeSuggestion.reason }}</div>
        <div class="lint-action-buttons">
          <button
            class="lint-action-button lint-accept-button"
            (mousedown)="preventFocusLoss($event)"
            (click)="acceptSuggestion()">
            <span class="lint-action-button-icon">✓</span> Accept
          </button>
          <button
            class="lint-action-button lint-reject-button"
            (mousedown)="preventFocusLoss($event)"
            (click)="rejectSuggestion()">
            <span class="lint-action-button-icon">✕</span> Reject
          </button>
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        position: fixed;
        z-index: 1000;
        transition: opacity 0.15s ease;
      }
      .lint-floating-menu {
        background-color: var(--sys-surface-container-high);
        border: 1px solid var(--sys-outline-variant);
        border-radius: 8px;
        box-shadow:
          0 2px 4px -1px rgba(0, 0, 0, 0.2),
          0 4px 5px 0 rgba(0, 0, 0, 0.14),
          0 1px 10px 0 rgba(0, 0, 0, 0.12);
        padding: 12px;
        max-width: 300px;
      }
      .lint-tooltip-title {
        font-weight: 600;
        margin-bottom: 4px;
        color: var(--sys-on-surface);
      }
      .lint-tooltip-reason {
        color: var(--sys-on-surface-variant);
        margin-bottom: 8px;
        font-size: 0.9em;
      }
      .lint-action-buttons {
        display: flex;
        gap: 8px;
      }
      .lint-action-button {
        padding: 6px 12px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        font-weight: 500;
        transition: background-color 0.15s ease;
      }
      .lint-accept-button {
        background-color: var(--sys-tertiary-container);
        color: var(--sys-on-tertiary-container);
      }
      .lint-accept-button:hover {
        opacity: 0.85;
      }
      .lint-reject-button {
        background-color: var(--sys-error-container);
        color: var(--sys-on-error-container);
      }
      .lint-reject-button:hover {
        opacity: 0.85;
      }
      .lint-action-button-icon {
        font-weight: bold;
      }
    `,
  ],
  host: {
    '[style.top.px]': 'positionState().top',
    '[style.left.px]': 'positionState().left',
    '[style.visibility]': 'positionState().visible ? "visible" : "hidden"',
    '[style.opacity]': 'positionState().visible ? "1" : "0"',
    '[style.pointer-events]': 'positionState().visible ? "auto" : "none"',
  },
})
export class LintFloatingMenuComponent implements OnInit, OnDestroy {
  @Input() editor!: Editor;

  activeSuggestion: ExtendedCorrectionDto | null = null;
  private subscription: Subscription | null = null;
  private lastCursorPos = -1;

  /** Position and visibility state */
  protected positionState = signal({
    visible: false,
    top: 0,
    left: 0,
  });

  /** Whether mouse is being dragged (selecting text) */
  private isDragging = false;

  @HostListener('document:mousedown')
  onDocumentMouseDown(): void {
    this.isDragging = true;
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    this.isDragging = false;
    setTimeout(() => this.updatePosition(), 10);
  }

  /**
   * Prevents focus from shifting to the button.
   * This keeps the editor selection intact.
   */
  preventFocusLoss(event: MouseEvent): void {
    event.preventDefault();
  }

  ngOnInit(): void {
    if (!this.editor) {
      console.error('[LintFloatingMenu] Editor not provided');
      return;
    }

    // Subscribe to selection changes to check if cursor is inside a lint suggestion
    this.subscription = this.editor.update.subscribe(({ state }) => {
      const { selection } = state;
      const cursorPos = selection.from;

      // Skip if cursor hasn't moved
      if (cursorPos === this.lastCursorPos) {
        return;
      }

      this.lastCursorPos = cursorPos;

      // Get the lint plugin state
      const pluginState = pluginKey.getState(state);
      if (!pluginState?.suggestions || pluginState.suggestions.length === 0) {
        this.activeSuggestion = null;
        return;
      }

      // Check if cursor is inside any suggestion
      this.activeSuggestion = null;

      for (const suggestion of pluginState.suggestions) {
        if (
          suggestion.startPos <= cursorPos &&
          cursorPos <= suggestion.endPos
        ) {
          this.activeSuggestion = suggestion;

          // Force the floating menu to appear by creating a selection
          setTimeout(() => {
            this.forceFloatingMenuToAppear(
              suggestion.startPos,
              suggestion.endPos
            );
          }, 10);

          break;
        }
      }

      // Update position after finding suggestion
      this.updatePosition();
    });
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
  }

  /**
   * Updates the menu position based on active suggestion.
   * Uses viewport as boundary, not editor bounds.
   */
  private updatePosition(): void {
    const view = this.editor?.view;
    if (!view || !this.activeSuggestion || this.isDragging) {
      this.hide();
      return;
    }

    const { startPos, endPos } = this.activeSuggestion;

    // Get selection coordinates (these are viewport-relative)
    const start = view.coordsAtPos(startPos);
    const end = view.coordsAtPos(endPos);

    // Calculate selection bounds
    const selectionTop = Math.min(start.top, end.top);
    const selectionBottom = Math.max(start.bottom, end.bottom);
    const selectionLeft = Math.min(start.left, end.left);
    const selectionRight = Math.max(start.right, end.right);
    const selectionCenterX = (selectionLeft + selectionRight) / 2;

    // Menu dimensions (approximate)
    const menuHeight = 100;
    const menuWidth = 300;
    const gap = 8;

    // Viewport boundaries with some padding
    const viewportTop = 60;
    const viewportLeft = 10;
    const viewportRight = window.innerWidth - 10;

    // Determine vertical position: prefer above, flip to below if not enough room
    let top: number;
    if (selectionTop - menuHeight - gap < viewportTop) {
      top = selectionBottom + gap;
    } else {
      top = selectionTop - menuHeight - gap;
    }

    // Calculate horizontal position (centered on selection)
    let left = selectionCenterX - menuWidth / 2;

    // Clamp to viewport
    if (left < viewportLeft) {
      left = viewportLeft;
    } else if (left + menuWidth > viewportRight) {
      left = viewportRight - menuWidth;
    }

    this.positionState.set({
      visible: true,
      top,
      left,
    });
  }

  private hide(): void {
    this.positionState.update(s => ({ ...s, visible: false }));
  }

  // Programmatically trigger the floating menu to appear when cursor is in a lint suggestion
  private forceFloatingMenuToAppear(from: number, to: number): void {
    const view = this.editor.view;
    if (!view || from === to) return;

    // Create a selection spanning the suggestion
    const selection = TextSelection.create(view.state.doc, from, to);

    // Dispatch a transaction to set the selection and force update
    view.dispatch(
      view.state.tr.setSelection(selection).setMeta('FORCE_EMIT', true)
    );

    // Update position after selection is set
    this.updatePosition();

    // Focus the editor to ensure the floating menu appears
    view.focus();
  }

  acceptSuggestion(): void {
    if (!this.activeSuggestion) return;

    // Dispatch custom event to apply the suggestion
    document.dispatchEvent(
      new CustomEvent('lint-accept', { detail: this.activeSuggestion })
    );

    // Clear the active suggestion and hide menu
    this.activeSuggestion = null;
    this.hide();

    // Refocus editor
    this.editor?.view?.focus();
  }

  rejectSuggestion(): void {
    if (!this.activeSuggestion) return;

    // Dispatch custom event to reject the suggestion
    document.dispatchEvent(
      new CustomEvent('lint-reject', { detail: this.activeSuggestion })
    );

    // Clear the active suggestion and hide menu
    this.activeSuggestion = null;
    this.hide();

    // Refocus editor
    this.editor?.view?.focus();
  }
}
