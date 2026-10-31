/**
 * What an agent may write on a canvas, field by field. Agents do not always
 * respect a tool's schema, and everything here ends up in a shared document
 * and in exported SVG, so nothing is written without passing these checks.
 */

import type { CanvasObjectType } from './model';

/** A problem with an agent's input. The message goes back to the agent. */
export class CanvasInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanvasInputError';
  }
}

export function fail(message: string): never {
  throw new CanvasInputError(message);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Throws a {@link CanvasInputError} naming `label` when the value is unusable. */
export type FieldCheck = (value: unknown, label: string) => void;

export const MAX_COORDINATE = 10_000_000;
export const MAX_SIZE = 1_000_000;
export const MAX_POINTS = 20_000;
export const MAX_TEXT_LENGTH = 20_000;
export const MAX_INLINE_IMAGE_LENGTH = 256 * 1024;

const number =
  (min: number, max: number): FieldCheck =>
  (value, label) => {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < min ||
      value > max
    ) {
      fail(`${label} must be a number from ${min} to ${max}`);
    }
  };

const positive =
  (max: number): FieldCheck =>
  (value, label) => {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value > max
    ) {
      fail(`${label} must be a number above 0 and at most ${max}`);
    }
  };

const boolean: FieldCheck = (value, label) => {
  if (typeof value !== 'boolean') fail(`${label} must be true or false`);
};

const text =
  (maxLength: number, minLength = 0): FieldCheck =>
  (value, label) => {
    if (
      typeof value !== 'string' ||
      value.length < minLength ||
      value.length > maxLength
    ) {
      fail(
        minLength > 0
          ? `${label} must be a non-empty string of at most ${maxLength} characters`
          : `${label} must be a string of at most ${maxLength} characters`,
      );
    }
  };

const choice =
  (options: readonly string[]): FieldCheck =>
  (value, label) => {
    if (typeof value !== 'string' || !options.includes(value)) {
      fail(`${label} must be one of: ${options.join(', ')}`);
    }
  };

/**
 * A CSS colour or gradient. Quotes and angle brackets would break out of the
 * attribute in exported SVG, and `url()` would load something from elsewhere.
 */
