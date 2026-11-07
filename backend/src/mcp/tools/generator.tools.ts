/**
 * MCP Tools: Random generators
 *
 * List, create, edit, delete and roll a project's random generators: the
 * name, place and prompt generators of Settings → Generators in the app,
 * which template fields can offer as a dice button. They live in the elements
 * doc's `generators` array, the one the app's `GeneratorLibraryService` reads
 * (see `library-store.ts`). The model, validation and roll engine come from
 * `@inkweld/project-library`, so a roll here gives what the app would.
 *
 * Runtime-aware through `openEditableDocument` (live doc on Bun, a copy sent
 * back as a Yjs update on Workers).
 */

import { nanoid } from 'nanoid';
import type * as Y from 'yjs';
import {
  DEFAULT_GENERATOR_ICON,
  GENERATOR_CATEGORIES,
  MODIFIER_NAMES,
  RULE_KEY_PATTERN,
  cloneGenerator,
  rollGenerator,
  validateGenerator,
  type Generator,
  type GeneratorEntry,
  type GeneratorIssue,
  type GeneratorRule,
} from '@inkweld/project-library';
import type { McpContext, McpToolResult } from '../mcp.types';
import { registerTool } from '../mcp.handler';
import { MCP_PERMISSIONS } from '../mcp-permissions';
import {
  DESTRUCTIVE_TOOL,
  IDEMPOTENT_WRITE_TOOL,
  READ_ONLY_TOOL,
  WRITE_TOOL,
} from '../tool-annotations';
import { parseProjectParam } from './search.tools';
import {
  LibraryToolError,
  assertMaxLength,
  deleteRow,
  optionalBoolean,
  optionalInteger,
  optionalString,
  optionalStringArray,
  projectProperty,
  readElementNames,
  readRows,
  replaceRow,
  requiredString,
  resolveRow,
  runLibraryTool,
  textResult,
  withLibraryDoc,
} from './library-store';

const KIND = 'generator';
const LIST_TOOL = 'list_generators';
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_TEMPLATE_LENGTH = 2000;
const MAX_RULES = 200;
const MAX_ENTRIES = 10_000;
const MAX_ENTRY_LENGTH = 2000;
const MAX_ROLLS = 50;
const ICON_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

// ============================================
// Reading
// ============================================

/** The project's generators, normalised the way the app reads them. */
function readGenerators(doc: Y.Doc): Generator[] {
  return readRows(doc, 'generators').map((row) => cloneGenerator(row as unknown as Generator));
}

function errorsOf(issues: GeneratorIssue[]): GeneratorIssue[] {
  return issues.filter((i) => i.severity === 'error');
}

function presentIssues(issues: GeneratorIssue[]): Array<Record<string, unknown>> {
  return issues.map((i) => ({
    severity: i.severity,
    message: i.message,
    ...(i.ruleKey === undefined ? {} : { rule: i.ruleKey }),
  }));
}

/** A one-line view of a generator for the list. */
function summarizeGenerator(generator: Generator): Record<string, unknown> {
  const issues = validateGenerator(generator);
  return {
    id: generator.id,
    name: generator.name,
    icon: generator.icon,
    category: generator.category,
    description: generator.description,
    template: generator.template,
    rules: generator.rules.map((r) => `${r.key} (${r.entries.length})`),
    valid: errorsOf(issues).length === 0,
  };
}

/** The whole generator, with what is wrong with it. */
function presentGenerator(generator: Generator): Record<string, unknown> {
  const issues = validateGenerator(generator);
  return {
    id: generator.id,
    name: generator.name,
    icon: generator.icon,
    category: generator.category,
    description: generator.description,
    template: generator.template,
    rules: generator.rules,
    valid: errorsOf(issues).length === 0,
    ...(issues.length > 0 ? { issues: presentIssues(issues) } : {}),
    ...(generator.createdAt ? { createdAt: generator.createdAt } : {}),
    ...(generator.updatedAt ? { updatedAt: generator.updatedAt } : {}),
  };
}

