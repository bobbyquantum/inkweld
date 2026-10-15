/**
 * Fal.ai Model Metadata Service
 *
 * Fetches model metadata from the Fal.ai Platform API, including:
 * - Model listings with categories (text-to-image, image-to-image, etc.)
 * - OpenAPI schemas for supported input parameters (sizes, aspect ratios, etc.)
 *
 * API Documentation: https://docs.fal.ai/platform-apis/v1/models
 */

import { forEachPage } from '@inkweld/async';

const FAL_MODELS_API = 'https://api.fal.ai/v1/models';

/**
 * Model metadata from Fal.ai API
 */
export interface FalModelMetadata {
  endpoint_id: string;
  metadata: {
    display_name: string;
    category: string;
    description: string;
    status: 'active' | 'deprecated';
    tags?: string[];
    updated_at?: string;
    thumbnail_url?: string;
  };
  openapi?: OpenAPISchema;
}

/**
 * Simplified OpenAPI 3.0 schema structure
 */
interface OpenAPISchema {
  openapi?: string;
  info?: {
    title?: string;
    description?: string;
    version?: string;
  };
  paths?: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, SchemaObject>;
  };
}

interface PathItem {
  post?: {
    requestBody?: {
      content?: {
        'application/json'?: {
          schema?: SchemaObject;
        };
      };
    };
  };
}

interface SchemaObject {
  type?: string;
  properties?: Record<string, PropertySchema>;
  required?: string[];
  allOf?: SchemaObject[];
  $ref?: string;
}

/** Fal's size constraints on an `image_size` property (`x-fal`). */
interface FalSizeConstraints {
  max_area?: number;
  multiple_of?: number;
  min_width?: number;
  min_height?: number;
  max_width?: number;
  max_height?: number;
}

export interface PropertySchema {
  type?: string;
  description?: string;
  default?: unknown;
  enum?: (string | number)[];
  minimum?: number;
  maximum?: number;
  items?: PropertySchema;
  properties?: Record<string, PropertySchema>;
  $ref?: string;
  oneOf?: PropertySchema[];
  anyOf?: PropertySchema[];
  allOf?: PropertySchema[];
  'x-fal'?: FalSizeConstraints;
}

/**
 * Parsed model info with extracted size/resolution support
 */
export interface ParsedFalModelInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  status: 'active' | 'deprecated';
  supportsImageInput: boolean;
  supportsCustomResolutions: boolean;
  supportedSizes: string[];
  supportedAspectRatios: string[];
  supportedResolutions: string[];
  sizeMode: 'dimensions' | 'aspect_ratio' | 'unknown';
  /** True when the model takes an aspect ratio instead of pixel dimensions. */
  usesAspectRatioOnly: boolean;
  /** Suggested default size, one of `supportedSizes` (undefined when there are none). */
  defaultSize?: string;
}

/**
 * Fal.ai Models API response
 */
interface FalModelsResponse {
  models: FalModelMetadata[];
  has_more: boolean;
  next_cursor: string | null;
}

/**
 * Fetch models from Fal.ai API
 */
export async function fetchFalModels(options: {
  apiKey?: string;
  category?: string;
  endpointId?: string | string[];
  expand?: 'openapi-3.0'[];
  limit?: number;
  cursor?: string;
  status?: 'active' | 'deprecated';
  q?: string;
}): Promise<FalModelsResponse> {
  const params = new URLSearchParams();

  if (options.category) {
    params.set('category', options.category);
  }
  if (options.status) {
    params.set('status', options.status);
  }
  if (options.q) {
    params.set('q', options.q);
  }
  if (options.limit) {
    params.set('limit', options.limit.toString());
  }
  if (options.cursor) {
    params.set('cursor', options.cursor);
  }
  if (options.expand) {
    for (const exp of options.expand) {
      params.append('expand', exp);
    }
  }
  if (options.endpointId) {
    const ids = Array.isArray(options.endpointId) ? options.endpointId : [options.endpointId];
    for (const id of ids) {
      params.append('endpoint_id', id);
    }
  }

  const url = `${FAL_MODELS_API}?${params.toString()}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.apiKey) {
    headers['Authorization'] = `Key ${options.apiKey}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Fal.ai API error: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as FalModelsResponse;
}

