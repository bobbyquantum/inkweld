import { Injector } from '@angular/core';
import { Router } from '@angular/router';
import { ElementType } from '@inkweld/index';
import {
  createDefaultPublishPlan,
  type PublishPlan,
  PublishPlanItemType,
} from '@models/publish-plan';
import { ElementTreeService } from '@services/project/element-tree.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { PublishService } from '@services/publish/publish.service';
import { PublishPlanService } from '@services/publish/publish-plan.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callTool,
  createProjectStateFake,
  element,
  type ProjectStateFake,
} from '../../../../testing/webmcp-testing';
import { ProjectToolContext } from './project-context';
import { publishTools } from './publish.tools';
import type { WebMcpToolDefinition } from './tool';

describe('publish tools', () => {
  let state: ProjectStateFake;
  let tools: WebMcpToolDefinition[];
  let plans: PublishPlan[];
  let planService: Record<string, ReturnType<typeof vi.fn>>;
  let publish: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    state = createProjectStateFake([
      element('part1', 'Part One', ElementType.Folder),
      element('ch1', 'Chapter One', ElementType.Item, 1),
      element('map', 'Map', ElementType.Canvas),
    ]);
    const existing = createDefaultPublishPlan('The Novel', 'Alice');
    existing.id = 'plan-1';
    existing.name = 'Ebook';
    existing.items = [
      {
        id: 'i1',
        type: PublishPlanItemType.Element,
        elementId: 'part1',
        includeChildren: true,
      },
    ];
    plans = [existing];
    planService = {
      getPlans: vi.fn(() => plans),
      getPlan: vi.fn((id: string) => plans.find(p => p.id === id)),
      createPlan: vi.fn((name: string, title: string, author: string) => {
        const plan = createDefaultPublishPlan(title, author);
        plan.id = 'plan-2';
        plan.name = name;
        plans.push(plan);
        return plan;
      }),
      updatePlan: vi.fn((plan: PublishPlan) => {
        plans = plans.map(p => (p.id === plan.id ? plan : p));
      }),
    };
    publish = vi.fn().mockResolvedValue({
      success: true,
      result: { filename: 'novel.epub' },
      blob: new Blob(['epub']),
    });
    navigate = vi.fn().mockResolvedValue(true);
    const injector = Injector.create({
      providers: [
        { provide: ProjectStateService, useValue: state },
        { provide: ElementTreeService, useClass: ElementTreeService },
        { provide: PublishPlanService, useValue: planService },
        { provide: PublishService, useValue: { publish } },
        { provide: Router, useValue: { navigate } },
        {
          provide: UnifiedUserService,
          useValue: {
            currentUser: () => ({ username: 'alice', name: 'Alice Doe' }),
          },
        },
      ],
    });
    tools = publishTools(injector, new ProjectToolContext(injector));
  });

  it('lists plans with their contents', async () => {
    const { data } = await callTool(tools, 'list_publish_plans');
    expect(data.plans[0]).toMatchObject({
      id: 'plan-1',
      name: 'Ebook',
      format: 'EPUB',
      items: [
        {
          type: 'element',
          elementId: 'part1',
          name: 'Part One',
          includeChildren: true,
        },
      ],
    });
  });

  it('creates a plan from elements', async () => {
    const { data } = await callTool(tools, 'create_publish_plan', {
      name: 'Print',
      format: 'PDF_SIMPLE',
      elementIds: ['part1', 'ch1'],
    });
    expect(planService['createPlan']).toHaveBeenCalledWith(
      'Print',
      'The Novel',
      'Alice Doe'
    );
    expect(data.format).toBe('PDF_SIMPLE');
    expect(
      data.items.map((i: { includeChildren: boolean }) => i.includeChildren)
    ).toEqual([true, false]);
  });

  it('only lists text elements in a plan', async () => {
    const canvas = await callTool(tools, 'create_publish_plan', {
      name: 'Print',
      elementIds: ['map'],
    });
    expect(canvas.error).toContain('plans can list');

    const none = await callTool(tools, 'create_publish_plan', {
      name: 'Print',
      elementIds: [],
    });
    expect(none.error).toContain('at least one');
  });

  it('opens a plan', async () => {
    await callTool(tools, 'open_publish_plan', { planId: 'plan-1' });
    expect(state.openPublishPlan).toHaveBeenCalledWith(plans[0]);
    expect(navigate).toHaveBeenCalledWith([
      '/',
      'alice',
      'novel',
      'publish-plan',
      'plan-1',
    ]);
  });

  it('publishes a plan and reports the file', async () => {
    const { data } = await callTool(tools, 'publish', { planId: 'plan-1' });
    expect(publish).toHaveBeenCalledWith('plan-1', { saveFile: true });
    expect(data).toEqual({
      published: 'Ebook',
      filename: 'novel.epub',
      bytes: 4,
    });
  });

  it('reports publishing failures and unknown plans', async () => {
    publish.mockResolvedValue({ success: false, error: 'No content' });
    expect((await callTool(tools, 'publish', { planId: 'plan-1' })).error).toBe(
      'No content'
    );
    expect((await callTool(tools, 'publish', { planId: 'x' })).error).toContain(
      'No publish plan'
    );
  });
});
