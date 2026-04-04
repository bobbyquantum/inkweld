import {
  Component,
  effect,
  inject,
  type OnDestroy,
  type OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { type Subscription } from 'rxjs';

import { type Element, type ElementType } from '../../../../../api-client';
import { WorldbuildingEditorComponent } from '../../../../components/worldbuilding/worldbuilding-editor.component';
import { ProjectStateService } from '../../../../services/project/project-state.service';

@Component({
  selector: 'app-worldbuilding-tab',
  templateUrl: './worldbuilding-tab.component.html',
  styleUrls: ['./worldbuilding-tab.component.scss'],
  imports: [WorldbuildingEditorComponent],
})
export class WorldbuildingTabComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly projectState = inject(ProjectStateService);
  private paramSubscription: Subscription | null = null;

  protected elementId = signal<string>('');
  protected elementType = signal<ElementType | null>(null);
  protected username = signal<string | undefined>(undefined);
  protected slug = signal<string | undefined>(undefined);

  /**
   * Whether the current worldbuilding element is unavailable (remote element
   * that hasn't synced). When true, a warning is shown instead of the editor.
   */
  protected readonly documentUnavailable = signal(false);

  private availabilityCheckToken = 0;

  constructor() {
    // Watch for elements loading and update element type when available
    effect(() => {
      const elements = this.projectState.elements();
      const currentId = this.elementId();

      if (currentId && elements.length > 0 && !this.elementType()) {
        const element = elements.find(el => el.id === currentId);
        if (element) {
          this.elementType.set(element.type);
          console.log(
            `[WorldbuildingTab] Element type loaded: ${element.type}`
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

    // Check document availability when the element changes
    effect(() => {
      const currentId = this.elementId();
      const token = ++this.availabilityCheckToken;
      this.documentUnavailable.set(false);
      if (currentId) {
        void this.checkAvailability(currentId, token);
      }
    });
  }

  private async checkAvailability(
    elementId: string,
    token: number
  ): Promise<void> {
    const unavailable =
      await this.projectState.isDocumentUnavailable(elementId);
    if (token !== this.availabilityCheckToken) return;
    this.documentUnavailable.set(unavailable);
  }

  ngOnInit(): void {
    // Subscribe to route param changes
    this.paramSubscription = this.route.paramMap.subscribe(params => {
      const newElementId = params.get('tabId') || '';
      console.log(
        `[WorldbuildingTab] Element ID from route params: ${newElementId}`
      );

      this.elementId.set(newElementId);

      // Try to get the element type from project state
      const element = this.findElement(newElementId);
      if (element) {
        this.elementType.set(element.type);
        console.log(`[WorldbuildingTab] Element type: ${element.type}`);
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
  }

  /**
   * Find element in project tree (flat array)
   */
  private findElement(elementId: string): Element | null {
    const elements = this.projectState.elements();
    return elements.find(el => el.id === elementId) || null;
  }
}