/** Template fields (in the project's schemas) that offer this generator. */
function fieldsUsing(doc: Y.Doc, generatorId: string): string[] {
  const found: string[] = [];
  const visit = (value: unknown, schemaName: string): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, schemaName);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (record.generatorId === generatorId) {
      const label = [record.label, record.key].find((v) => typeof v === 'string') ?? '';
      found.push(`${schemaName} → ${label}`);
    }
    for (const child of Object.values(record)) visit(child, schemaName);
  };
  for (const schema of doc.getArray<unknown>('schemas').toArray()) {
    const name = (schema as { name?: unknown } | null)?.name;
    visit(schema, typeof name === 'string' ? name : '');
  }
  return found;
}

// ============================================
// Argument parsing
// ============================================

function parseEntry(value: unknown, where: string): GeneratorEntry {
  if (typeof value === 'string') {
    assertMaxLength(value, where, MAX_ENTRY_LENGTH);
    return { text: value };
  }
  if (!value || typeof value !== 'object' || typeof (value as GeneratorEntry).text !== 'string') {
    throw new LibraryToolError(`${where} must be a string or {"text": "...", "weight": 2}`);
  }
  const { text, weight } = value as GeneratorEntry;
  assertMaxLength(text, where, MAX_ENTRY_LENGTH);
  if (weight === undefined || weight === null) return { text };
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) {
    throw new LibraryToolError(`${where}.weight must be a positive number`);
  }
  return weight === 1 ? { text } : { text, weight };
}

function parseRules(value: unknown): GeneratorRule[] {
  if (!Array.isArray(value)) {
    throw new LibraryToolError('rules must be an array of {"key": "...", "entries": [...]}');
  }
  if (value.length > MAX_RULES) {
    throw new LibraryToolError(`a generator can have at most ${MAX_RULES} rules`);
  }
  let total = 0;
  const rules = value.map((rule, i) => {
    const r = rule as { key?: unknown; entries?: unknown } | null;
    if (!r || typeof r !== 'object' || typeof r.key !== 'string') {
      throw new LibraryToolError(`rules[${i}] must be {"key": "...", "entries": [...]}`);
    }
    const key = r.key.trim();
    if (!RULE_KEY_PATTERN.test(key)) {
      throw new LibraryToolError(
        `rules[${i}].key "${r.key}" must start with a letter and use only letters, digits and underscores`
      );
    }
    if (!Array.isArray(r.entries)) {
      throw new LibraryToolError(`rules[${i}].entries must be an array`);
    }
    total += r.entries.length;
    return { key, entries: r.entries.map((e, j) => parseEntry(e, `rules[${i}].entries[${j}]`)) };
  });
  if (total > MAX_ENTRIES) {
    throw new LibraryToolError(`a generator can have at most ${MAX_ENTRIES} entries in all`);
  }
  return rules;
}

function parseIcon(icon: string): string {
  if (!ICON_PATTERN.test(icon)) {
    throw new LibraryToolError(
      `icon "${icon}" must be a Material icon name such as casino, person or castle`
    );
  }
  return icon;
}

function checkedText(args: Record<string, unknown>, name: string, max: number): string | undefined {
  const value = optionalString(args, name);
  if (value !== undefined) assertMaxLength(value, name, max);
  return value;
}

/** Refuse a generator the app's editor would refuse to save; return its warnings. */
function assertSavable(generator: Generator): GeneratorIssue[] {
  const issues = validateGenerator(generator);
  const errors = errorsOf(issues);
  if (errors.length > 0) {
    throw new LibraryToolError(
      `the generator has problems, nothing was saved: ${errors.map((e) => e.message).join(' ')}`
    );
  }
  return issues;
}

function savedResult(verb: string, generator: Generator, warnings: GeneratorIssue[]) {
  const sample = rollGenerator(generator, { count: 3 }).map((r) => r.text);
  const warningText =
    warnings.length > 0 ? ` Warnings: ${warnings.map((w) => w.message).join(' ')}` : '';
  return textResult(
    `${verb} generator "${generator.name}" (id ${generator.id}). Sample rolls: ${sample
      .map((s) => JSON.stringify(s))
      .join(', ')}.${warningText}`,
    { success: true, generator: presentGenerator(generator), sample }
  );
}

