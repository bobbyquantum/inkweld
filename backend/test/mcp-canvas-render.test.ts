/**
 * `render_canvas` and `save_canvas_image`, drawing for real with the rasteriser
 * and the bundled fonts. The image's pixels are read back with sharp, because
 * "it returned a PNG" would pass for a blank page.
 */
import { describe, it, expect, beforeAll, afterEach, spyOn } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CANVAS_BUNDLED_FONTS,
  writeCanvasEdit,
  type CanvasEdit,
  type CanvasObject,
  type CanvasText,
} from '@inkweld/canvas';
import sharp from 'sharp';
import * as Y from 'yjs';
import '../src/mcp';
import { QuotaExceededError } from '../src/errors';
import { handleMcpRequest } from '../src/mcp/mcp.handler';
import { MCP_PROTOCOL_VERSION, META_KEYS } from '../src/mcp/mcp.types';
import { MCP_PERMISSIONS } from '../src/mcp/mcp-permissions';
import { registerCanvasRenderAssets } from '../src/services/canvas-render/assets';
import { fileCanvasRenderAssets } from '../src/services/canvas-render/assets.file';
import { CanvasFontSet, readFontPack } from '../src/services/canvas-render/font-set';
import {
  MAX_RENDER_IMAGE_BYTES,
  MAX_RENDER_TOTAL_IMAGE_BYTES,
} from '../src/services/canvas-render/images';
import { parseFontMetrics, readFontFamily } from '../src/services/canvas-render/ttf';
import { FileStorageService } from '../src/services/file-storage.service';
import { projectService } from '../src/services/project.service';
import { quotaService } from '../src/services/quota.service';
import { yjsService } from '../src/services/yjs.service';
import { mapWithConcurrency } from '../src/utils/concurrency';

const READ = [MCP_PERMISSIONS.READ_ELEMENTS];
const WRITE = [MCP_PERMISSIONS.READ_ELEMENTS, MCP_PERMISSIONS.WRITE_ELEMENTS];

interface ToolJson {
  result?: {
    tools?: { name: string }[];
    content?: { type: string; text?: string; data?: string; mimeType?: string }[];
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  };
  error?: { message: string };
}

async function rpc(
  method: string,
  params: Record<string, unknown>,
  permissions: string[] = READ
): Promise<ToolJson> {
  const mcpContext = {
    type: 'oauth',
    userId: 'u1',
    username: 'alice',
    grants: [
      { projectId: 'id-novel', username: 'alice', slug: 'novel', role: 'editor', permissions },
    ],
  };
  const body = {
    jsonrpc: '2.0',
    method,
    id: 1,
    params: {
      ...params,
      _meta: {
        [META_KEYS.protocolVersion]: MCP_PROTOCOL_VERSION,
        [META_KEYS.clientInfo]: { name: 'test', version: '1.0.0' },
        [META_KEYS.clientCapabilities]: {},
      },
    },
  };
  const c = {
    req: { header: () => undefined, json: async () => body },
    get: (key: string) => (key === 'mcpContext' ? mcpContext : {}),
    json: (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status }),
  };
  const res = await handleMcpRequest(c as never);
  return (await res.json()) as ToolJson;
}

function call(name: string, args: Record<string, unknown> = {}, permissions: string[] = READ) {
  return rpc(
    'tools/call',
    { name, arguments: { project: 'alice/novel', elementId: 'map', ...args } },
    permissions
  );
}

const ELEMENTS = [
  { id: 'map', name: 'Cover', type: 'CANVAS', parentId: null, level: 0, order: 0 },
  { id: 'doc', name: 'Chapter', type: 'ITEM', parentId: null, level: 0, order: 1 },
];

const LAYER = { id: 'l1', name: 'Layer', visible: true, locked: false, opacity: 1, order: 0 };
const PAGE = {
  id: 'page',
  name: 'Page',
  kind: 'canvas' as const,
  x: 0,
  y: 0,
  width: 400,
  height: 300,
  visible: true,
};

const base = {
  layerId: 'l1',
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  visible: true,
  locked: false,
};

