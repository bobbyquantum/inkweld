/**
 * MCP Tools: Time systems
 *
 * List, install, design, edit and remove a project's time systems: the
 * calendars timelines and date fields use (Settings → Time Systems in the
 * app). They live in the elements doc's `timeSystems` array, the one the app's
 * `TimeSystemLibraryService` reads (see `library-store.ts`). The data model,
 * the validation and the templates come from `@inkweld/project-library`.
 *
 * Runtime-aware through `openEditableDocument` (live doc on Bun, a copy sent
 * back as a Yjs update on Workers).
 */

import { nanoid } from 'nanoid';
import type * as Y from 'yjs';
import {
  TIME_SYSTEM_TEMPLATES,
  assertValidTimeSystem,
  findTemplateSystem,
  formatTimePoint,
  zeroTimePoint,
  type TimeSystem,
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
  type LibraryRow,
  assertMaxLength,
  deleteRow,
  optionalString,
  projectProperty,
  readRows,
  replaceRow,
  requiredString,
  resolveRow,
  runLibraryTool,
  textResult,
  withLibraryDoc,
} from './library-store';

const KIND = 'time system';
const LIST_TOOL = 'list_time_systems';
const MAX_UNITS = 12;
const MAX_NAME_LENGTH = 200;
const MAX_LABEL_LENGTH = 100;
const MAX_FORMAT_LENGTH = 500;
const MAX_SEPARATOR_LENGTH = 3;
const MAX_ALIASES_PER_UNIT = 1000;

/** The definition fields a caller may set (everything but `id` and `isBuiltIn`). */
type TimeSystemFields = Omit<TimeSystem, 'id' | 'isBuiltIn'>;
type PerUnitField = 'unitAliases' | 'unitAllowZero' | 'unitInputMode' | 'unitSubdivisionOverrides';
const PER_UNIT_FIELDS: readonly PerUnitField[] = [
  'unitAliases',
  'unitAllowZero',
  'unitInputMode',
  'unitSubdivisionOverrides',
];

// ============================================
// Reading
// ============================================

/** A stored row that has the shape of a time system. */
function isTimeSystem(row: LibraryRow): row is LibraryRow & TimeSystem {
  return (
    typeof row.name === 'string' &&
    Array.isArray(row.unitLabels) &&
    Array.isArray(row.subdivisions) &&
    typeof row.format === 'string'
  );
}

function readTimeSystems(doc: Y.Doc): Array<LibraryRow & TimeSystem> {
  return readRows(doc, 'timeSystems').filter(isTimeSystem);
}

/** A sample date in the system's display format, or null when the system can't format one. */
function exampleDate(system: TimeSystem): string | null {
  try {
    return formatTimePoint(zeroTimePoint(system), system);
  } catch {
    return null;
  }
}

/** A time system's public shape in tool results: the stored definition plus a sample date. */
function presentTimeSystem(system: TimeSystem): Record<string, unknown> {
  const definition: Record<string, unknown> = { ...system };
  delete definition.isBuiltIn;
  return { ...definition, exampleDate: exampleDate(system) };
}

// ============================================
// Argument parsing
// ============================================

function labelList(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new LibraryToolError(`${name} must be a non-empty array of unit names`);
  }
  if (value.length > MAX_UNITS) {
    throw new LibraryToolError(`${name} can have at most ${MAX_UNITS} units`);
  }
  return value.map((label, i) => {
    if (typeof label !== 'string' || !label.trim()) {
      throw new LibraryToolError(`${name}[${i}] must be a non-empty string`);
    }
    assertMaxLength(label.trim(), `${name}[${i}]`, MAX_LABEL_LENGTH);
    return label.trim();
  });
}

function subdivisionList(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new LibraryToolError('subdivisions must be an array of whole numbers');
  }
  return value.map((n, i) => {
    if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) {
      throw new LibraryToolError(`subdivisions[${i}] must be a positive whole number`);
    }
    return n;
  });
}

/** `[{...} | null, ...]` → per-unit maps, with `null` meaning "none for this unit". */
function perUnitMaps<V>(
  value: unknown,
  name: string,
  checkValue: (v: unknown, where: string) => V
): (Record<string, V> | undefined)[] {
  if (!Array.isArray(value)) {
    throw new LibraryToolError(
      `${name} must be an array with one entry (an object or null) per unit`
    );
  }
  return value.map((entry, i) => {
    if (entry === null || entry === undefined) return undefined;
    if (typeof entry !== 'object' || Array.isArray(entry)) {
      throw new LibraryToolError(`${name}[${i}] must be an object or null`);
    }
    const pairs = Object.entries(entry as Record<string, unknown>);
    if (pairs.length > MAX_ALIASES_PER_UNIT) {
      throw new LibraryToolError(`${name}[${i}] can have at most ${MAX_ALIASES_PER_UNIT} entries`);
    }
    const map: Record<string, V> = {};
    for (const [key, v] of pairs) {
      if (!/^-?\d+$/.test(key)) {
        throw new LibraryToolError(
          `${name}[${i}] keys must be unit values written as whole numbers, e.g. "1"; got "${key}"`
        );
      }
      map[key] = checkValue(v, `${name}[${i}]["${key}"]`);
    }
    return map;
  });
}

