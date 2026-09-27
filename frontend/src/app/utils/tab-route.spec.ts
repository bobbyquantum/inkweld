import type { AppTab } from '@services/project/tab-manager.service';
import { describe, expect, it } from 'vitest';

import { tabRouteCommands } from './tab-route';

const project = { username: 'alice', slug: 'novel' };

function tab(partial: Partial<AppTab>): AppTab {
  return { id: 'x', name: 'X', type: 'document', ...partial };
}

describe('tabRouteCommands', () => {
  it('routes the home tab to the project root', () => {
    expect(
      tabRouteCommands(tab({ type: 'system', systemType: 'home' }), project)
    ).toEqual(['/', 'alice', 'novel']);
  });

  it('routes other system tabs to their path', () => {
    expect(
      tabRouteCommands(tab({ type: 'system', systemType: 'settings' }), project)
    ).toEqual(['/', 'alice', 'novel', 'settings']);
  });

  it('routes element tabs by type and id', () => {
    expect(
      tabRouteCommands(tab({ type: 'document', id: 'doc1' }), project)
    ).toEqual(['/', 'alice', 'novel', 'document', 'doc1']);
  });

  it('routes publish plans by plan id, falling back to the tab id', () => {
    expect(
      tabRouteCommands(
        tab({
          type: 'publishPlan',
          id: 'publish-plan-p1',
          publishPlan: { id: 'p1' } as AppTab['publishPlan'],
        }),
        project
      )
    ).toEqual(['/', 'alice', 'novel', 'publish-plan', 'p1']);
    expect(
      tabRouteCommands(
        tab({ type: 'publishPlan', id: 'publish-plan-p2' }),
        project
      )
    ).toEqual(['/', 'alice', 'novel', 'publish-plan', 'p2']);
  });

  it('strips the schema- prefix from schema editor tabs', () => {
    expect(
      tabRouteCommands(tab({ type: 'schema-editor', id: 'schema-s1' }), project)
    ).toEqual(['/', 'alice', 'novel', 'schema', 's1']);
  });
});