const rect = (id: string, x: number, y: number, fill: string): CanvasObject => ({
  ...base,
  id,
  x,
  y,
  type: 'shape',
  shapeType: 'rect',
  width: 100,
  height: 100,
  fill,
  stroke: fill,
  strokeWidth: 0,
});

const text = (id: string, extra: Partial<CanvasText> = {}): CanvasText => ({
  ...base,
  id,
  type: 'text',
  text: 'Northreach',
  fontSize: 48,
  fontFamily: 'EB Garamond',
  fontStyle: 'bold',
  fill: '#000000',
  width: 0,
  align: 'left',
  ...extra,
});

const spies: Array<{ mockRestore: () => void }> = [];

afterEach(() => {
  while (spies.length > 0) spies.pop()?.mockRestore();
});

function seed(edit: CanvasEdit = {}): Y.Doc {
  const doc = new Y.Doc();
  doc.getArray('elements').insert(0, ELEMENTS);
  writeCanvasEdit(Y, doc, 'map', { layers: [LAYER], ...edit });
  spies.push(
    spyOn(yjsService, 'getDocument').mockImplementation(((docId: string) =>
      docId === 'alice:novel:elements/'
        ? Promise.resolve({ doc })
        : Promise.reject(new Error(`unexpected doc ${docId}`))) as never)
  );
  return doc;
}

function imageOf(json: ToolJson): Buffer {
  const image = json.result?.content?.find((c) => c.type === 'image');
  if (!image?.data) throw new Error(`no image in ${JSON.stringify(json)}`);
  expect(image.mimeType).toBe('image/png');
  return Buffer.from(image.data, 'base64');
}

async function pixelAt(png: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * info.channels;
  return [data[at], data[at + 1], data[at + 2]];
}

/** How many pixels differ from white in an area: is anything drawn there? */
async function inkIn(
  png: Buffer,
  area: { left: number; top: number; width: number; height: number }
): Promise<number> {
  const { data, info } = await sharp(png)
    .extract(area)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] < 200) count++;
  }
  return count;
}

const warningsOf = (json: ToolJson) =>
  (json.result?.structuredContent?.warnings as string[] | undefined) ?? [];

beforeAll(() => {
  registerCanvasRenderAssets(fileCanvasRenderAssets);
});