function aliasText(v: unknown, where: string): string {
  if (typeof v !== 'string' || !v.trim()) {
    throw new LibraryToolError(`${where} must be a non-empty string`);
  }
  assertMaxLength(v.trim(), where, MAX_LABEL_LENGTH);
  return v.trim();
}

function positiveCount(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
    throw new LibraryToolError(`${where} must be a positive whole number`);
  }
  return v;
}

function booleanList(value: unknown, name: string): boolean[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'boolean')) {
    throw new LibraryToolError(`${name} must be an array of true/false, one per unit`);
  }
  return value as boolean[];
}

function inputModeList(value: unknown, name: string): ('numeric' | 'dropdown')[] {
  if (!Array.isArray(value) || value.some((v) => v !== 'numeric' && v !== 'dropdown')) {
    throw new LibraryToolError(`${name} must be an array of "numeric" or "dropdown", one per unit`);
  }
  return value as ('numeric' | 'dropdown')[];
}

/** Parse one per-unit field; `null` clears it (returns `null`), absent returns `undefined`. */
function perUnitField(
  args: Record<string, unknown>,
  field: PerUnitField
): TimeSystemFields[PerUnitField] | null | undefined {
  const value = args[field];
  if (value === undefined) return undefined;
  if (value === null) return null;
  switch (field) {
    case 'unitAliases':
      return perUnitMaps(value, field, aliasText);
    case 'unitSubdivisionOverrides':
      return perUnitMaps(value, field, positiveCount);
    case 'unitAllowZero':
      return booleanList(value, field);
    case 'unitInputMode':
      return inputModeList(value, field);
  }
}

function checkSeparator(separator: string): string {
  if (!separator) throw new LibraryToolError('parseSeparator cannot be empty');
  assertMaxLength(separator, 'parseSeparator', MAX_SEPARATOR_LENGTH);
  return separator;
}

/** The default display format for a system: every unit, joined by the separator. */
function defaultFormat(unitCount: number, separator: string): string {
  return Array.from({ length: unitCount }, (_, i) => `{u${i}}`).join(separator);
}

/** Validate with the app's own check, reporting its message as a tool error. */
function assertValid(system: TimeSystem): void {
  try {
    assertValidTimeSystem(system);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new LibraryToolError(
      `${message}. subdivisions has one entry fewer than unitLabels (how many of each unit ` +
        'fit in the one above it), and each per-unit list has one entry per unit.'
    );
  }
}

/** A deep copy of a template, installed under the template's own id (as the app does). */
function installedCopy(template: TimeSystem): TimeSystem {
  return { ...structuredClone(template), isBuiltIn: false };
}

const unitAliasesProperty = {
  type: 'array',
  items: { type: ['object', 'null'], additionalProperties: { type: 'string' } },
  description:
    'Optional names for unit values, one entry per unit (null for none), keyed by the value as a ' +
    'string, e.g. [null, {"1": "Jan", "2": "Feb"}, null]. Shown where the format uses {aN}.',
} as const;

const definitionProperties = {
  unitLabels: {
    type: 'array',
    items: { type: 'string' },
    description: 'Unit names, largest first, e.g. ["Year", "Month", "Day"].',
  },
  subdivisions: {
    type: 'array',
    items: { type: 'integer', minimum: 1 },
    description:
      'How many of each unit fit in the one above it: one entry fewer than unitLabels, ' +
      'e.g. [12, 30] for 12 months of 30 days. [] for a single unit.',
  },
  format: {
    type: 'string',
    description:
      'Display template: {u0}, {u1}, ... are unit values (0 = largest), {a1} shows unit 1 by its ' +
      'alias, e.g. "{u0}-{a1}-{u2}" or "Year {u0}, {a1}". Defaults to the units joined by parseSeparator.',
  },
  parseSeparator: {
    type: 'string',
    description: 'Separator for typed dates, 1 to 3 characters (default "-").',
  },
  unitAliases: unitAliasesProperty,
  unitAllowZero: {
    type: 'array',
    items: { type: 'boolean' },
    description: 'Optional, one per unit: true lets that unit start at 0 instead of 1.',
  },
  unitInputMode: {
    type: 'array',
    items: { type: 'string', enum: ['numeric', 'dropdown'] },
    description:
      'Optional, one per unit: "dropdown" offers a list of values (with aliases) in the date editor.',
  },
  unitSubdivisionOverrides: {
    type: 'array',
    items: { type: ['object', 'null'], additionalProperties: { type: 'integer' } },
    description:
      'Optional irregular lengths, one entry per unit (null for none): for unit i, maps a value to ' +
      'how many of unit i+1 it holds, e.g. [null, {"2": 28, "4": 30}, null] for short months.',
  },
} as const;

