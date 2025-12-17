import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  OnDestroy,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import {
  WorldbuildingIdentity,
  WorldbuildingService,
} from '@services/worldbuilding/worldbuilding.service';
import { debounceTime, Subject, takeUntil } from 'rxjs';

/**
 * Identity panel for worldbuilding elements.
 * Shows common fields: name (read-only + rename), image, description.
 * Responsive: side panel on desktop, collapsed header on mobile.
 */
@Component({
  selector: 'app-identity-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
  ],
  templateUrl: './identity-panel.component.html',
  styleUrls: ['./identity-panel.component.scss'],
})
export class IdentityPanelComponent implements OnDestroy {
  // Inputs
  elementId = input.required<string>();
  elementName = input.required<string>();
  username = input<string>();
  slug = input<string>();

  // Outputs
  renameRequested = output<void>();

  // Services
  private worldbuildingService = inject(WorldbuildingService);
  private dialogGateway = inject(DialogGatewayService);

  // State
  identity = signal<WorldbuildingIdentity>({});
  description = signal<string>('');
  isExpanded = signal(true);

  // Cleanup
  private destroy$ = new Subject<void>();
  private descriptionChange$ = new Subject<string>();
  private unsubscribeObserver: (() => void) | null = null;

  constructor() {
    // Setup description debounce
    this.descriptionChange$
      .pipe(debounceTime(500), takeUntil(this.destroy$))
      .subscribe(value => {
        void this.saveDescription(value);
      });

    // Load identity data when elementId changes
    effect(() => {
      const id = this.elementId();
      if (id) {
        void this.loadIdentityData(id);
        void this.setupRealtimeSync(id);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.unsubscribeObserver) {
      this.unsubscribeObserver();
    }
  }

  private async loadIdentityData(elementId: string): Promise<void> {
    const data = await this.worldbuildingService.getIdentityData(
      elementId,
      this.username(),
      this.slug()
    );
    if (data) {
      this.identity.set(data);
      this.description.set(data.description ?? '');
    }
  }

  private async setupRealtimeSync(elementId: string): Promise<void> {
    // Cleanup previous observer
    if (this.unsubscribeObserver) {
      this.unsubscribeObserver();
    }

    this.unsubscribeObserver =
      await this.worldbuildingService.observeIdentityChanges(
        elementId,
        (data: WorldbuildingIdentity) => {
          this.identity.set(data);
          // Only update description if different to avoid cursor jumps
          if (data.description !== this.description()) {
            this.description.set(data.description ?? '');
          }
        },
        this.username(),
        this.slug()
      );
  }

  onDescriptionChange(value: string): void {
    this.description.set(value);
    this.descriptionChange$.next(value);
  }

  private async saveDescription(value: string): Promise<void> {
    await this.worldbuildingService.saveIdentityData(
      this.elementId(),
      { description: value },
      this.username(),
      this.slug()
    );
  }

  onRenameClick(): void {
    this.renameRequested.emit();
  }

  toggleExpanded(): void {
    this.isExpanded.set(!this.isExpanded());
  }

  async onImageClick(): Promise<void> {
    const username = this.username();
    const slug = this.slug();

    if (!username || !slug) {
      console.warn(
        '[IdentityPanel] Cannot open image dialog: missing username or slug'
      );
      return;
    }

    // Get worldbuilding data for prompt context
    const worldbuildingData =
      await this.worldbuildingService.getWorldbuildingData(
        this.elementId(),
        username,
        slug
      );

    const result = await this.dialogGateway.openWorldbuildingImageDialog({
      elementName: this.elementName(),
      username,
      slug,
      currentImage: this.identity().image,
      description: this.description(),
      worldbuildingFields: worldbuildingData ?? undefined,
    });

    if (!result) {
      return; // Dialog cancelled
    }

    if (result.removed) {
      // Remove the image
      await this.worldbuildingService.saveIdentityData(
        this.elementId(),
        { image: undefined },
        username,
        slug
      );
      this.identity.set({ ...this.identity(), image: undefined });
    } else if (result.imageData) {
      // Save the new image
      await this.worldbuildingService.saveIdentityData(
        this.elementId(),
        { image: result.imageData },
        username,
        slug
      );
      this.identity.set({ ...this.identity(), image: result.imageData });
    }
  }
}