describe('render_canvas', () => {
  it('is offered with read access, and saving only with write access', async () => {
    const names = (json: ToolJson) => json.result?.tools?.map((t) => t.name) ?? [];
    const read = names(await rpc('tools/list', {}, READ));
    expect(read).toContain('render_canvas');
    expect(read).not.toContain('save_canvas_image');
    expect(names(await rpc('tools/list', {}, WRITE))).toContain('save_canvas_image');
  });

  it('draws shapes where they are, at the size asked for', async () => {
    seed({
      frames: [PAGE],
      background: '#ffffff',
      upserts: [rect('red', 0, 0, '#ff0000'), rect('blue', 200, 100, '#0000ff')],
    });

    const json = await call('render_canvas', { maxSize: 400 });

    const png = imageOf(json);
    const { width, height } = await sharp(png).metadata();
    expect([width, height]).toEqual([400, 300]);
    expect(await pixelAt(png, 50, 50)).toEqual([255, 0, 0]);
    expect(await pixelAt(png, 250, 150)).toEqual([0, 0, 255]);
    expect(await pixelAt(png, 350, 250)).toEqual([255, 255, 255]);
    expect(json.result?.structuredContent).toMatchObject({
      elementId: 'map',
      elementName: 'Cover',
      shows: 'Page',
      image: { width: 400, height: 300, scale: 1 },
    });
  });

  it('paints the page colour under everything, white when it has none', async () => {
    seed({ frames: [PAGE], background: '#00ff00' });
    const png = imageOf(await call('render_canvas', { maxSize: 100 }));
    expect(await pixelAt(png, 10, 10)).toEqual([0, 255, 0]);
    spies.pop()?.mockRestore();

    seed({ frames: [PAGE] });
    const plain = imageOf(await call('render_canvas', { maxSize: 100 }));
    expect(await pixelAt(plain, 10, 10)).toEqual([255, 255, 255]);
  });

  it('places an ellipse by its centre', async () => {
    seed({
      frames: [PAGE],
      background: '#ffffff',
      upserts: [
        {
          ...base,
          id: 'dot',
          x: 100,
          y: 100,
          type: 'shape',
          shapeType: 'ellipse',
          width: 40,
          height: 40,
          fill: '#ff0000',
          stroke: '#ff0000',
          strokeWidth: 0,
        },
      ],
    });
    const png = imageOf(await call('render_canvas', { maxSize: 400 }));
    expect(await pixelAt(png, 100, 100)).toEqual([255, 0, 0]);
    expect(await pixelAt(png, 130, 130)).toEqual([255, 255, 255]);
  });

  it.each(CANVAS_BUNDLED_FONTS)('draws text in %s', async (fontFamily) => {
    seed({ frames: [PAGE], background: '#ffffff', upserts: [text('t', { fontFamily, y: 20 })] });
    const json = await call('render_canvas', { maxSize: 400 });
    const png = imageOf(json);
    expect(await inkIn(png, { left: 0, top: 20, width: 300, height: 60 })).toBeGreaterThan(500);
    expect(warningsOf(json)).toEqual([]);
  });

  it('wraps text at its width', async () => {
    const long = 'one two three four five six seven eight nine ten';
    seed({
      frames: [PAGE],
      background: '#ffffff',
      upserts: [text('t', { text: long, fontSize: 24, width: 200, fontStyle: 'normal' })],
    });
    const png = imageOf(await call('render_canvas', { maxSize: 400 }));
    // Several lines down, within the width, and nothing past it.
    expect(await inkIn(png, { left: 0, top: 60, width: 200, height: 40 })).toBeGreaterThan(100);
    expect(await inkIn(png, { left: 210, top: 0, width: 190, height: 300 })).toBe(0);
  });

  it('spaces lines by the line height', async () => {
    const lines = 'one\ntwo';
    seed({
      frames: [PAGE],
      background: '#ffffff',
      upserts: [text('t', { text: lines, fontSize: 20, lineHeight: 4 })],
    });
    const png = imageOf(await call('render_canvas', { maxSize: 400 }));
    expect(await inkIn(png, { left: 0, top: 80, width: 200, height: 80 })).toBeGreaterThan(50);
    // The gap between the lines stays empty.
    expect(await inkIn(png, { left: 0, top: 58, width: 200, height: 24 })).toBe(0);
  });

  it('draws images from media, fitted to their box', async () => {
    const red = await sharp({
      create: { width: 40, height: 10, channels: 3, background: '#ff0000' },
    })
      .png()
      .toBuffer();
    spies.push(
      spyOn(FileStorageService.prototype, 'readProjectFile').mockImplementation((async (
        _u: string,
        _s: string,
        file: string
      ) => (file === 'wide.png' ? red : null)) as never)
    );
    seed({
      frames: [PAGE],
      background: '#ffffff',
      upserts: [
        {
          ...base,
          id: 'contain',
          type: 'image',
          src: 'media://wide.png',
          width: 100,
          height: 100,
          fit: 'contain',
        },
        {
          ...base,
          id: 'cover',
          x: 200,
          type: 'image',
          src: 'media://wide.png',
          width: 100,
          height: 100,
          fit: 'cover',
        },
      ],
    });

    const json = await call('render_canvas', { maxSize: 400 });

    const png = imageOf(json);
    expect(warningsOf(json)).toEqual([]);
    // Contained: letterboxed, so red only in the middle band.
    expect(await pixelAt(png, 50, 50)).toEqual([255, 0, 0]);
    expect(await pixelAt(png, 50, 5)).toEqual([255, 255, 255]);
    // Covered: fills the box to its corners.
    expect(await pixelAt(png, 205, 5)).toEqual([255, 0, 0]);
  });

  it('looks up an image by id when its reference has no extension', async () => {
    const red = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#ff0000' },
    })
      .jpeg()
      .toBuffer();
    spies.push(
      spyOn(FileStorageService.prototype, 'listProjectFiles').mockResolvedValue([
        { filename: 'img-1.jpg', size: red.length },
      ] as never),
      spyOn(FileStorageService.prototype, 'readProjectFile').mockResolvedValue(red as never)
    );
    seed({
      frames: [PAGE],
      background: '#ffffff',
      upserts: [{ ...base, id: 'i', type: 'image', src: 'media:img-1', width: 100, height: 100 }],
    });
    const json = await call('render_canvas', { maxSize: 400 });
    expect(warningsOf(json)).toEqual([]);
    const [r, g, b] = await pixelAt(imageOf(json), 50, 50);
    expect(r).toBeGreaterThan(240);
    expect(g).toBeLessThan(20);
    expect(b).toBeLessThan(20);
  });

  it('converts a WebP where sharp is available', async () => {
    const webp = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#0000ff' },
    })
      .webp({ lossless: true })
      .toBuffer();
    spies.push(
      spyOn(FileStorageService.prototype, 'readProjectFile').mockResolvedValue(webp as never)
    );
    seed({
      frames: [PAGE],
      background: '#ffffff',
      upserts: [
        { ...base, id: 'i', type: 'image', src: 'media://a.webp', width: 100, height: 100 },
      ],
    });
    const json = await call('render_canvas', { maxSize: 400 });
    expect(warningsOf(json)).toEqual([]);
    expect(await pixelAt(imageOf(json), 50, 50)).toEqual([0, 0, 255]);
  });

  describe('warnings', () => {
    const image = (src: string): CanvasObject => ({
      ...base,
      id: 'i',
      type: 'image',
      src,
      width: 50,
      height: 50,
    });

    it('says when an image is not there, and draws the rest', async () => {
      spies.push(
        spyOn(FileStorageService.prototype, 'readProjectFile').mockResolvedValue(null as never)
      );
      seed({ frames: [PAGE], upserts: [image('media://gone.png')] });
      const json = await call('render_canvas');
      imageOf(json);
      expect(warningsOf(json)[0]).toContain('media://gone.png');
      expect(warningsOf(json)[0]).toContain('grey box');
    });

    it('never fetches an external image', async () => {
      const fetched = spyOn(globalThis, 'fetch');
      spies.push(fetched);
      seed({ frames: [PAGE], upserts: [image('https://example.com/a.png')] });
      const json = await call('render_canvas');
      expect(warningsOf(json)[0]).toContain('does not fetch');
      expect(fetched).not.toHaveBeenCalled();
    });

    it('cannot be walked out of the project by a stored reference', async () => {
      const read = spyOn(FileStorageService.prototype, 'readProjectFile');
      spies.push(read);
      seed({ frames: [PAGE], upserts: [image('media://../../other/secret.png')] });
      const json = await call('render_canvas');
      imageOf(json);
      expect(read).not.toHaveBeenCalled();
      expect(warningsOf(json)[0]).toContain('grey box');
    });

    it('says when an image is too large to hold', async () => {
      spies.push(
        spyOn(FileStorageService.prototype, 'readProjectFile').mockResolvedValue(
          Buffer.alloc(MAX_RENDER_IMAGE_BYTES + 1) as never
        )
      );
      seed({ frames: [PAGE], upserts: [image('media://huge.png')] });
      expect(warningsOf(await call('render_canvas'))[0]).toContain('too large');
    });

    it('stops holding images when one render has had enough', async () => {
      expect(MAX_RENDER_TOTAL_IMAGE_BYTES).toBeGreaterThan(MAX_RENDER_IMAGE_BYTES);
      const png = await sharp({
        create: { width: 4, height: 4, channels: 3, background: '#ff0000' },
      })
        .png()
        .toBuffer();
      // Padded past the PNG's end, which decoders ignore.
      const big = Buffer.concat([png, Buffer.alloc(MAX_RENDER_IMAGE_BYTES - png.length)]);
      spies.push(
        spyOn(FileStorageService.prototype, 'readProjectFile').mockResolvedValue(big as never)
      );
      seed({
        frames: [PAGE],
        upserts: Array.from({ length: 4 }, (_, i) => ({
          ...image(`media://big${i}.png`),
          id: `i${i}`,
        })),
      });
      expect(warningsOf(await call('render_canvas')).join(' ')).toContain('past what one render');
    });

    it('says when an inline image cannot be drawn', async () => {
      seed({ frames: [PAGE], upserts: [image('data:image/webp;base64,AAAA')] });
      expect(warningsOf(await call('render_canvas'))[0]).toContain('inline');
    });

    it('draws an inline image it can read', async () => {
      const red = await sharp({
        create: { width: 4, height: 4, channels: 3, background: '#ff0000' },
      })
        .png()
        .toBuffer();
      seed({
        frames: [PAGE],
        background: '#ffffff',
        upserts: [image(`data:image/png;base64,${red.toString('base64')}`)],
      });
      const json = await call('render_canvas', { maxSize: 400 });
      expect(warningsOf(json)).toEqual([]);
      expect(await pixelAt(imageOf(json), 25, 25)).toEqual([255, 0, 0]);
    });

    it('says when an image file is a format it cannot read', async () => {
      spies.push(
        spyOn(FileStorageService.prototype, 'readProjectFile').mockResolvedValue(
          Buffer.from('not an image at all') as never
        )
      );
      seed({ frames: [PAGE], upserts: [image('media://odd.png')] });
      expect(warningsOf(await call('render_canvas'))[0]).toContain('cannot be drawn');
    });

    it('names a font that is not one of ours, and what it used', async () => {
      seed({ frames: [PAGE], upserts: [text('t', { fontFamily: 'Georgia', fontSize: 20 })] });
      const warnings = warningsOf(await call('render_canvas'));
      expect(warnings[0]).toContain('"Georgia"');
      expect(warnings[0]).toContain('Source Serif 4');
    });

    it('says when text has characters the fonts lack', async () => {
      seed({ frames: [PAGE], upserts: [text('t', { text: '日本', name: 'Title', fontSize: 20 })] });
      const warnings = warningsOf(await call('render_canvas'));
      expect(warnings[0]).toContain('"Title"');
      expect(warnings[0]).toContain('日');
    });

    it('catches text running off the page', async () => {
      seed({
        frames: [PAGE],
        upserts: [text('t', { name: 'Title', text: 'A title far too long for this page' })],
      });
      expect(warningsOf(await call('render_canvas'))[0]).toBe(
        'text "Title" runs past the right of Page.'
      );
    });
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['a document', { elementId: 'doc' }, 'not CANVAS'],
    ['an unknown element', { elementId: 'nope' }, 'not found'],
    ['no element', { elementId: ' ' }, 'elementId is required'],
    ['an unknown frame', { frameId: 'nope' }, 'no such frame'],
    ['a bad size', { maxSize: 1 }, 'maxSize'],
  ])('refuses %s', async (_name, args, message) => {
    seed({ frames: [PAGE] });
    const json = await call('render_canvas', args);
    expect(json.result?.isError).toBe(true);
    expect(json.result?.content?.[0]?.text).toContain(message);
  });

  it('says when a canvas has nothing to show', async () => {
    seed();
    const json = await call('render_canvas');
    expect(json.result?.content?.[0]?.text).toContain('nothing to show');
  });

  it('says so when this runtime cannot render', async () => {
    seed({ frames: [PAGE] });
    registerCanvasRenderAssets(null as never);
    try {
      const json = await call('render_canvas');
      expect(json.result?.content?.[0]?.text).toContain('not available');
    } finally {
      registerCanvasRenderAssets(fileCanvasRenderAssets);
    }
  });

  it('frees its memory: many renders do not grow without bound', async () => {
    seed({ frames: [PAGE], upserts: [text('t', { fontSize: 20 })] });
    // One at a time: each has to be freed before the next, not all held at once.
    const results = await mapWithConcurrency(Array.from({ length: 25 }), 1, () =>
      call('render_canvas', { maxSize: 200 })
    );
    for (const json of results) expect(json.result?.isError).toBeUndefined();
  });
});

