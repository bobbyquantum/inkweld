/**
 * Approved Conventional Commit scopes and their icons.
 *
 * Source of truth is the repo's `.github/commit-scopes.json`, which the
 * Validate PR Title check also reads (`scripts/check-pr-title.mjs`), so every
 * scope release-please writes into the changelog has an icon here.
 */
import commitScopes from '@commit-scopes';

interface CommitScope {
  icon: string;
  description: string;
  aliases?: string[];
}

const SCOPES: Readonly<Record<string, CommitScope>> = commitScopes.scopes;

const ICONS = new Map<string, string>();
for (const scope of Object.values(SCOPES)) {
  for (const alias of scope.aliases ?? []) ICONS.set(alias, scope.icon);
}
for (const [name, scope] of Object.entries(SCOPES)) ICONS.set(name, scope.icon);

/**
 * The Material Symbols icon for a commit scope (or one of its aliases, for
 * entries written before the list existed), or undefined for other scopes.
 */
export function commitScopeIcon(scope: string): string | undefined {
  return ICONS.get(scope);
}
