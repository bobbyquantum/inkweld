import commitScopes from '@commit-scopes';
import { describe, expect, it } from 'vitest';

import { commitScopeIcon } from './commit-scopes';

describe('commitScopeIcon', () => {
  it('returns the icon of an approved scope', () => {
    expect(commitScopeIcon('editor')).toBe('edit_note');
    expect(commitScopeIcon('deps')).toBe('package_2');
  });

  it('returns the scope icon for an alias', () => {
    expect(commitScopeIcon('tree')).toBe(commitScopeIcon('project-tree'));
  });

  it('returns undefined for other scopes', () => {
    expect(commitScopeIcon('frontend')).toBeUndefined();
  });

  it('has an icon for every approved scope', () => {
    for (const name of Object.keys(commitScopes.scopes)) {
      expect(commitScopeIcon(name)).toMatch(/^[\da-z_]+$/);
    }
  });
});