describe('save_canvas_image', () => {
  function stubProject() {
    spies.push(
      spyOn(projectService, 'findById').mockResolvedValue({
        id: 'id-novel',
        userId: 'owner',
      } as never)
    );
  }

  it('stores the image as media, for use elsewhere', async () => {
    stubProject();
    spies.push(spyOn(quotaService, 'assertCanStore').mockResolvedValue(undefined as never));
    const save = spyOn(FileStorageService.prototype, 'saveProjectFile').mockResolvedValue(
      undefined as never
    );
    spies.push(save);
    seed({ frames: [PAGE], background: '#ff0000' });

    const json = await call('save_canvas_image', { maxSize: 200 }, WRITE);

    const mediaUrl = json.result?.structuredContent?.mediaUrl as string;
    expect(mediaUrl).toMatch(/^media:\/\/img-[\w-]+\.png$/);
    const [, , file, bytes] = save.mock.calls[0] as unknown as [string, string, string, Uint8Array];
    expect(file).toBe(mediaUrl.substring('media://'.length));
    expect(await pixelAt(Buffer.from(bytes), 10, 10)).toEqual([255, 0, 0]);
    expect(json.result?.content?.some((c) => c.type === 'image')).toBe(false);
  });

  it('charges sync capacity, and stores nothing when it is full', async () => {
    stubProject();
    spies.push(
      spyOn(quotaService, 'assertCanStore').mockRejectedValue(
        new QuotaExceededError({ usedBytes: 9, quotaBytes: 9, reason: 'media_upload' })
      )
    );
    const save = spyOn(FileStorageService.prototype, 'saveProjectFile');
    spies.push(save);
    seed({ frames: [PAGE] });

    const json = await call('save_canvas_image', {}, WRITE);

    expect(json.result?.isError).toBe(true);
    expect(json.result?.content?.[0]?.text).toContain('sync capacity');
    expect(save).not.toHaveBeenCalled();
  });

  it('refuses without an element, or for a read-only grant', async () => {
    seed({ frames: [PAGE] });
    const noElement = await call('save_canvas_image', { elementId: '' }, WRITE);
    expect(noElement.result?.content?.[0]?.text).toContain('elementId is required');
    const readOnly = await call('save_canvas_image', {}, READ);
    expect(JSON.stringify(readOnly)).toContain('ermission');
  });

  it('passes on what a render refuses', async () => {
    seed({ frames: [PAGE] });
    const json = await call('save_canvas_image', { frameId: 'nope' }, WRITE);
    expect(json.result?.content?.[0]?.text).toContain('no such frame');
  });
});