/**
 * Fetch a single model with its OpenAPI schema
 */
export async function fetchFalModelWithSchema(
  endpointId: string,
  apiKey?: string
): Promise<FalModelMetadata | null> {
  const response = await fetchFalModels({
    apiKey,
    endpointId,
    expand: ['openapi-3.0'],
    limit: 1,
  });

  return response.models[0] ?? null;
}

/**
 * Parse OpenAPI schema to extract size/resolution info
 */
export function parseModelSchema(model: FalModelMetadata): ParsedFalModelInfo {
  const info: ParsedFalModelInfo = {
    id: model.endpoint_id,
    name: model.metadata.display_name,
    description: model.metadata.description,
    category: model.metadata.category,
    status: model.metadata.status,
    supportsImageInput: model.metadata.category === 'image-to-image',
    supportsCustomResolutions: false,
    supportedSizes: [],
    supportedAspectRatios: [],
    supportedResolutions: [],
    sizeMode: 'unknown',
    usesAspectRatioOnly: false,
  };

  const schemas = model.openapi?.components?.schemas ?? {};
  const inputSchema = findInputSchema(model);
  if (!inputSchema?.properties) return info;
  const props = inputSchema.properties;

  if (props['aspect_ratio']) {
    parseAspectRatioProperty(info, schemas, props['aspect_ratio'], props['resolution']);
  } else if (props['image_size']) {
    parseImageSizeProperty(info, schemas, props['image_size']);
  }

  if (props['image'] || props['image_url'] || props['image_urls']) {
    info.supportsImageInput = true;
  }

  return info;
}

/**
 * The model's request-body schema. Fal names it after the model
 * (`NanoBanana21Input`, `Flux3ImageInput`, ...), so it is read from the
 * submit endpoint's POST body rather than looked up by a fixed name.
 */
export function findInputSchema(model: FalModelMetadata): SchemaObject | null {
  const openapi = model.openapi;
  const schemas = openapi?.components?.schemas ?? {};

  // The submit endpoint is the only POST path that isn't a queue
  // operation (`/requests/{request_id}/cancel`, ...).
  const submit = Object.entries(openapi?.paths ?? {}).find(
    ([path, item]) => item.post?.requestBody && !path.includes('/requests/')
  );
  const bodySchema = submit?.[1].post?.requestBody?.content?.['application/json']?.schema;
  const resolved = resolveSchema(schemas, bodySchema);
  if (resolved?.properties) return resolved;

  for (const name of ['Input', 'TextToImageInput', 'ImageToImageInput']) {
    if (schemas[name]) return schemas[name];
  }
  const inputName = Object.keys(schemas).find((name) => name.endsWith('Input'));
  return inputName ? schemas[inputName] : null;
}

/** Follow a local `#/components/schemas/<name>` reference. */
function resolveSchema<T extends { $ref?: string }>(
  schemas: Record<string, SchemaObject>,
  schema: T | undefined
): T | SchemaObject | undefined {
  if (!schema?.$ref) return schema;
  const name = /^#\/components\/schemas\/(.+)$/.exec(schema.$ref)?.[1];
  return name ? schemas[name] : undefined;
}

/**
 * Every enum value a property allows, including those on `anyOf` / `oneOf` /
 * `allOf` members (Fal writes optional enums as `anyOf: [{enum}, {type: 'null'}]`).
 */
function collectEnumValues(
  schemas: Record<string, SchemaObject>,
  prop: PropertySchema | undefined
): string[] {
  const values = new Set<string>();
  const visit = (schema: PropertySchema | undefined, depth: number): void => {
    if (!schema || depth > 4) return;
    const resolved = resolveSchema(schemas, schema) as PropertySchema | undefined;
    if (!resolved) return;
    for (const value of resolved.enum ?? []) values.add(String(value));
    for (const member of [
      ...(resolved.anyOf ?? []),
      ...(resolved.oneOf ?? []),
      ...(resolved.allOf ?? []),
    ]) {
      visit(member, depth + 1);
    }
  };
  visit(prop, 0);
  return Array.from(values);
}