const ruleSyntax =
  'A roll expands template, replacing each #key# with a random entry of that rule (entries can ' +
  'refer to other rules). Modifiers after a dot change the text ' +
  `(${MODIFIER_NAMES.join(', ')}), e.g. "#adjective.a# #creature.capitalize#".`;

const rulesProperty = {
  type: 'array',
  description:
    'Rules the template refers to. Each entry is a string or {"text", "weight"} ' +
    '(weight 3 is three times as likely as 1).',
  items: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: 'Rule name used as #key#: a letter, then letters, digits, _.',
      },
      entries: {
        type: 'array',
        items: {
          type: ['string', 'object'],
          properties: { text: { type: 'string' }, weight: { type: 'number' } },
        },
      },
    },
    required: ['key', 'entries'],
  },
} as const;

const definitionProperties = {
  template: {
    type: 'string',
    description: 'Root template expanded on each roll, e.g. "#first# #last#".',
  },
  rules: rulesProperty,
  description: { type: 'string', description: 'What the generator is for.' },
  category: {
    type: 'string',
    description: `Grouping in the library: ${GENERATOR_CATEGORIES.join(', ')}, or any other word.`,
  },
  icon: {
    type: 'string',
    description: `Material icon name (default ${DEFAULT_GENERATOR_ICON}).`,
  },
} as const;

// ============================================
// list_generators tool
// ============================================

registerTool({
  tool: {
    name: 'list_generators',
    title: 'List Generators',
    description:
      "List the project's random generators (names, places, prompts) with their rules and whether " +
      'each can be rolled. Pass generatorId for one generator in full, with every entry and any ' +
      'problems. Roll one with roll_generator.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectProperty,
        generatorId: { type: 'string', description: 'A generator id or name: show it in full.' },
      },
      required: ['project'],
    },
    annotations: READ_ONLY_TOOL,
  },
  requiredPermissions: [MCP_PERMISSIONS.READ_SCHEMAS],
  execute(ctx: McpContext, _db: unknown, args: Record<string, unknown>): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.READ_SCHEMAS);
    if ('error' in result) return Promise.resolve(result.error);
    const project = result.project;

    return runLibraryTool(LIST_TOOL, `${project.username}/${project.slug}`, () =>
      withLibraryDoc(
        ctx,
        project,
        'generators',
        (doc) => {
          const generators = readGenerators(doc);
          const ref = optionalString(args, 'generatorId');
          if (ref) {
            const generator = resolveRow(generators, ref, KIND, LIST_TOOL);
            const payload = {
              generator: presentGenerator(generator),
              usedByFields: fieldsUsing(doc, generator.id),
            };
            return textResult(JSON.stringify(payload, null, 2), payload);
          }
          const payload = { generators: generators.map(summarizeGenerator) };
          const text =
            generators.length === 0
              ? 'This project has no generators yet. Create one with create_generator.'
              : JSON.stringify(payload, null, 2);
          return textResult(text, payload);
        },
        { commit: false }
      )
    );
  },
});

// ============================================
// roll_generator tool
// ============================================