describe('the bundled fonts', () => {
  const pack = new Uint8Array(
    readFileSync(join(import.meta.dir, '../assets/canvas-fonts.pack.bin'))
  );
  const { entries, faces } = readFontPack(pack);
  const faceBytes = (index: number) =>
    faces.subarray(entries[index].offset, entries[index].offset + entries[index].length);

  it('has all four faces of every font the tools name', () => {
    for (const family of CANVAS_BUNDLED_FONTS) {
      const own = entries.filter((e) => e.family === family);
      expect(own.map((e) => `${e.bold}/${e.italic}`).sort()).toEqual([
        'false/false',
        'false/true',
        'true/false',
        'true/true',
      ]);
    }
  });

  it('holds exactly the files the frontend pins, so both sides draw the same', () => {
    const digests = JSON.parse(
      readFileSync(join(import.meta.dir, '../../frontend/scripts/font-digests.json'), 'utf8')
    ) as Record<string, string>;
    const pinned = new Set(Object.values(digests));
    entries.forEach((_, index) => {
      const digest = createHash('sha256').update(faceBytes(index)).digest('hex');
      expect(pinned.has(digest)).toBe(true);
    });
  });

  it('reads metrics that make sense', () => {
    entries.forEach((entry, index) => {
      const metrics = parseFontMetrics(faceBytes(index));
      expect(metrics.family, entry.family).toStartWith(entry.family);
      expect(metrics.unitsPerEm).toBeGreaterThan(0);
      expect(metrics.ascent).toBeGreaterThan(0);
      expect(metrics.descent).toBeGreaterThan(0);
      expect(metrics.hasGlyph('A'.codePointAt(0) as number)).toBe(true);
      expect(metrics.hasGlyph(0x65e5)).toBe(false); // 日
      expect(metrics.advance('M'.codePointAt(0) as number)).toBeGreaterThan(
        metrics.advance('i'.codePointAt(0) as number) - 1
      );
    });
  });

  it('reads the name a font goes by, whatever it is sold as', () => {
    const index = entries.findIndex((e) => e.family === 'Source Sans 3' && !e.bold && !e.italic);
    expect(readFontFamily(faceBytes(index))).toBe('Source Sans 3 ExtraLight');
  });

  it('measures text close to the sum of its letters, scaled to the size', () => {
    const fonts = new CanvasFontSet(entries, faces);
    const font = { family: 'Lato', size: 100, bold: false, italic: false };
    const whole = fonts.measure('Hello', font).width;
    const parts = [...'Hello'].reduce((sum, c) => sum + fonts.measure(c, font).width, 0);
    expect(whole).toBeCloseTo(parts);
    expect(whole).toBeGreaterThan(150);
    expect(whole).toBeLessThan(350);
    const measured = fonts.measure('x', font);
    expect(measured.ascent).toBeGreaterThan(measured.descent);
  });

  it.each([
    ['Lato', 'Lato'],
    ['lato', 'Lato'],
    ['"EB Garamond", serif', 'EB Garamond'],
    ['Garamond', 'EB Garamond'],
    ['Georgia', 'Source Serif 4'],
    ['Times New Roman', 'Source Serif 4'],
    ['serif', 'Source Serif 4'],
    ['Arial', 'Source Sans 3'],
    ['sans-serif', 'Source Sans 3'],
    ['Courier New', 'Courier Prime'],
    ['Fira Code', 'Source Code Pro'],
    ['monospace', 'Source Code Pro'],
    ['Comic Sans MS', 'Source Sans 3'],
    ['Nonesuch', 'Source Sans 3'],
    ['', 'Source Sans 3'],
  ])('draws %s in %s', (requested, expected) => {
    expect(new CanvasFontSet(entries, faces).familyFor(requested)).toBe(expected);
  });

  it('fails plainly for a face the pack does not have', () => {
    const fonts = new CanvasFontSet(
      entries.filter((e) => !(e.family === 'Lato' && e.bold)),
      faces
    );
    expect(() =>
      fonts.measure('x', { family: 'Lato', size: 10, bold: true, italic: false })
    ).toThrow('No font face');
  });
});

