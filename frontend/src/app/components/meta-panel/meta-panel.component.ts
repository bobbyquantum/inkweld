import { Component, input, output, signal } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';

import { RelationshipsPanelComponent } from '../relationships-panel/relationships-panel.component';
import { SnapshotPanelComponent } from '../snapshot-panel/snapshot-panel.component';

/**
 * Meta panel with accordion sections for document metadata.
 * Includes Snapshots, Relationships, and extensible for future sections.
 * Toggle button is in the parent editor toolbar.
 */
@Component({
  selector: 'app-meta-panel',
  standalone: true,
  imports: [
    MatIconModule,
    MatExpansionModule,
    SnapshotPanelComponent,
    RelationshipsPanelComponent,
  ],
  templateUrl: './meta-panel.component.html',
  styleUrl: './meta-panel.component.scss',
})
export class MetaPanelComponent {
  /** Document ID for snapshots and relationships */
  documentId = input.required<string>();

  /** Current element ID for relationships panel */
  elementId = input<string | null>(null);

  /** Whether the panel is open */
  isOpen = input<boolean>(false);

  /** Event emitted when panel open state changes */
  openChange = output<boolean>();

  /** Which accordion section is expanded */
  expandedSection = signal<'snapshots' | 'relationships' | null>(
    'relationships'
  );

  /**
   * Toggle the panel open/closed state
   */
  toggle(): void {
    this.openChange.emit(!this.isOpen());
  }

  /**
   * Open the panel
   */
  open(): void {
    if (!this.isOpen()) {
      this.openChange.emit(true);
    }
  }

  /**
   * Close the panel
   */
  close(): void {
    if (this.isOpen()) {
      this.openChange.emit(false);
    }
  }

  /**
   * Handle accordion section change
   */
  onSectionChange(section: 'snapshots' | 'relationships' | null): void {
    this.expandedSection.set(section);
  }
}
