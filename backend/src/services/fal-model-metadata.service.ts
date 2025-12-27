/**
 * Fal.ai Model Metadata Service
 *
 * Fetches model metadata from the Fal.ai Platform API, including:
 * - Model listings with categories (text-to-image, image-to-image, etc.)
 * - OpenAPI schemas for supported input parameters (sizes, aspect ratios, etc.)
 *
 * API Documentation: https://docs.fal.ai/platform-apis/v1/models
 */

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

interface PropertySchema {
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
}): Promise<FalModelsResponse> {
  const params = new URLSearchParams();

  if (options.category) {
    params.set('category', options.category);
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
  };

  if (!model.openapi?.components?.schemas) {
    return info;
  }

  // Find the Input schema
  const schemas = model.openapi.components.schemas;
  const inputSchema =
    schemas['Input'] || schemas['TextToImageInput'] || schemas['ImageToImageInput'];

  if (!inputSchema?.properties) {
    return info;
  }

  // Check for image_size property (dimensions mode)
  const imageSizeProp = inputSchema.properties['image_size'];
  if (imageSizeProp) {
    info.sizeMode = 'dimensions';

    // Check if it's an enum with specific sizes or allows arbitrary values
    if (imageSizeProp.oneOf || imageSizeProp.anyOf) {
      // Has specific allowed values
      const options = imageSizeProp.oneOf || imageSizeProp.anyOf || [];
      for (const opt of options) {
        if (opt.properties?.width && opt.properties?.height) {
          // It's an object with width/height - check for enum values
          const widthEnum = opt.properties.width.enum;
          const heightEnum = opt.properties.height.enum;
          if (widthEnum && heightEnum) {
            // Combine width/height enums into size strings
            for (const w of widthEnum) {
              for (const h of heightEnum) {
                info.supportedSizes.push(`${w}x${h}`);
              }
            }
          }
        }
      }
    }

    // If no enum restrictions found, it likely supports custom resolutions
    if (info.supportedSizes.length === 0) {
      info.supportsCustomResolutions = true;
      // Add some default presets
      info.supportedSizes = ['1024x1024', '1920x1080', '1080x1920', '1344x768', '768x1344'];
    }
  }

  // Check for aspect_ratio property (aspect ratio mode)
  const aspectRatioProp = inputSchema.properties['aspect_ratio'];
  if (aspectRatioProp) {
    info.sizeMode = 'aspect_ratio';

    if (aspectRatioProp.enum) {
      info.supportedAspectRatios = aspectRatioProp.enum as string[];
    }
  }

  // Check for resolution property
  const resolutionProp = inputSchema.properties['resolution'];
  if (resolutionProp?.enum) {
    info.supportedResolutions = resolutionProp.enum as string[];
  }

  // Check for image input properties
  if (inputSchema.properties['image'] || inputSchema.properties['image_url']) {
    info.supportsImageInput = true;
  }

  return info;
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

/**
 * List all text-to-image models from Fal.ai
 */
export async function listFalTextToImageModels(apiKey?: string): Promise<ParsedFalModelInfo[]> {
  const models: ParsedFalModelInfo[] = [];
  let cursor: string | undefined;

  do {
    const response = await fetchFalModels({
      apiKey,
      category: 'text-to-image',
      expand: ['openapi-3.0'],
      limit: 50,
      cursor,
    });

    for (const model of response.models) {
      models.push(parseModelSchema(model));
    }

    cursor = response.next_cursor ?? undefined;
  } while (cursor);

  return models;
}

/**
 * List all image-to-image models from Fal.ai
 */
export async function listFalImageToImageModels(apiKey?: string): Promise<ParsedFalModelInfo[]> {
  const models: ParsedFalModelInfo[] = [];
  let cursor: string | undefined;

  do {
    const response = await fetchFalModels({
      apiKey,
      category: 'image-to-image',
      expand: ['openapi-3.0'],
      limit: 50,
      cursor,
    });

    for (const model of response.models) {
      models.push(parseModelSchema(model));
    }

    cursor = response.next_cursor ?? undefined;
  } while (cursor);

  return models;
}