describe('reading fonts', () => {
  /** The smallest font with a format 12 cmap, to cover the other lookup. */
  function fontWithFormat12(): Uint8Array {
    const pack = new Uint8Array(
      readFileSync(join(import.meta.dir, '../assets/canvas-fonts.pack.bin'))
    );
    const { entries, faces } = readFontPack(pack);
    const bytes = faces.slice(entries[0].offset, entries[0].offset + entries[0].length);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tableCount = view.getUint16(4);
    for (let i = 0; i < tableCount; i++) {
      const entry = 12 + i * 16;
      if (String.fromCodePoint(view.getUint8(entry)) !== 'c') continue;
      if (String.fromCodePoint(view.getUint8(entry + 1)) !== 'm') continue;
      // Rewrite the cmap in place: one encoding, one format 12 group, A to C.
      const cmap = view.getUint32(entry + 8);
      view.setUint16(cmap + 2, 1);
      view.setUint32(cmap + 8, 12);
      const table = cmap + 12;
      view.setUint16(table, 12);
      view.setUint32(table + 12, 1);
      view.setUint32(table + 16, 0x41);
      view.setUint32(table + 20, 0x43);
      view.setUint32(table + 24, 5);
    }
    return bytes;
  }

  it('reads a format 12 character map', () => {
    const metrics = parseFontMetrics(fontWithFormat12());
    expect(metrics.hasGlyph(0x42)).toBe(true);
    expect(metrics.hasGlyph(0x44)).toBe(false);
  });

  it('refuses a font without the tables it needs', () => {
    const bytes = new Uint8Array(12);
    expect(() => parseFontMetrics(bytes)).toThrow('no cmap table');
  });
});
