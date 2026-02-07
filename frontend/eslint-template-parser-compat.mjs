/**
 * ESLint 10 compatibility wrapper for @angular-eslint/template-parser.
 *
 * ESLint 10 requires ScopeManager.addGlobals() to work properly and expects
 * variables to be created in the first scope. The angular-eslint template
 * parser creates a module scope without a parent global scope, causing crashes
 * in ESLint 10's addDeclaredGlobals() function.
 *
 * This wrapper patches the scopeManager to implement addGlobals() correctly
 * by defining variables directly in scopes[0].
 *
 * TODO: Remove this once angular-eslint releases ESLint 10 support.
 */
import * as templateParser from '@angular-eslint/template-parser';

export const meta = templateParser.meta;

export function parseForESLint(code, options) {
  const result = templateParser.parseForESLint(code, options);

  // Patch the scopeManager for ESLint 10 compatibility
  if (result.scopeManager) {
    const scope = result.scopeManager.scopes[0];

    if (!result.scopeManager.globalScope) {
      result.scopeManager.globalScope = scope;
    }

    // Implement addGlobals if not functional
    result.scopeManager.addGlobals = names => {
      for (const name of names) {
        if (!scope.set.has(name)) {
          const variable = {
            name,
            identifiers: [],
            references: [],
            defs: [],
            eslintExplicitGlobal: false,
            eslintExplicitGlobalComments: undefined,
            eslintImplicitGlobalSetting: 'readonly',
            writeable: false,
            scope,
          };
          scope.set.set(name, variable);
          scope.variables.push(variable);
        }
      }
    };
  }

  return result;
}
