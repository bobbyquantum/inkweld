import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type FalModelMetadata,
  findInputSchema,
  listFalModelCatalog,
  parseModelSchema,
} from '../src/services/fal-model-metadata.service';

/**
 * Fixtures are `GET https://api.fal.ai/v1/models?endpoint_id=<id>&expand=openapi-3.0`
 * responses (the `models[0]` entry), recorded 2026-10-15.
 */
function fixture(name: string): FalModelMetadata {
  const path = join(import.meta.dir, 'fixtures', 'fal-models', `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as FalModelMetadata;
}

function model(openapi: FalModelMetadata['openapi']): FalModelMetadata {
  return {
    endpoint_id: 'test/model',
    metadata: {
      display_name: 'Test Model',
      category: 'text-to-image',
      description: '',
      status: 'active',
    },
    openapi,
  };
}

describe('parseModelSchema with recorded Fal.ai schemas', () => {
  it('Nano Banana 2.1: aspect_ratio from anyOf, resolution 1K/2K/4K', () => {
    const info = parseModelSchema(fixture('google_nano-banana-2.1'));

    expect(info.name).toBe('Nano Banana 2.1');
    expect(info.sizeMode).toBe('aspect_ratio');
    expect(info.usesAspectRatioOnly).toBe(true);
    expect(info.supportsCustomResolutions).toBe(false);
    expect(info.supportedAspectRatios).not.toContain('auto');
    expect(info.supportedAspectRatios).toContain('21:9');
    expect(info.supportedAspectRatios).toContain('8:1');
    expect(info.supportedResolutions).toEqual(['1K', '2K', '4K']);
    expect(info.supportedSizes).toContain('16:9@4K');
    expect(info.supportedSizes).toContain('1:1@1K');
    expect(info.supportedSizes).toHaveLength(info.supportedAspectRatios.length * 3);
    expect(info.supportedSizes.some((s) => s.startsWith('auto'))).toBe(false);
    // Schema default ratio is "auto", so fall back to square at the default resolution.
    expect(info.defaultSize).toBe('1:1@1K');
  });

  it('GPT Image 2: image_size anyOf ($ref ImageSize | preset enum) means custom dimensions', () => {
    const info = parseModelSchema(fixture('openai_gpt-image-2'));

    expect(info.sizeMode).toBe('dimensions');
    expect(info.usesAspectRatioOnly).toBe(false);
    expect(info.supportsCustomResolutions).toBe(true);
    expect(info.supportedSizes).toContain('1024x1024');
    // GPT Image 2 only accepts multiples of 16.
    for (const size of info.supportedSizes) {
      const [w, h] = size.split('x').map(Number);
      expect(w % 16).toBe(0);
      expect(h % 16).toBe(0);
    }
    expect(info.defaultSize).toBe('1024x1024');
  });

  it('Flux 3: aspect_ratio enum with non-K resolutions', () => {
    const info = parseModelSchema(fixture('blackforestlabs_flux-3_text-to-image'));

    expect(info.sizeMode).toBe('aspect_ratio');
    expect(info.supportedResolutions).toEqual(['512sq', '768sq', '1k', '2k', '4k']);
    expect(info.supportedSizes).toContain('1:1@512sq');
    expect(info.supportedSizes).toContain('16:9@4k');
    expect(info.supportedSizes).not.toContain('auto@1k');
    expect(info.defaultSize).toBe('1:1@1k');
  });

  it('Krea 2 Large: aspect_ratio only, no resolution input', () => {
    const info = parseModelSchema(fixture('krea_v2_large_text-to-image'));

    expect(info.sizeMode).toBe('aspect_ratio');
    expect(info.usesAspectRatioOnly).toBe(true);
    expect(info.supportedResolutions).toEqual([]);
    expect(info.supportedSizes).toEqual([
      '1:1',
      '4:3',
      '3:2',
      '16:9',
      '2.35:1',
      '4:5',
      '2:3',
      '9:16',
    ]);
    expect(info.supportedSizes.some((s) => s.includes('@'))).toBe(false);
    expect(info.defaultSize).toBe('1:1');
  });

  it('FLUX 2 Pro: image_size within the x-fal limits', () => {
    const info = parseModelSchema(fixture('fal-ai_flux-2-pro'));

    expect(info.sizeMode).toBe('dimensions');
    expect(info.supportsCustomResolutions).toBe(true);
    expect(info.supportedSizes).toContain('1024x1024');
    expect(info.supportedSizes).toContain('1600x2560');
    for (const size of info.supportedSizes) {
      const [w, h] = size.split('x').map(Number);
      expect(w).toBeLessThanOrEqual(2560);
      expect(h).toBeLessThanOrEqual(2560);
      expect(w * h).toBeLessThanOrEqual(4194304);
    }
  });
});

describe('findInputSchema', () => {
  it('reads the submit endpoint request body, not a fixed schema name', () => {
    const schema = findInputSchema(fixture('google_nano-banana-2.1'));
    expect(schema?.properties?.['aspect_ratio']).toBeDefined();
    expect(schema?.properties?.['prompt']).toBeDefined();
  });

  it('ignores the queue endpoints', () => {
    const schema = findInputSchema(
      model({
        paths: {
          '/test/model/requests/{request_id}/cancel': {
            post: {
              requestBody: {
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/Cancel' } },
                },
              },
            },
          },
          '/test/model': {
            post: {
              requestBody: {
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/RealInput' } },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            Cancel: { properties: { reason: { type: 'string' } } },
            RealInput: { properties: { aspect_ratio: { enum: ['1:1'] } } },
          },
        },
      })
    );
    expect(Object.keys(schema?.properties ?? {})).toEqual(['aspect_ratio']);
  });

  it('falls back to a schema named Input', () => {
    const schema = findInputSchema(
      model({ components: { schemas: { Input: { properties: { prompt: { type: 'string' } } } } } })
    );
    expect(schema?.properties?.['prompt']).toBeDefined();
  });

  it('falls back to any schema whose name ends in Input', () => {
    const schema = findInputSchema(
      model({
        components: {
          schemas: {
            SomethingOutput: { properties: { images: { type: 'array' } } },
            SomethingInput: { properties: { image_size: { type: 'object' } } },
          },
        },
      })
    );
    expect(schema?.properties?.['image_size']).toBeDefined();
  });
});

describe('parseModelSchema edge cases', () => {
  it('expands enumerated width/height options', () => {
    const info = parseModelSchema(
      model({
        components: {
          schemas: {
            Input: {
              properties: {
                image_size: {
                  oneOf: [
                    {
                      properties: {
                        width: { enum: [512, 1024] },
                        height: { enum: [1024] },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      })
    );
    expect(info.supportsCustomResolutions).toBe(false);
    expect(info.supportedSizes).toEqual(['512x1024', '1024x1024']);
  });

  it('uses default ratios for a free-form aspect_ratio string', () => {
    const info = parseModelSchema(
      model({
        components: { schemas: { Input: { properties: { aspect_ratio: { type: 'string' } } } } },
      })
    );
    expect(info.supportedAspectRatios).toContain('16:9');
    expect(info.supportedSizes).toContain('1:1');
    expect(info.defaultSize).toBe('1:1');
  });

  it('reports unknown when the schema has no size input', () => {
    const info = parseModelSchema(
      model({ components: { schemas: { Input: { properties: { prompt: { type: 'string' } } } } } })
    );
    expect(info.sizeMode).toBe('unknown');
    expect(info.supportedSizes).toEqual([]);
    expect(info.defaultSize).toBeUndefined();
  });

  it('detects image input fields', () => {
    const info = parseModelSchema(
      model({
        components: {
          schemas: { Input: { properties: { image_urls: { type: 'array' } } } },
        },
      })
    );
    expect(info.supportsImageInput).toBe(true);
  });
});

describe('listFalModelCatalog', () => {
  const page = (ids: string[], next: string | null) =>
    new Response(
      JSON.stringify({
        models: ids.map((id) => ({
          endpoint_id: id,
          metadata: {
            display_name: id,
            category: 'text-to-image',
            description: '',
            status: 'active',
          },
        })),
        has_more: next !== null,
        next_cursor: next,
      })
    );

  let fetchSpy: ReturnType<typeof spyOn>;
  afterEach(() => fetchSpy.mockRestore());

  it('follows the cursor and keeps Fal order', async () => {
    const urls: string[] = [];
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      urls.push(url);
      return new URL(url).searchParams.get('cursor')
        ? page(['z/second-page'], null)
        : page(['google/nano-banana-2.1', 'a/alphabetically-first'], 'Mg');
    });

    const result = await listFalModelCatalog({ category: 'text-to-image', q: 'banana' });

    expect(result.complete).toBe(true);
    expect(result.models.map((m) => m.endpoint_id)).toEqual([
      'google/nano-banana-2.1',
      'a/alphabetically-first',
      'z/second-page',
    ]);
    const first = new URL(urls[0]).searchParams;
    expect(first.get('status')).toBe('active');
    expect(first.get('q')).toBe('banana');
    expect(first.get('limit')).toBe('100');
    expect(new URL(urls[1]).searchParams.get('cursor')).toBe('Mg');
  });

  it('stops after ten pages', async () => {
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async () => page(['x/model'], 'more'));
    const result = await listFalModelCatalog({ category: 'text-to-image' });
    expect(fetchSpy).toHaveBeenCalledTimes(10);
    expect(result.models).toHaveLength(10);
  });

  it('returns the pages it read when a later page fails', async () => {
    let calls = 0;
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async () =>
      ++calls === 1 ? page(['a/model'], 'Mg') : new Response('slow down', { status: 429 })
    );
    const result = await listFalModelCatalog({ category: 'text-to-image' });
    expect(result).toMatchObject({ complete: false });
    expect(result.models.map((m) => m.endpoint_id)).toEqual(['a/model']);
  });

  it('throws when the first page fails', async () => {
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('nope', { status: 500, statusText: 'Server Error' })
    );
    await expect(listFalModelCatalog({ category: 'text-to-image' })).rejects.toThrow('500');
  });
});