const PAINT = /^[#\w(),.%\s/-]+$/;

const paint =
  (maxLength: number): FieldCheck =>
  (value, label) => {
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      value.length > maxLength ||
      !PAINT.test(value) ||
      /url\s*\(/i.test(value)
    ) {
      fail(
        `${label} must be a CSS colour such as #336699 or rgb(51, 102, 153)`,
      );
    }
  };

const color = paint(100);
const fill = paint(1000);

const fontFamily: FieldCheck = (value, label) => {
  if (typeof value !== 'string' || !/^[\w\s,'-]{1,200}$/.test(value)) {
    fail(`${label} must be a font name such as Georgia`);
  }
};

const iconName: FieldCheck = (value, label) => {
  if (typeof value !== 'string' || !/^[a-z\d_]{1,64}$/.test(value)) {
    fail(`${label} must be a Material icon name such as place`);
  }
};

const numberList = (
  value: unknown,
  label: string,
  range: { min?: number; max?: number } = {},
): void => {
  const { min = -MAX_COORDINATE, max = MAX_COORDINATE } = range;
  if (!Array.isArray(value)) fail(`${label} must be an array of numbers`);
  if (
    value.some(
      (n) => typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max,
    )
  ) {
    fail(`${label} must only hold numbers from ${min} to ${max}`);
  }
};

const points: FieldCheck = (value, label) => {
  numberList(value, label);
  const count = (value as number[]).length;
  if (count < 4 || count % 2 !== 0) {
    fail(`${label} must be flat [x1, y1, x2, y2, …] with at least two points`);
  }
  if (count > MAX_POINTS * 2) {
    fail(`${label} has more than ${MAX_POINTS} points`);
  }
};

const pressures: FieldCheck = (value, label) => {
  numberList(value, label, { min: 0, max: 1 });
};

const dash: FieldCheck = (value, label) => {
  numberList(value, label, { min: 0, max: MAX_SIZE });
};

/**
 * Where an image may come from: project media, or a small inline image.
 * External URLs are refused: they taint the canvas (so exports and covers
 * fail), break when the site changes, and tell that site who is looking.
 */
const imageSource: FieldCheck = (value, label) => {
  if (typeof value !== 'string') fail(`${label} must be a string`);
  if (isMediaReference(value)) return;
  if (value.length <= MAX_INLINE_IMAGE_LENGTH && isInlineImage(value)) return;
  fail(
    `${label} must be project media such as media://picture.png, or a data: image of at most ${MAX_INLINE_IMAGE_LENGTH} characters with no quotes or angle brackets`,
  );
};

function isInlineImage(value: string): boolean {
  return /^data:image\/(png|jpeg|gif|webp|svg\+xml)(;base64)?,[^"<>\s]*$/.test(
    value,
  );
}

/** `media://name.ext` (agents, the Media tab) or `media:id` (older placements). */
export function isMediaReference(value: string): boolean {
  return /^media:(\/\/)?[\w.\- ()[\]]+$/.test(value) && !value.includes('..');
}

/** Numbers and flags every object has. */
const BASE_FIELDS: Record<string, FieldCheck> = {
  x: number(-MAX_COORDINATE, MAX_COORDINATE),
  y: number(-MAX_COORDINATE, MAX_COORDINATE),
  rotation: number(-MAX_SIZE, MAX_SIZE),
  scaleX: number(-1000, 1000),
  scaleY: number(-1000, 1000),
  visible: boolean,
  locked: boolean,
  name: text(200),
  opacity: number(0, 1),
};

const BASE_DEFAULTS = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  visible: true,
  locked: false,
};

const BASE_CLEARABLE = new Set(['name', 'opacity']);

/** Everything {@link planCanvasEdit} needs to know about one object type. */
export interface ObjectSpec {
  /** Accepted fields, besides `id`, `type` and `layerId`. */
  fields: Record<string, FieldCheck>;
  /** Fields a new object must provide. */
  required: readonly string[];
  /** Fields an update may remove by setting them to null. */
  clearable: readonly string[];
  /** Values a new object starts with. */
  defaults(inkColor: string): Record<string, unknown>;
  /** The field a new object is named after in the objects sidebar. */
  nameFrom?: string;
  /** Checks across fields, and values derived from them. */
  finish?(object: Record<string, unknown>, label: string): void;
}

function checkPressures(object: Record<string, unknown>, label: string): void {
  const list = object['pressures'] as number[] | undefined;
  const count = (object['points'] as number[] | undefined)?.length ?? 0;
  if (list && list.length !== count / 2) {
    fail(
      `${label}: pressures must have one value per point (${count / 2}); set pressures to null if the points changed`,
    );
  }
}

/** Fill in a shape's size from its points, and check it has a usable geometry. */
function finishShape(object: Record<string, unknown>, label: string): void {
  const list = object['points'] as number[] | undefined;
  if (
    list &&
    (object['width'] === undefined || object['height'] === undefined)
  ) {
    const xs = list.filter((_, i) => i % 2 === 0);
    const ys = list.filter((_, i) => i % 2 === 1);
    object['width'] ??= Math.max(...xs) - Math.min(...xs);
    object['height'] ??= Math.max(...ys) - Math.min(...ys);
  }

  const kind = object['shapeType'];
  if (kind === 'polygon' && (list?.length ?? 0) < 6) {
    fail(`${label}: a polygon needs points with at least three corners`);
  }
  // Drawn from these alone: points do not give a rectangle or ellipse its area.
  if (
    (kind === 'rect' || kind === 'ellipse') &&
    (!object['width'] || !object['height'])
  ) {
    fail(`${label}: a ${String(kind)} needs width and height`);
  }
  if (!object['width'] && !list) {
    fail(`${label}: a ${String(kind)} needs width and height, or points`);
  }
  object['width'] ??= 0;
  object['height'] ??= 0;
}

const stroke = { stroke: color, strokeWidth: number(0, 1000) };

const OBJECT_SPECS: Record<CanvasObjectType, ObjectSpec> = {
  image: {
    fields: {
      src: imageSource,
      width: positive(MAX_SIZE),
      height: positive(MAX_SIZE),
      isBackground: boolean,
    },
    required: ['src', 'width', 'height'],
    clearable: ['isBackground'],
    defaults: () => ({}),
  },
  text: {
    fields: {
      text: text(MAX_TEXT_LENGTH, 1),
      fontSize: positive(2000),
      fontFamily,
      fontStyle: choice(['normal', 'bold', 'italic', 'bold italic']),
      fill: color,
      width: number(0, MAX_SIZE),
      align: choice(['left', 'center', 'right']),
    },
    required: ['text'],
    clearable: [],
    defaults: (inkColor) => ({
      fontSize: 18,
      fontFamily: 'Arial',
      fontStyle: 'normal',
      fill: inkColor,
      width: 0,
      align: 'left',
    }),
    nameFrom: 'text',
  },
  path: {
    fields: {
      points,
      ...stroke,
      closed: boolean,
      fill,
      tension: number(0, 1),
      pressures,
    },
    required: ['points'],
    clearable: ['fill', 'pressures'],
    defaults: (inkColor) => ({
      stroke: inkColor,
      strokeWidth: 3,
      closed: false,
      tension: 0,
    }),
    finish: checkPressures,
  },
  shape: {
    fields: {
      shapeType: choice(['rect', 'ellipse', 'polygon', 'line', 'arrow']),
      width: number(0, MAX_SIZE),
      height: number(0, MAX_SIZE),
      points,
      fill,
      ...stroke,
      cornerRadius: number(0, MAX_SIZE),
      dash,
      linkedElementId: text(200, 1),
    },
    required: ['shapeType'],
    clearable: ['points', 'fill', 'cornerRadius', 'dash', 'linkedElementId'],
    defaults: (inkColor) => ({ stroke: inkColor, strokeWidth: 3 }),
    finish: finishShape,
  },
  pin: {
    fields: {
      label: text(200, 1),
      icon: iconName,
      color,
      linkedElementId: text(200, 1),
      note: text(5000),
    },
    required: ['label'],
    clearable: ['linkedElementId', 'note'],
    defaults: () => ({ icon: 'place', color: '#E53935' }),
    nameFrom: 'label',
  },
};

export const OBJECT_TYPES = Object.keys(OBJECT_SPECS) as CanvasObjectType[];

export function objectSpec(type: unknown, label: string): ObjectSpec {
  if (typeof type !== 'string' || !(OBJECT_TYPES as string[]).includes(type)) {
    fail(`${label}.type must be one of: ${OBJECT_TYPES.join(', ')}`);
  }
  return OBJECT_SPECS[type as CanvasObjectType];
}

/** The check for one field of an object, or a failure naming the valid ones. */
export function fieldCheck(
  spec: ObjectSpec,
  key: string,
  label: string,
): FieldCheck {
  const check = spec.fields[key] ?? BASE_FIELDS[key];
  if (check) return check;
  const valid = [
    'id',
    'layerId',
    ...Object.keys(BASE_FIELDS),
    ...Object.keys(spec.fields),
  ];
  return fail(
    `${label}.${key} is not a field here. Valid: ${valid.join(', ')}`,
  );
}

export function isClearable(spec: ObjectSpec, key: string): boolean {
  return spec.clearable.includes(key) || BASE_CLEARABLE.has(key);
}

export function baseDefaults(): Record<string, unknown> {
  return { ...BASE_DEFAULTS };
}

/** Ids an agent may choose. Generated ids (nanoid) fit this as well. */
export function checkId(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== 'string' || !/^[\w-]{1,64}$/.test(value)) {
    fail(`${label} must be 1 to 64 letters, digits, "_" or "-"`);
  }
}

export const checkLayerFields: Record<string, FieldCheck> = {
  name: text(200, 1),
  visible: boolean,
  locked: boolean,
  opacity: number(0, 1),
};

export const checkFrameFields: Record<string, FieldCheck> = {
  name: text(200, 1),
  kind: choice(['canvas', 'crop']),
  x: number(-MAX_COORDINATE, MAX_COORDINATE),
  y: number(-MAX_COORDINATE, MAX_COORDINATE),
  width: positive(MAX_SIZE),
  height: positive(MAX_SIZE),
  visible: boolean,
};

export const checkColor = color;
