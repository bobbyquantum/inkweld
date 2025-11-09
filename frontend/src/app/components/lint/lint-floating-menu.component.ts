import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Editor } from 'ngx-editor';
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
        <div class="lint-tooltip-title">{{ activeSuggestion.suggestion }}</div>
        <div class="lint-tooltip-reason">{{ activeSuggestion.reason }}</div>
        <div class="lint-action-buttons">
          <button
            class="lint-action-button lint-accept-button"
            (click)="acceptSuggestion()">
            <span class="lint-action-button-icon">✓</span> Accept
          </button>
          <button
            class="lint-action-button lint-reject-button"
            (click)="rejectSuggestion()">
            <span class="lint-action-button-icon">✕</span> Reject
          </button>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .lint-floating-menu {
        background-color: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        padding: 8px;
        margin-top: 8px;
        max-width: 300px;
      }
      .lint-tooltip-title {
        font-weight: bold;
        margin-bottom: 4px;
      }
      .lint-tooltip-reason {
        color: #666;
        margin-bottom: 8px;
        font-size: 0.9em;
      }
      .lint-action-buttons {
        display: flex;
        gap: 8px;
      }
      .lint-action-button {
        padding: 4px 8px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
      }
      .lint-accept-button {
        background-color: #e6f4ea;
        color: #137333;
      }
      .lint-reject-button {
        background-color: #fce8e6;
        color: #c5221f;
      }
      .lint-action-button-icon {
        font-weight: bold;
      }
    `,
  ],
})
export class LintFloatingMenuComponent implements OnInit, OnDestroy {
  @Input() editor!: Editor;

  activeSuggestion: ExtendedCorrectionDto | null = null;
  private subscription: Subscription | null = null;
  private lastCursorPos = -1;

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
        if (suggestion.from <= cursorPos && cursorPos <= suggestion.to) {
          this.activeSuggestion = suggestion;

          // Force the floating menu to appear by creating a selection
          setTimeout(() => {
            this.forceFloatingMenuToAppear(suggestion.from, suggestion.to);
          }, 10);

          break;
        }
      }
    });
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
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

    // Focus the editor to ensure the floating menu appears
    view.focus();
  }

  acceptSuggestion(): void {
    if (!this.activeSuggestion) return;

    // Dispatch custom event to apply the suggestion
    document.dispatchEvent(
      new CustomEvent('lint-accept', { detail: this.activeSuggestion })
    );

    // Clear the active suggestion after accepting
    this.activeSuggestion = null;
  }

  rejectSuggestion(): void {
    if (!this.activeSuggestion) return;

    // Dispatch custom event to reject the suggestion
    document.dispatchEvent(
      new CustomEvent('lint-reject', { detail: this.activeSuggestion })
    );

    // Clear the active suggestion after rejecting
    this.activeSuggestion = null;
  }
}




