import { inject, Injectable } from '@angular/core';
import { type ElementTypeSchema } from '@models/schema-types';

import {
  type CreateSnapshotOptions,
  LocalSnapshotService,
  type SnapshotInfo,
  type StoredSnapshot,
} from '../local/local-snapshot.service';
import { ProjectStateService } from '../project/project-state.service';
import { WorldbuildingService } from '../worldbuilding/worldbuilding.service';

/** documentId convention used to namespace schema-template snapshots. */
export function templateSnapshotDocumentId(schemaId: string): string {
  return `template:${schemaId}`;
}

/**
 * Snapshots for schema designs (templates).
 *
 * Templates aren't per-element Yjs documents, so they don't fit the
 * Yjs-coupled {@link UnifiedSnapshotService}. Instead we serialize the
 * {@link ElementTypeSchema} into the generic {@link LocalSnapshotService}
 * payload and restore it by pushing the whole template back through
 * {@link WorldbuildingService}. This reuses the existing IndexedDB store and
 * the same create/list/restore/delete lifecycle, keyed by schema id.
 */
@Injectable({ providedIn: 'root' })
export class TemplateSnapshotService {
  private readonly localSnapshots = inject(LocalSnapshotService);
  private readonly worldbuildingService = inject(WorldbuildingService);
  private readonly projectState = inject(ProjectStateService);

  private projectKey(): string {
    const project = this.projectState.project();
    return project ? `${project.username}/${project.slug}` : '';
  }

  /**
   * Serialize a schema into a snapshot payload. We store the full schema in
   * `worldbuildingData` (a free-form JSON container) and tag it in `metadata`
   * so restore knows how to unpack it.
   */
  private buildOptions(schema: ElementTypeSchema): CreateSnapshotOptions {
    return {
      name: schema.name,
      xmlContent: '',
      worldbuildingData: { schema: structuredClone(schema) },
      metadata: { kind: 'schema-template' },
    };
  }

  /** Create a snapshot of a template, overwriting the schema id in place. */
  async createTemplateSnapshot(schemaId: string): Promise<StoredSnapshot> {
    const schema = this.worldbuildingService.getSchemaById(schemaId);
    if (!schema) {
      throw new Error(`Template not found: ${schemaId}`);
    }
    return this.localSnapshots.createSnapshot(
      this.projectKey(),
      templateSnapshotDocumentId(schemaId),
      this.buildOptions(schema)
    );
  }

  /** List snapshots for a template. */
  async listTemplateSnapshots(schemaId: string): Promise<SnapshotInfo[]> {
    return this.localSnapshots.listSnapshotsForDocument(
      this.projectKey(),
      templateSnapshotDocumentId(schemaId)
    );
  }

  /** Delete a template snapshot by its composite id. */
  async deleteTemplateSnapshot(snapshotId: string): Promise<void> {
    await this.localSnapshots.deleteSnapshotById(snapshotId);
  }

  /**
   * Restore a template snapshot, overwriting the schema in place.
   * Returns the restored schema, or undefined if the snapshot wasn't found.
   */
  async restoreTemplateSnapshot(
    schemaId: string,
    snapshotId: string
  ): Promise<ElementTypeSchema | undefined> {
    const full = await this.localSnapshots.getSnapshot(
      this.projectKey(),
      templateSnapshotDocumentId(schemaId),
      snapshotId
    );
    return this.restoreTemplateFromSnapshot(full);
  }

  /** Restore a template from an already-loaded snapshot record. */
  restoreTemplateFromSnapshot(
    snapshot: StoredSnapshot | undefined
  ): ElementTypeSchema | undefined {
    const stored = snapshot?.worldbuildingData?.['schema'];
    if (!stored) return undefined;
    const schema = stored as ElementTypeSchema;

    const existing = this.worldbuildingService.getSchemaById(schema.id);
    const restored = {
      ...schema,
      version: (existing?.version ?? schema.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      this.worldbuildingService.updateTemplate(schema.id, restored);
    } else {
      this.worldbuildingService.saveSchemaToLibrary(restored);
    }
    return restored;
  }
}
