import type { Injector } from '@angular/core';
import { type Element, ElementType } from '@inkweld/index';
import { UnifiedSnapshotService } from '@services/project/unified-snapshot.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';

import { DocumentAccess } from './document-access';
import type { ProjectToolContext } from './project-context';
import { schema, ToolError, type WebMcpToolDefinition } from './tool';

/** Named restore points of documents and worldbuilding entries. */
export function snapshotTools(
  injector: Injector,
  ctx: ProjectToolContext
): WebMcpToolDefinition[] {
  const snapshots = injector.get(UnifiedSnapshotService);
  const access = new DocumentAccess(injector);

  function snapshotable(elementId: string): Element {
    const element = ctx.element(elementId);
    if (
      element.type !== ElementType.Item &&
      element.type !== ElementType.Worldbuilding
    ) {
      throw new ToolError(
        'Only documents (ITEM) and WORLDBUILDING elements have snapshots.'
      );
    }
    return element;
  }

  /**
   * The id snapshots are filed under: the full document id for prose (as the
   * document editor uses), the element id for worldbuilding.
   */
  function snapshotDocumentId(element: Element): string {
    return element.type === ElementType.Item
      ? ctx.documentId(element.id)
      : element.id;
  }

  /** Worldbuilding snapshots read the element's live connection. */
  async function connect(element: Element): Promise<void> {
    if (element.type !== ElementType.Worldbuilding) return;
    const { username, slug } = ctx.project();
    await injector
      .get(WorldbuildingService)
      .getWorldbuildingData(element.id, username, slug);
  }

  return [
    {
      name: 'list_snapshots',
      title: 'List snapshots',
      description:
        'Saved snapshots (restore points) of a document or worldbuilding element, newest first.',
      inputSchema: schema({ elementId: { type: 'string' } }, ['elementId']),
      readOnly: true,
      untrustedContent: true,
      run: async args => {
        const element = snapshotable(args.string('elementId'));
        const documentId = snapshotDocumentId(element);
        const list = await snapshots.listSnapshots(documentId);
        return {
          snapshots: list
            .filter(
              s => s.documentId === documentId || s.documentId === element.id
            )
            .map(s => ({
              id: s.id,
              name: s.name,
              description: s.description,
              wordCount: s.wordCount,
              createdAt: s.createdAt,
            })),
        };
      },
    },
    {
      name: 'create_snapshot',
      writes: true,
      title: 'Create snapshot',
      description:
        'Save the current state of a document or worldbuilding element as a named snapshot, e.g. before a large rewrite.',
      inputSchema: schema(
        {
          elementId: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
        },
        ['elementId', 'name']
      ),
      run: async args => {
        ctx.requireWrite();
        const element = snapshotable(args.string('elementId'));
        const documentId = snapshotDocumentId(element);
        await connect(element);
        if (element.type === ElementType.Item) {
          // Brings a document no editor has open up to date first.
          await access.readXml(documentId);
        }
        const snapshot = await snapshots.createSnapshot(
          documentId,
          args.string('name').trim(),
          args.optionalString('description')
        );
        return {
          id: snapshot.id,
          name: snapshot.name,
          wordCount: snapshot.wordCount,
        };
      },
    },
    {
      name: 'restore_snapshot',
      writes: true,
      title: 'Restore snapshot',
      description:
        'Replace the current content of a document or worldbuilding element with a snapshot. The current content is lost unless snapshotted first; ask the user.',
      inputSchema: schema(
        {
          elementId: { type: 'string' },
          snapshotId: { type: 'string' },
        },
        ['elementId', 'snapshotId']
      ),
      consequential: true,
      run: async args => {
        ctx.requireWrite();
        const element = snapshotable(args.string('elementId'));
        const snapshotId = args.string('snapshotId');
        const documentId = snapshotDocumentId(element);
        if (element.type === ElementType.Worldbuilding) {
          await connect(element);
          await snapshots.restoreFromSnapshot(documentId, snapshotId);
          return { restored: snapshotId };
        }
        const snapshot = await snapshots.getSnapshotForRestore(snapshotId);
        if (!snapshot)
          throw new ToolError(`No snapshot with id "${snapshotId}".`);
        if (
          snapshot.documentId !== documentId &&
          snapshot.documentId !== element.id
        ) {
          throw new ToolError(
            `Snapshot "${snapshot.name}" belongs to another element.`
          );
        }
        if (!snapshot.xmlContent) {
          throw new ToolError(`Snapshot "${snapshot.name}" has no content.`);
        }
        await access.writeXml(documentId, snapshot.xmlContent);
        return { restored: snapshotId, name: snapshot.name };
      },
    },
  ];
}
