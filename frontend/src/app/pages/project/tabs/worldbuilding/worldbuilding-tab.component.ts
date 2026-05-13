import {
  Component,
  computed,
  effect,
  inject,
  type OnDestroy,
  type OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute } from '@angular/router';
import { DocumentBreadcrumbsComponent } from '@components/document-breadcrumbs/document-breadcrumbs.component';
import { LoggerService } from '@services/core/logger.service';
import { SettingsService } from '@services/core/settings.service';
import { PresenceService } from '@services/presence/presence.service';
import { DocumentSyncService } from '@services/sync/document-sync.service';
import { type Subscription } from 'rxjs';

import { type Element, type ElementType } from '../../../../../api-client';
import { WorldbuildingEditorComponent } from '../../../../components/worldbuilding/worldbuilding-editor.component';
import { ProjectStateService } from '../../../../services/project/project-state.service';

@Component({
  selector: 'app-worldbuilding-tab',
  templateUrl: './worldbuilding-tab.component.html',
  styleUrls: ['./worldbuilding-tab.component.scss'],
  imports: [
    WorldbuildingEditorComponent,
    DocumentBreadcrumbsComponent,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  providers: [DocumentSyncService],
})
export class WorldbuildingTabComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly projectState = inject(ProjectStateService);
  private readonly logger = inject(LoggerService);
  private readonly settingsService = inject(SettingsService);
  private readonly presence = inject(PresenceService);
  protected readonly documentSync = inject(DocumentSyncService);
  private paramSubscription: Subscription | null = null;

  protected elementId = signal<string>('');
  protected elementType = signal<ElementType | null>(null);
  protected username = signal<string | undefined>(undefined);
  protected slug = signal<string | undefined>(undefined);

  // Expose sync state signals for the template
  protected readonly documentUnavailable =
    this.documentSync.documentUnavailable;
  protected readonly syncing = this.documentSync.syncing;
  protected readonly syncError = this.documentSync.syncError;

  /** Whether the breadcrumb bar is visible — mirrors DocumentBreadcrumbsComponent logic. */
  protected readonly breadcrumbVisible = computed(() => {
    const id = this.elementId();
    if (!id || !this.settingsService.showBreadcrumbs()) return false;
    const el = this.projectState.elements().find(e => e.id === id);
    return !!el?.parentId;
  });

  constructor() {
    // Watch for elements loading and update element type when available
    effect(() => {
      const elements = this.projectState.elements();
      const currentId = this.elementId();

      if (currentId && elements.length > 0 && !this.elementType()) {
        const element = elements.find(el => el.id === currentId);
        if (element) {
          this.elementType.set(element.type);
          this.logger.debug(
            'WorldbuildingTab',
            `Element type loaded: ${element.type}`
          );
        }
      }
    });

    // Watch for project changes to get username and slug
    effect(() => {
      const project = this.projectState.project();
      if (project) {
        this.username.set(project.username);
        this.slug.set(project.slug);
      }
    });

    // Check document availability when the element or project changes
    effect(() => {
      const currentId = this.elementId();
      const project = this.projectState.project();
      if (currentId && project) {
        void this.documentSync.checkAvailability(currentId, 'worldbuilding');
      }
    });

    effect(() => {
      const element = this.findElement(this.elementId());
      this.presence.setActiveLocation({
        kind: 'worldbuilding',
        ...(element?.schemaId && { schemaId: element.schemaId }),
      });
      if (element) {
        this.presence.setSelection({
          kind: 'worldbuilding',
          ...(element.schemaId && { schemaId: element.schemaId }),
          selectedElementId: element.id,
        });
      }
    });
  }

  protected async triggerSync(): Promise<void> {
    await this.documentSync.triggerSync(this.elementId(), 'worldbuilding');
  }

  ngOnInit(): void {
    this.paramSubscription = this.route.paramMap.subscribe(params => {
      const newElementId = params.get('tabId') || '';
      this.logger.debug(
        'WorldbuildingTab',
        `Element ID from route params: ${newElementId}`
      );

      this.elementId.set(newElementId);

      const element = this.findElement(newElementId);
      if (element) {
        this.elementType.set(element.type);
        this.logger.debug('WorldbuildingTab', `Element type: ${element.type}`);
      } else {
        console.warn(
          `[WorldbuildingTab] Element not found yet: ${newElementId}, waiting for elements to load...`
        );
        this.elementType.set(null);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.paramSubscription) {
      this.paramSubscription.unsubscribe();
      this.paramSubscription = null;
    }
    this.presence.setActiveLocation(null);
    this.presence.setSelection(null);
  }

  private findElement(elementId: string): Element | null {
    const elements = this.projectState.elements();
    return elements.find(el => el.id === elementId) || null;
  }
}
