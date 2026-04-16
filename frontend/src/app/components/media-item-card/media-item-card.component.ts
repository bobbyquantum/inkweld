import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Shared media item card with blur-background image preview and hover overlay.
 * Uses content projection for overlay actions and info sections.
 *
 * Usage:
 * ```html
 * <app-media-item-card [imageUrl]="url" [isImage]="true" (cardClick)="view()">
 *   <div cardTopLeft>...left actions...</div>
 *   <div cardTopRight>...right actions...</div>
 *   <div cardBottom>...info & tags...</div>
 * </app-media-item-card>
 * ```
 */
@Component({
  selector: 'app-media-item-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  templateUrl: './media-item-card.component.html',
  styleUrl: './media-item-card.component.scss',
})
export class MediaItemCardComponent {
  /** Blob URL for the image */
  readonly imageUrl = input<string>();
  /** Alt text for the image */
  readonly altText = input('');
  /** Whether the item is an image (shows preview) or a file (shows icon) */
  readonly isImage = input(true);
  /** Icon to show for non-image files */
  readonly fileIcon = input('insert_drive_file');

  /** Emitted when the card preview/overlay background is clicked */
  readonly cardClick = output<void>();
}
