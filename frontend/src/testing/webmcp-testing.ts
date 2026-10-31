import { signal } from '@angular/core';
import { type Element, ElementType, type Project } from '@inkweld/index';
import { ElementTreeService } from '@services/project/element-tree.service';
import type { AppTab } from '@services/project/tab-manager.service';
import type {
  ToolResult,
  WebMcpToolDefinition,
} from '@services/webmcp/tools/tool';
import { toModelContextTool } from '@services/webmcp/tools/tool';
import { vi } from 'vitest';

/** Run a WebMCP tool the way the browser would and unpack its result. */
export async function callTool(
  tools: WebMcpToolDefinition[],
  name: string,
  input: Record<string, unknown> = {}
): Promise<{ data: any; error: string | undefined }> {
  const tool = tools.find(t => t.name === name);
  if (!tool) throw new Error(`No tool named ${name}`);
  const result = (await toModelContextTool(tool).execute(input)) as ToolResult;
  const first = result.content[0];
  const text = first?.type === 'text' ? first.text : undefined;
  return {
    data: result.structuredContent ?? text,
    error: result.isError ? text : undefined,
  };
}

/** A tree element with sensible defaults. */
export function element(
  id: string,
  name: string,
  type: ElementType,
  level = 0,
  extra: Partial<Element> = {}
): Element {
  return {
    id,
    name,
    type,
    level,
    parentId: null,
    order: 0,
    expandable: type === ElementType.Folder,
    version: 0,
    metadata: {},
    ...extra,
  };
}

export const TEST_PROJECT: Project = {
  id: 'project-1',
  username: 'alice',
  slug: 'novel',
  title: 'The Novel',
  description: 'A test project',
  createdDate: '2026-01-01T00:00:00.000Z',
  updatedDate: '2026-01-02T00:00:00.000Z',
};

/**
 * A stand-in for ProjectStateService that keeps a real element list, so
 * tree tools can be checked against the resulting order and levels.
 */
export function createProjectStateFake(initial: Element[]) {
  const tree = new ElementTreeService();
  const elements = signal<Element[]>(tree.recomputeOrder(initial));
  const pinned = signal<string[]>([]);
  const replace = (next: Element[]): void =>
    elements.set(tree.recomputeOrder(next));

  return {
    project: signal<Project | undefined>(TEST_PROJECT),
    elements,
    canWrite: signal(true),
    isLoading: signal(false),
    error: signal<string | undefined>(undefined),
    pinnedElementIds: pinned,
    openTabs: signal<AppTab[]>([]),
    selectedTabIndex: signal(0),
    publishPlans: signal([]),
    isPinned: (id: string) => pinned().includes(id),
    togglePin: vi.fn((id: string) =>
      pinned.update(ids =>
        ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
      )
    ),
    renameNode: vi.fn((node: Element, name: string) =>
      replace(elements().map(e => (e.id === node.id ? { ...e, name } : e)))
    ),
    moveElement: vi.fn((id: string, index: number, level: number) =>
      elements.set(tree.moveElement(elements(), id, index, level))
    ),
    deleteElement: vi.fn((id: string) => {
      const list = elements();
      const index = list.findIndex(e => e.id === id);
      const subtree = tree.getSubtree(list, index);
      replace(list.filter(e => !subtree.includes(e)));
    }),
    createElement: vi.fn(
      (
        type: ElementType,
        name: string,
        options: { parentId?: string; afterElementId?: string } = {}
      ) => {
        const list = elements();
        const parent = list.find(e => e.id === options.parentId);
        const created = element(
          `new-${list.length}`,
          name,
          type,
          parent ? parent.level + 1 : 0,
          { parentId: parent?.id ?? null }
        );
        replace([...list, created]);
        return created;
      }
    ),
    updateElementMetadata: vi.fn(
      (id: string, metadata: Record<string, string>) =>
        replace(
          elements().map(e =>
            e.id === id ? { ...e, metadata: { ...e.metadata, ...metadata } } : e
          )
        )
    ),
    setDocumentRole: vi.fn(),
    setDocumentFormat: vi.fn(),
    setExpanded: vi.fn(),
    closeTab: vi.fn(),
    closeTabByElementId: vi.fn(),
    openSystemTab: vi.fn(() => ({ index: 1, wasCreated: true })),
    openHomeTab: vi.fn(),
    selectTab: vi.fn(),
    updateProject: vi.fn(),
    openPublishPlan: vi.fn(),
  };
}

export type ProjectStateFake = ReturnType<typeof createProjectStateFake>;