// ============================================
// list_time_systems tool
// ============================================

registerTool({
  tool: {
    name: 'list_time_systems',
    title: 'List Time Systems',
    description:
      "List the project's time systems (calendars used by timelines and date fields) with their " +
      'units, subdivisions, display format and a sample date, plus the templates that can be installed ' +
      'with create_time_system. A timeline event or date refers to a system by id.',
    inputSchema: {
      type: 'object',
      properties: { project: projectProperty },
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
        'timeSystems',
        (doc) => {
          const systems = readTimeSystems(doc);
          const installed = new Set(systems.map((s) => s.id));
          const payload = {
            timeSystems: systems.map(presentTimeSystem),
            templates: TIME_SYSTEM_TEMPLATES.map((t) => ({
              id: t.id,
              name: t.name,
              unitLabels: t.unitLabels,
              exampleDate: exampleDate(t),
              installed: installed.has(t.id),
            })),
          };
          const text =
            systems.length === 0
              ? `This project has no time systems yet. Install a template or design one with create_time_system.\n${JSON.stringify(payload, null, 2)}`
              : JSON.stringify(payload, null, 2);
          return textResult(text, payload);
        },
        { commit: false }
      )
    );
  },
});

// ============================================
// create_time_system tool
// ============================================

/** Build a new custom system from the arguments. */
function customSystem(args: Record<string, unknown>): TimeSystem {
  const name = requiredString(args, 'name');
  assertMaxLength(name, 'name', MAX_NAME_LENGTH);
  const unitLabels = labelList(args.unitLabels, 'unitLabels');
  const subdivisions = args.subdivisions === undefined ? [] : subdivisionList(args.subdivisions);
  const parseSeparator = checkSeparator(optionalString(args, 'parseSeparator') || '-');
  const format = optionalString(args, 'format') || defaultFormat(unitLabels.length, parseSeparator);
  assertMaxLength(format, 'format', MAX_FORMAT_LENGTH);

  const system: TimeSystem = {
    id: nanoid(),
    name,
    isBuiltIn: false,
    unitLabels,
    subdivisions,
    format,
    parseSeparator,
  };
  for (const field of PER_UNIT_FIELDS) {
    const value = perUnitField(args, field);
    if (value) Object.assign(system, { [field]: value });
  }
  assertValid(system);
  return system;
}

registerTool({
  tool: {
    name: 'create_time_system',
    title: 'Create Time System',
    annotations: WRITE_TOOL,
    description:
      'Add a time system (calendar) to the project, for timelines and date fields. Either install a ' +
      'template by id (see list_time_systems: gregorian, fantasy-seasons, stardate, ...), or design one ' +
      'with name, unitLabels and subdivisions. Calendars are uniform except where ' +
      'unitSubdivisionOverrides gives a unit value its own length (short months).',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectProperty,
        template: {
          type: 'string',
          enum: TIME_SYSTEM_TEMPLATES.map((t) => t.id),
          description:
            'Install this template (its id is kept). Leave out to design a custom system.',
        },
        name: {
          type: 'string',
          description: 'Name of a custom system, e.g. "Imperial Reckoning".',
        },
        ...definitionProperties,
      },
      required: ['project'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_SCHEMAS],
  execute(ctx: McpContext, _db: unknown, args: Record<string, unknown>): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_SCHEMAS);
    if ('error' in result) return Promise.resolve(result.error);
    const project = result.project;

    return runLibraryTool('create_time_system', `${project.username}/${project.slug}`, () =>
      withLibraryDoc(ctx, project, 'timeSystems', (doc) => {
        const templateId = optionalString(args, 'template');
        let system: TimeSystem;
        if (templateId) {
          const template = findTemplateSystem(templateId);
          if (!template) {
            const ids = TIME_SYSTEM_TEMPLATES.map((t) => t.id).join(', ');
            throw new LibraryToolError(`no template "${templateId}". Templates: ${ids}`);
          }
          const existing = readTimeSystems(doc).find((s) => s.id === templateId);
          if (existing) {
            throw new LibraryToolError(
              `template "${templateId}" is already installed as "${existing.name}"`
            );
          }
          system = installedCopy(template);
        } else {
          system = customSystem(args);
        }

        doc.getArray<unknown>('timeSystems').push([system]);
        const shown = presentTimeSystem(system);
        return textResult(
          `Created time system "${system.name}" (id ${system.id}), e.g. ${String(shown.exampleDate)}.`,
          { success: true, timeSystem: shown }
        );
      })
    );
  },
});