registerTool({
  tool: {
    name: 'roll_generator',
    title: 'Roll Generator',
    description:
      'Roll a project generator for names, places or prompts, the same way the dice button in the ' +
      'app does. excludeElementNames skips results that are already the name of an element (useful ' +
      'for character names). Each result has a seed that reproduces it.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectProperty,
        generatorId: { type: 'string', description: 'The generator id or name.' },
        count: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_ROLLS,
          description: `How many results (default 1, at most ${MAX_ROLLS}).`,
        },
        unique: { type: 'boolean', description: 'Drop duplicate results.' },
        exclude: {
          type: 'array',
          items: { type: 'string' },
          description: 'Results to skip (ignoring case), e.g. names already used.',
        },
        excludeElementNames: {
          type: 'boolean',
          description: "Skip results that match the name of one of the project's elements.",
        },
        seed: {
          type: 'integer',
          minimum: 0,
          maximum: 4294967295,
          description: 'Seed of an earlier result, to roll it again.',
        },
      },
      required: ['project', 'generatorId'],
    },
    annotations: READ_ONLY_TOOL,
  },
  requiredPermissions: [MCP_PERMISSIONS.READ_SCHEMAS],
  execute(ctx: McpContext, _db: unknown, args: Record<string, unknown>): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.READ_SCHEMAS);
    if ('error' in result) return Promise.resolve(result.error);
    const project = result.project;

    return runLibraryTool('roll_generator', `${project.username}/${project.slug}`, () =>
      withLibraryDoc(
        ctx,
        project,
        'generators',
        (doc) => {
          const count = optionalInteger(args, 'count', 1, MAX_ROLLS) ?? 1;
          const seed = optionalInteger(args, 'seed', 0, 0xffffffff);
          const unique = optionalBoolean(args, 'unique');
          const exclude = [
            ...(optionalStringArray(args, 'exclude') ?? []),
            ...(optionalBoolean(args, 'excludeElementNames') ? readElementNames(doc) : []),
          ];
          const generator = resolveRow(
            readGenerators(doc),
            requiredString(args, 'generatorId'),
            KIND,
            LIST_TOOL
          );
          const errors = errorsOf(validateGenerator(generator));
          if (errors.length > 0) {
            throw new LibraryToolError(
              `generator "${generator.name}" can't be rolled yet: ${errors.map((e) => e.message).join(' ')}`
            );
          }
          const results = rollGenerator(generator, {
            count,
            unique,
            exclude,
            ...(seed === undefined ? {} : { seed }),
          });
          const payload = { generatorId: generator.id, generatorName: generator.name, results };
          const shortfall =
            results.length < count
              ? ` Only ${results.length} of ${count}: the generator has too few distinct results left.`
              : '';
          const lines = results.map((r) => `- ${r.text}`).join('\n');
          return textResult(`${generator.name}:\n${lines}${shortfall}`, payload);
        },
        { commit: false }
      )
    );
  },
});

// ============================================
// create_generator tool
// ============================================

registerTool({
  tool: {
    name: 'create_generator',
    title: 'Create Generator',
    annotations: WRITE_TOOL,
    description:
      'Create a random generator in the project (Settings → Generators in the app), e.g. for ' +
      `character names or tavern names. ${ruleSyntax} A plain word list is a template "#word#" with ` +
      'one rule. The generator must be rollable (every #key# has a rule with entries, no rule only ' +
      'refers back to itself), or nothing is saved. Returns a few sample rolls.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectProperty,
        name: { type: 'string', description: 'Generator name, e.g. "Dwarven names".' },
        ...definitionProperties,
      },
      required: ['project', 'name', 'template', 'rules'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_SCHEMAS],
  execute(ctx: McpContext, _db: unknown, args: Record<string, unknown>): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_SCHEMAS);
    if ('error' in result) return Promise.resolve(result.error);
    const project = result.project;

    return runLibraryTool('create_generator', `${project.username}/${project.slug}`, () =>
      withLibraryDoc(ctx, project, 'generators', (doc) => {
        const name = requiredString(args, 'name');
        assertMaxLength(name, 'name', MAX_NAME_LENGTH);
        const template = requiredString(args, 'template');
        assertMaxLength(template, 'template', MAX_TEMPLATE_LENGTH);
        const icon = optionalString(args, 'icon');
        const now = new Date().toISOString();
        const generator = cloneGenerator({
          id: nanoid(),
          name,
          icon: icon ? parseIcon(icon) : DEFAULT_GENERATOR_ICON,
          description: checkedText(args, 'description', MAX_DESCRIPTION_LENGTH) ?? '',
          category: checkedText(args, 'category', MAX_NAME_LENGTH) || 'other',
          template,
          rules: parseRules(args.rules),
          createdAt: now,
          updatedAt: now,
        });
        const warnings = assertSavable(generator);
        doc.getArray<unknown>('generators').push([generator]);
        return savedResult('Created', generator, warnings);
      })
    );
  },
});

// ============================================
// update_generator tool
// ============================================

