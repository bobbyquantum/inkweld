import type { Injector } from '@angular/core';
import { extractMediaId } from '@components/image-paste/image-paste-plugin';
import {
  CANVAS_CONFIG_META_KEY,
  describeCanvas,
  describeCanvasEdit,
  EDIT_CANVAS_DESCRIPTION,
  EDIT_CANVAS_PROPERTIES,
  GET_CANVAS_DESCRIPTION,
  GET_CANVAS_PROPERTIES,
  planCanvasEdit,
  resolveCanvasContents,
  seedCanvasEdit,
} from '@inkweld/canvas';
import type { Element } from '@inkweld/index';
import { SetupService } from '@services/core/setup.service';
import { isLocalOrCloudMode } from '@services/core/storage-context.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { MediaSyncService } from '@services/local/media-sync.service';
import { CoverSourceService } from '@services/project/cover-source.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import { nanoid } from 'nanoid';

import { createLinkRelationship } from '../../../pages/project/tabs/canvas/canvas-pin-helpers';
import { mediaReferenceFilename } from '../../../utils/media-reference';
import type { ProjectToolContext } from './project-context';
import {
  schema,
  type ToolArgs,
  ToolError,
  type WebMcpToolDefinition,
} from './tool';

/** The named arguments as a plain object, for the shared canvas logic. */
function pick(args: ToolArgs, names: string[]): Record<string, unknown> {
  return Object.fromEntries(names.map(name => [name, args.raw(name)]));
}

/**
 * The placed images that are neither in this browser nor on the server. An
 * agent's typo would otherwise only show up as an image that never loads.
 */
async function findMissingMedia(
  injector: Injector,
  projectKey: string,
  references: string[]
): Promise<string[]> {
  const local = injector.get(LocalStorageService);
  const hasServer = !isLocalOrCloudMode(injector.get(SetupService).getMode());
  const found = await Promise.all(
    references.map(async reference => {
      const mediaId = extractMediaId(reference);
      if (mediaId && (await local.hasMedia(projectKey, mediaId))) return true;
      // Only `media://` references carry the filename the server knows.
      if (!hasServer || !reference.startsWith('media://')) return false;
      return injector
        .get(MediaSyncService)
        .fetchMissingMedia(projectKey, mediaReferenceFilename(reference));
    })
  );
  return references.filter((_, index) => !found[index]);
}

/**
 * Canvas contents, with the same arguments, errors and results as the server's
 * tools (`backend/src/mcp/tools/canvas.tools.ts`): the logic is shared in
 * `@inkweld/canvas`, and only the storage differs.
 */
export function canvasTools(
  injector: Injector,
  ctx: ProjectToolContext
): WebMcpToolDefinition[] {
  function readCanvas(element: Element) {
    return resolveCanvasContents(
      ctx.state.getCanvasContents(element.id),
      element.metadata?.[CANVAS_CONFIG_META_KEY]
    );
  }

  return [
    {
      name: 'get_canvas',
      title: 'Get canvas',
      description: GET_CANVAS_DESCRIPTION,
      inputSchema: schema(
        { elementId: { type: 'string' }, ...GET_CANVAS_PROPERTIES },
        ['elementId']
      ),
      readOnly: true,
      untrustedContent: true,
      run: args => {
        const element = ctx.canvas(args.string('elementId'));
        const result = describeCanvas(
          element.id,
          element.name,
          readCanvas(element).contents,
          pick(args, Object.keys(GET_CANVAS_PROPERTIES))
        );
        if ('error' in result) throw new ToolError(String(result['error']));
        return result;
      },
    },
    {
      name: 'edit_canvas',
      writes: true,
      title: 'Edit canvas',
      description: EDIT_CANVAS_DESCRIPTION,
      inputSchema: schema(
        { elementId: { type: 'string' }, ...EDIT_CANVAS_PROPERTIES },
        ['elementId']
      ),
      run: async args => {
        ctx.requireWrite();
        const element = ctx.canvas(args.string('elementId'));
        const { contents, needsSeed } = readCanvas(element);

        const plan = planCanvasEdit(
          contents,
          pick(args, Object.keys(EDIT_CANVAS_PROPERTIES)),
          {
            canvasElementId: element.id,
            createId: nanoid,
            elementExists: id => ctx.elements().some(e => e.id === id),
          }
        );
        if ('error' in plan) throw new ToolError(plan.error);

        const { username, slug } = ctx.project();
        const missing = await findMissingMedia(
          injector,
          `${username}/${slug}`,
          plan.placedMedia
        );
        if (missing.length > 0) {
          throw new ToolError(
            `not in the project's media: ${missing.join(', ')}`
          );
        }

        // Without the seed, the edit's layers would make the canvas look
        // populated and the contents still in its metadata would be lost.
        const external = { external: true };
        if (needsSeed) {
          ctx.state.applyCanvasEdit(
            element.id,
            seedCanvasEdit(contents),
            external
          );
        }

        const relationships = injector.get(RelationshipService);
        for (const link of plan.linksToCreate) {
          createLinkRelationship(
            relationships,
            element.id,
            link.targetElementId,
            link.kind,
            link.relationshipId
          );
        }
        relationships.removeRelationships(plan.relationshipsToRemove);

        ctx.state.applyCanvasEdit(element.id, plan.edit, external);
        injector
          .get(CoverSourceService)
          .notifyCanvasChanged(element.id, plan.contents);

        return describeCanvasEdit(element.id, element.name, plan);
      },
    },
  ];
}