/**
 * Pixel sizes offered for models that take any `{ width, height }`. All are
 * multiples of 16 (GPT Image 2 rejects anything else) and at most 2560px.
 */
export const DEFAULT_CUSTOM_DIMENSION_SIZES = [
  '1024x1024', // 1:1
  '1536x1024', // 3:2
  '1024x1536', // 2:3
  '1344x768', // ~16:9
  '768x1344', // ~9:16
  '1920x1088', // HD landscape
  '1088x1920', // HD portrait
  '1600x2560', // Ebook cover
];

/** Aspect ratios assumed when a model takes a free-form aspect_ratio string. */
const DEFAULT_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];

/** Values that ask the model to choose; they never become a stored size. */
const MODEL_CHOSEN_VALUES = new Set(['auto']);

function parseImageSizeProperty(
  info: ParsedFalModelInfo,
  schemas: Record<string, SchemaObject>,
  prop: PropertySchema
): void {
  info.sizeMode = 'dimensions';

  const options = (prop.oneOf || prop.anyOf || []).map(
    (option) => (resolveSchema(schemas, option) as PropertySchema | undefined) ?? option
  );
  info.supportedSizes = expandDimensionOptions(options);

  if (info.supportedSizes.length === 0) {
    info.supportsCustomResolutions = true;
    info.supportedSizes = DEFAULT_CUSTOM_DIMENSION_SIZES.filter((size) =>
      fitsSizeConstraints(size, prop['x-fal'])
    );
  }
  info.defaultSize = info.supportedSizes.includes('1024x1024')
    ? '1024x1024'
    : info.supportedSizes[0];
}

function fitsSizeConstraints(size: string, limits?: FalSizeConstraints): boolean {
  if (!limits) return true;
  const [width, height] = size.split('x').map(Number);
  const multiple = limits.multiple_of;
  return !(
    (limits.min_width && width < limits.min_width) ||
    (limits.min_height && height < limits.min_height) ||
    (limits.max_width && width > limits.max_width) ||
    (limits.max_height && height > limits.max_height) ||
    (limits.max_area && width * height > limits.max_area) ||
    (multiple && (width % multiple !== 0 || height % multiple !== 0))
  );
}

export function expandDimensionOptions(options?: PropertySchema[]): string[] {
  if (!options) return [];

  const sizes: Set<string> = new Set();
  for (const option of options) {
    const widths = option.properties?.width?.enum;
    const heights = option.properties?.height?.enum;
    if (!widths || !heights) continue;

    for (const width of widths) {
      for (const height of heights) {
        sizes.add(`${width}x${height}`);
      }
    }
  }

  return Array.from(sizes);
}

/**
 * Aspect-ratio models list every ratio × resolution pair as a
 * `ratio@resolution` size (`16:9@2K`, `1:1@512sq`), or the bare ratio when
 * the model has no `resolution` input (Krea 2), so a request only sends
 * `resolution` to models that accept it.
 */
function parseAspectRatioProperty(
  info: ParsedFalModelInfo,
  schemas: Record<string, SchemaObject>,
  ratioProp: PropertySchema,
  resolutionProp: PropertySchema | undefined
): void {
  info.sizeMode = 'aspect_ratio';
  info.usesAspectRatioOnly = true;

  const ratios = collectEnumValues(schemas, ratioProp).filter((r) => !MODEL_CHOSEN_VALUES.has(r));
  info.supportedAspectRatios = ratios.length > 0 ? ratios : [...DEFAULT_ASPECT_RATIOS];
  info.supportedResolutions = collectEnumValues(schemas, resolutionProp).filter(
    (r) => !MODEL_CHOSEN_VALUES.has(r)
  );

  const resolutions = info.supportedResolutions;
  info.supportedSizes =
    resolutions.length > 0
      ? info.supportedAspectRatios.flatMap((ratio) => resolutions.map((res) => `${ratio}@${res}`))
      : [...info.supportedAspectRatios];

  const defaultRatio = pickDefault(info.supportedAspectRatios, ratioProp.default, '1:1');
  const defaultResolution = pickDefault(resolutions, resolutionProp?.default);
  info.defaultSize = defaultResolution ? `${defaultRatio}@${defaultResolution}` : defaultRatio;
}

