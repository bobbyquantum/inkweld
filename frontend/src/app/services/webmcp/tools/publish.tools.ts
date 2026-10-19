import type { Injector } from '@angular/core';
import { Router } from '@angular/router';
import {
  type ElementItem,
  PublishFormat,
  type PublishPlan,
  PublishPlanItemType,
} from '@models/publish-plan';
import {
  elementPlanItem,
  isPlannableType,
} from '@services/publish/plan-contents';
import { PublishService } from '@services/publish/publish.service';
import { PublishPlanService } from '@services/publish/publish-plan.service';
import { UnifiedUserService } from '@services/user/unified-user.service';

import type { ProjectToolContext } from './project-context';
import { schema, ToolError, type WebMcpToolDefinition } from './tool';

const FORMATS = Object.values(PublishFormat);

/** Publish plans (what goes into a book, and in which format) and exports. */
export function publishTools(
  injector: Injector,
  ctx: ProjectToolContext
): WebMcpToolDefinition[] {
  const plans = injector.get(PublishPlanService);

  function requirePlan(planId: string): PublishPlan {
    const plan = plans.getPlan(planId);
    if (!plan) {
      throw new ToolError(
        `No publish plan "${planId}". Call list_publish_plans.`
      );
    }
    return plan;
  }

  function describe(plan: PublishPlan): Record<string, unknown> {
    const elements = ctx.elements();
    return {
      id: plan.id,
      name: plan.name,
      format: plan.format,
      title: plan.metadata.title,
      author: plan.metadata.author,
      items: plan.items.map(item => {
        if (item.type !== PublishPlanItemType.Element)
          return { type: item.type };
        const element = elements.find(e => e.id === item.elementId);
        return {
          type: item.type,
          elementId: item.elementId,
          name: element?.name ?? '(deleted)',
          includeChildren: item.includeChildren,
        };
      }),
    };
  }

  return [
    {
      name: 'list_publish_plans',
      title: 'List publish plans',
      description:
        'The publish plans of this project: which elements each one includes and its output format (EPUB, PDF, Markdown, HTML, website).',
      inputSchema: schema(),
      readOnly: true,
      untrustedContent: true,
      run: () => {
        ctx.project();
        return { plans: plans.getPlans().map(describe) };
      },
    },
    {
      name: 'create_publish_plan',
      writes: true,
      title: 'Create publish plan',
      description:
        'Create a publish plan listing the given elements in order (a folder brings everything inside it). Use publish to produce the file.',
      inputSchema: schema(
        {
          name: { type: 'string' },
          format: {
            type: 'string',
            enum: FORMATS,
            description: 'Default EPUB.',
          },
          elementIds: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Folders, documents or worldbuilding elements, in order.',
          },
          title: {
            type: 'string',
            description: 'Book title; defaults to the project title.',
          },
          author: {
            type: 'string',
            description: "Defaults to the author's name.",
          },
        },
        ['name', 'elementIds']
      ),
      run: args => {
        ctx.requireWrite();
        const project = ctx.project();
        const user = injector.get(UnifiedUserService).currentUser();
        const items: ElementItem[] = args.stringArray('elementIds').map(id => {
          const element = ctx.element(id);
          if (!isPlannableType(element.type)) {
            throw new ToolError(
              `"${element.name}" is a ${element.type}; plans can list folders, documents and worldbuilding elements.`
            );
          }
          return elementPlanItem(element.id, element.type);
        });
        if (items.length === 0)
          throw new ToolError('List at least one element.');
        const plan = plans.createPlan(
          args.string('name').trim(),
          args.optionalString('title') ?? project.title,
          args.optionalString('author') ?? user?.name ?? user?.username ?? ''
        );
        const updated: PublishPlan = {
          ...plan,
          format: args.optionalOneOf('format', FORMATS) ?? PublishFormat.EPUB,
          items,
          updatedAt: new Date().toISOString(),
        };
        plans.updatePlan(updated);
        return describe(updated);
      },
    },
    {
      name: 'open_publish_plan',
      title: 'Open publish plan',
      description:
        'Show a publish plan to the user so they can adjust its contents, metadata and styles.',
      inputSchema: schema({ planId: { type: 'string' } }, ['planId']),
      run: async args => {
        const project = ctx.project();
        const plan = requirePlan(args.string('planId'));
        ctx.state.openPublishPlan(plan);
        await injector
          .get(Router)
          .navigate([
            '/',
            project.username,
            project.slug,
            'publish-plan',
            plan.id,
          ]);
        return { opened: plan.name };
      },
    },
    {
      name: 'publish',
      title: 'Publish',
      description:
        "Generate the plan's output file (EPUB, PDF, …), save it to the project's published files and download it to the user's computer.",
      inputSchema: schema({ planId: { type: 'string' } }, ['planId']),
      run: async args => {
        ctx.project();
        const plan = requirePlan(args.string('planId'));
        const result = await injector
          .get(PublishService)
          .publish(plan.id, { saveFile: true });
        if (!result.success) {
          throw new ToolError(result.error ?? 'Publishing failed.');
        }
        return {
          published: plan.name,
          filename: result.result?.filename,
          bytes: result.blob?.size,
        };
      },
    },
  ];
}