// ============================================
// update_time_system tool
// ============================================

/** Apply the name, units, subdivisions, format and separator arguments. Returns whether any was passed. */
function applyCoreFields(updated: TimeSystem, args: Record<string, unknown>): boolean {
  let changed = false;
  const name = optionalString(args, 'name');
  if (name !== undefined) {
    if (!name) throw new LibraryToolError('name cannot be empty');
    assertMaxLength(name, 'name', MAX_NAME_LENGTH);
    updated.name = name;
    changed = true;
  }
  if (args.unitLabels !== undefined) {
    updated.unitLabels = labelList(args.unitLabels, 'unitLabels');
    changed = true;
  }
  if (args.subdivisions !== undefined) {
    updated.subdivisions = subdivisionList(args.subdivisions);
    changed = true;
  }
  const separator = optionalString(args, 'parseSeparator');
  if (separator !== undefined) {
    updated.parseSeparator = checkSeparator(separator);
    changed = true;
  }
  const format = optionalString(args, 'format');
  if (format !== undefined) {
    if (!format) throw new LibraryToolError('format cannot be empty');
    assertMaxLength(format, 'format', MAX_FORMAT_LENGTH);
    updated.format = format;
    changed = true;
  }
  return changed;
}

/** Apply the arguments to `existing`, returning the validated result. */
function updatedSystem(existing: TimeSystem, args: Record<string, unknown>): TimeSystem {
  const updated: TimeSystem = structuredClone(existing);
  let changed = applyCoreFields(updated, args);
  for (const field of PER_UNIT_FIELDS) {
    const value = perUnitField(args, field);
    if (value === undefined) continue;
    if (value === null) delete updated[field];
    else Object.assign(updated, { [field]: value });
    changed = true;
  }
  if (!changed) {
    throw new LibraryToolError(
      'nothing to change: pass name, unitLabels, subdivisions, format, parseSeparator or a per-unit list'
    );
  }
  assertValid(updated);
  return updated;
}

registerTool({
  tool: {
    name: 'update_time_system',
    title: 'Update Time System',
    annotations: IDEMPOTENT_WRITE_TOOL,
    description:
      'Change a time system: rename it, or change its units, subdivisions, format or per-unit lists ' +
      '(each list you pass replaces the old one; null removes it). Potentially destructive: dates ' +
      'already entered keep their unit values, so adding or removing units, or shrinking a unit, can ' +
      'leave timeline events and date fields invalid. Prefer renaming or reformatting a system that is in use.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectProperty,
        timeSystemId: { type: 'string', description: 'The time system id or name.' },
        name: { type: 'string', description: 'New name.' },
        ...definitionProperties,
      },
      required: ['project', 'timeSystemId'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_SCHEMAS],
  execute(ctx: McpContext, _db: unknown, args: Record<string, unknown>): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_SCHEMAS);
    if ('error' in result) return Promise.resolve(result.error);
    const project = result.project;

    return runLibraryTool('update_time_system', `${project.username}/${project.slug}`, () =>
      withLibraryDoc(ctx, project, 'timeSystems', (doc) => {
        const existing = resolveRow(
          readTimeSystems(doc),
          requiredString(args, 'timeSystemId'),
          KIND,
          LIST_TOOL
        );
        const updated = updatedSystem(existing, args);
        replaceRow(doc, 'timeSystems', updated);
        return textResult(`Updated time system "${updated.name}".`, {
          success: true,
          timeSystem: presentTimeSystem(updated),
        });
      })
    );
  },
});

// ============================================
// delete_time_system tool
// ============================================

registerTool({
  tool: {
    name: 'delete_time_system',
    title: 'Delete Time System',
    description:
      'Remove a time system from the project. Timeline events and dates that use it are kept but ' +
      'show as an unknown system until a system with the same id is installed again.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectProperty,
        timeSystemId: { type: 'string', description: 'The time system id or name.' },
      },
      required: ['project', 'timeSystemId'],
    },
    annotations: DESTRUCTIVE_TOOL,
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_SCHEMAS],
  execute(ctx: McpContext, _db: unknown, args: Record<string, unknown>): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_SCHEMAS);
    if ('error' in result) return Promise.resolve(result.error);
    const project = result.project;

    return runLibraryTool('delete_time_system', `${project.username}/${project.slug}`, () =>
      withLibraryDoc(ctx, project, 'timeSystems', (doc) => {
        const system = resolveRow(
          readTimeSystems(doc),
          requiredString(args, 'timeSystemId'),
          KIND,
          LIST_TOOL
        );
        deleteRow(doc, 'timeSystems', system.id);
        return textResult(`Deleted time system "${system.name}" (id ${system.id}).`, {
          success: true,
          deleted: system.id,
        });
      })
    );
  },
});