/** The schema's default when it is one of `values`, else `preferred`, else the first value. */
function pickDefault(
  values: string[],
  schemaDefault: unknown,
  preferred?: string
): string | undefined {
  if (typeof schemaDefault === 'string' && values.includes(schemaDefault)) return schemaDefault;
  if (preferred && values.includes(preferred)) return preferred;
  return values[0];
}

/**
 * Get parsed model info for a Fal.ai model
 */
export async function getFalModelInfo(
  endpointId: string,
  apiKey?: string
): Promise<ParsedFalModelInfo | null> {
  const model = await fetchFalModelWithSchema(endpointId, apiKey);
  if (!model) return null;
  return parseModelSchema(model);
}

/** Page size and page cap for {@link listFalModelCatalog}. */
const CATALOG_PAGE_SIZE = 100;
const CATALOG_MAX_PAGES = 10;

/**
 * List the active models in a category without their schemas, in Fal's own
 * order (most-used first, so a newly released model is near the top),
 * following the cursor for up to {@link CATALOG_MAX_PAGES} pages.
 *
 * Throws when the first page fails. A later page failing (usually a rate
 * limit) returns what was read so far with `complete: false`.
 */
export async function listFalModelCatalog(options: {
  category: string;
  q?: string;
  apiKey?: string;
}): Promise<{ models: FalModelMetadata[]; complete: boolean }> {
  const models: FalModelMetadata[] = [];
  let pages = 0;
  try {
    // Each page needs the previous page's cursor, so pages load one at a time.
    await forEachPage(
      async (cursor: string | undefined) => {
        const response = await fetchFalModels({
          apiKey: options.apiKey,
          category: options.category,
          q: options.q,
          status: 'active',
          limit: CATALOG_PAGE_SIZE,
          cursor,
        });
        pages++;
        const more = response.has_more && response.next_cursor && pages < CATALOG_MAX_PAGES;
        return {
          page: response.models,
          next: more ? (response.next_cursor ?? undefined) : undefined,
        };
      },
      (page) => {
        models.push(...page);
      }
    );
  } catch (error) {
    if (models.length === 0) throw error;
    return { models, complete: false };
  }
  return { models, complete: true };
}

/** List every Fal.ai model in one category, following the page cursor. */
async function listFalModelsInCategory(
  category: 'text-to-image' | 'image-to-image',
  apiKey?: string
): Promise<ParsedFalModelInfo[]> {
  const models: ParsedFalModelInfo[] = [];

  // Each page needs the previous page's cursor, so pages load one at a time.
  await forEachPage(
    async (cursor: string | undefined) => {
      const response = await fetchFalModels({
        apiKey,
        category,
        expand: ['openapi-3.0'],
        limit: 50,
        cursor,
      });
      return { page: response.models, next: response.next_cursor ?? undefined };
    },
    (page) => {
      for (const model of page) {
        models.push(parseModelSchema(model));
      }
    }
  );

  return models;
}

/**
 * List all text-to-image models from Fal.ai
 */
export function listFalTextToImageModels(apiKey?: string): Promise<ParsedFalModelInfo[]> {
  return listFalModelsInCategory('text-to-image', apiKey);
}

/**
 * List all image-to-image models from Fal.ai
 */
export function listFalImageToImageModels(apiKey?: string): Promise<ParsedFalModelInfo[]> {
  return listFalModelsInCategory('image-to-image', apiKey);
}
