import { inject, Injectable, signal } from '@angular/core';
import { nanoid } from 'nanoid';

import { RelationshipService } from '@services/relationship/relationship.service';
import { CanvasService } from '@services/canvas/canvas.service';
import {
  createPinRelationship,
  removePinRelationship,
} from '../../pages/project/tabs/canvas/canvas-pin-helpers';
import type { CanvasObject } from '@models/canvas.model';

const PASTE_OFFSET = 20;
const DUPLICATE_OFFSET = 20;

/**
 * Owns clipboard state (the copied object and whether the last op was a cut)
 * and the copy/cut/paste/duplicate operations on canvas objects.
 *
 * The host component still owns the selection signal and decides where to
 * paste; this service is purely the data plane.
 */
@Injectable()
export class CanvasClipboardService {
  private readonly canvasService = inject(CanvasService);
  private readonly relationshipService = inject(RelationshipService);

  /** The most recently copied/cut object, or null if the clipboard is empty. */
  readonly clipboard = signal<CanvasObject | null>(null);

  /** Whether {@link clipboard} originated from a cut (consumed on first paste). */
  private cut = false;

  /** Copy an object onto the clipboard. No-op when the object is missing. */
  copy(objectId: string): void {
    const obj = this.findObject(objectId);
    if (!obj) return;
    this.clipboard.set(this.stripRelationshipId(obj));
    this.cut = false;
  }

  /**
   * Cut an object: place it on the clipboard, remove it from the canvas
   * and clean up any pin relationship. Returns whether the caller should
   * clear its selection (true when the cut succeeded).
   */
  cutObject(objectId: string): boolean {
    const obj = this.findObject(objectId);
    if (!obj) return false;

    if (obj.type === 'pin') {
      removePinRelationship(this.relationshipService, obj);
    }

    this.clipboard.set(this.stripRelationshipId(obj));
    this.cut = true;
    this.canvasService.removeObject(objectId);
    return true;
  }

  /**
   * Paste from the clipboard at `position`, attaching to `layerId`.
   * Returns the id of the newly created object, or null if there was
   * nothing to paste.
   */
  paste(
    layerId: string,
    position: { x: number; y: number },
    elementId: string
  ): string | null {
    const source = this.clipboard();
    if (!source) return null;

    const newObj: CanvasObject = {
      ...source,
      id: nanoid(),
      layerId,
      x: position.x + PASTE_OFFSET,
      y: position.y + PASTE_OFFSET,
    };

    if (newObj.type === 'pin' && newObj.linkedElementId) {
      newObj.relationshipId = createPinRelationship(
        this.relationshipService,
        elementId,
        newObj.linkedElementId
      );
    }

    this.canvasService.addObject(newObj);

    if (this.cut) {
      this.clipboard.set(null);
      this.cut = false;
    }

    return newObj.id;
  }

  /** Duplicate `objectId` with a small offset. Returns the new id or null. */
  duplicate(objectId: string): string | null {
    const obj = this.findObject(objectId);
    if (!obj) return null;

    const dup: CanvasObject = {
      ...obj,
      id: nanoid(),
      x: obj.x + DUPLICATE_OFFSET,
      y: obj.y + DUPLICATE_OFFSET,
    };
    this.canvasService.addObject(dup);
    return dup.id;
  }

  private findObject(objectId: string): CanvasObject | undefined {
    const config = this.canvasService.activeConfig();
    if (!config) return undefined;
    return config.objects.find(o => o.id === objectId);
  }

  private stripRelationshipId(obj: CanvasObject): CanvasObject {
    return obj.type === 'pin'
      ? { ...obj, relationshipId: undefined }
      : { ...obj };
  }
}