/** Apply the arguments to `existing`. */
function updatedGenerator(existing: Generator, args: Record<string, unknown>): Generator {
  const updates: Partial<Generator> = {};
  const name = checkedText(args, 'name', MAX_NAME_LENGTH);
  if (name !== undefined) {
    if (!name) throw new LibraryToolError('name cannot be empty');
    updates.name = name;
  }
  const template = checkedText(args, 'template', MAX_TEMPLATE_LENGTH);
  if (template !== undefined) updates.template = template;
  if (args.rules !== undefined) updates.rules = parseRules(args.rules);
  const description = checkedText(args, 'description', MAX_DESCRIPTION_LENGTH);
  if (description !== undefined) updates.description = description;
  const category = checkedText(args, 'category', MAX_NAME_LENGTH);
  if (category !== undefined) updates.category = category || 'other';
  const icon = optionalString(args, 'icon');
  if (icon !== undefined) updates.icon = icon ? parseIcon(icon) : DEFAULT_GENERATOR_ICON;

  if (Object.keys(updates).length === 0) {
    throw new LibraryToolError(
      'nothing to change: pass name, template, rules, description, category or icon'
    );
  }
  return cloneGenerator({
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  });
}

registerTool({
  tool: {
    name: 'update_generator',
    title: 'Update Generator',
    annotations: IDEMPOTENT_WRITE_TOOL,
    description:
      'Change a generator: rename it, or change its template, rules, description, category or icon. ' +
      'Potentially destructive: rules, when passed, replaces all of its rules, so include the ones ' +
      'to keep (list_generators with generatorId shows them). The result must still be rollable, ' +
      `or nothing is saved. ${ruleSyntax}`,
    inputSchema: {
      type: 'object',
      properties: {
        project: projectProperty,
        generatorId: { type: 'string', description: 'The generator id or name.' },
        name: { type: 'string', description: 'New name.' },
        ...definitionProperties,
      },
      required: ['project', 'generatorId'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_SCHEMAS],
  execute(ctx: McpContext, _db: unknown, args: Record<string, unknown>): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_SCHEMAS);
    if ('error' in result) return Promise.resolve(result.error);
    const project = result.project;

    return runLibraryTool('update_generator', `${project.username}/${project.slug}`, () =>
      withLibraryDoc(ctx, project, 'generators', (doc) => {
        const existing = resolveRow(
          readGenerators(doc),
          requiredString(args, 'generatorId'),
          KIND,
          LIST_TOOL
        );
        const generator = updatedGenerator(existing, args);
        const warnings = assertSavable(generator);
        replaceRow(doc, 'generators', generator);
        return savedResult('Updated', generator, warnings);
      })
    );
  },
});

// ============================================
// delete_generator tool
// ============================================

registerTool({
  tool: {
    name: 'delete_generator',
    title: 'Delete Generator',
    description:
      'Delete a generator from the project. Template fields that offered it lose their dice button.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectProperty,
        generatorId: { type: 'string', description: 'The generator id or name.' },
      },
      required: ['project', 'generatorId'],
    },
    annotations: DESTRUCTIVE_TOOL,
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_SCHEMAS],
  execute(ctx: McpContext, _db: unknown, args: Record<string, unknown>): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_SCHEMAS);
    if ('error' in result) return Promise.resolve(result.error);
    const project = result.project;

    return runLibraryTool('delete_generator', `${project.username}/${project.slug}`, () =>
      withLibraryDoc(ctx, project, 'generators', (doc) => {
        const generator = resolveRow(
          readGenerators(doc),
          requiredString(args, 'generatorId'),
          KIND,
          LIST_TOOL
        );
        const fields = fieldsUsing(doc, generator.id);
        deleteRow(doc, 'generators', generator.id);
        const fieldWord = fields.length === 1 ? 'field' : 'fields';
        const note =
          fields.length > 0
            ? ` ${fields.length} template ${fieldWord} offered it: ${fields.join(', ')}.`
            : '';
        return textResult(`Deleted generator "${generator.name}" (id ${generator.id}).${note}`, {
          success: true,
          deleted: generator.id,
          fieldsThatUsedIt: fields,
        });
      })
    );
  },
});
