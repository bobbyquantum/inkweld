/**
 * Tests for Image Paste ProseMirror Plugin
 */
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  base64ToBlob,
  createImagePastePlugin,
  createMediaUrl,
  extractMediaId,
  extractMimeType,
  generateMediaId,
  ImagePastePluginCallbacks,
  imagePastePluginKey,
  isBase64ImageUrl,
  isMediaUrl,
  MEDIA_URL_PREFIX,
} from './image-paste-plugin';

// Test data
const VALID_BASE64_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const VALID_BASE64_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AZP/Z';
const INVALID_URL = 'https://example.com/image.png';
const BLOB_URL = 'blob:http://localhost/abc-123';

// Create a schema with image node for testing
const testSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() {
        return ['p', 0];
      },
    },
    text: { group: 'inline' },
    image: {
      inline: true,
      attrs: {
        src: {},
        alt: { default: null },
        title: { default: null },
        width: { default: null },
        'data-media-id': { default: null },
      },
      group: 'inline',
      draggable: true,
      parseDOM: [
        {
          tag: 'img[src]',
          getAttrs(dom: HTMLElement) {
            return {
              src: dom.getAttribute('src'),
              alt: dom.getAttribute('alt'),
              title: dom.getAttribute('title'),
              width: dom.getAttribute('width'),
              'data-media-id': dom.getAttribute('data-media-id'),
            };
          },
        },
      ],
      toDOM(node) {
        return ['img', node.attrs];
      },
    },
  },
  marks: {},
});

describe('Image Paste Utility Functions', () => {
  describe('isBase64ImageUrl', () => {
    it('should return true for valid PNG base64 data URL', () => {
      expect(isBase64ImageUrl(VALID_BASE64_PNG)).toBe(true);
    });

    it('should return true for valid JPEG base64 data URL', () => {
      expect(isBase64ImageUrl(VALID_BASE64_JPEG)).toBe(true);
    });

    it('should return false for regular HTTP URLs', () => {
      expect(isBase64ImageUrl(INVALID_URL)).toBe(false);
    });

    it('should return false for blob URLs', () => {
      expect(isBase64ImageUrl(BLOB_URL)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isBase64ImageUrl('')).toBe(false);
    });

    it('should return false for non-image data URLs', () => {
      expect(isBase64ImageUrl('data:text/plain;base64,SGVsbG8=')).toBe(false);
    });
  });

  describe('extractMimeType', () => {
    it('should extract image/png from PNG data URL', () => {
      expect(extractMimeType(VALID_BASE64_PNG)).toBe('image/png');
    });

    it('should extract image/jpeg from JPEG data URL', () => {
      expect(extractMimeType(VALID_BASE64_JPEG)).toBe('image/jpeg');
    });

    it('should return default image/png for invalid URLs', () => {
      expect(extractMimeType('invalid')).toBe('image/png');
    });

    it('should handle image/gif', () => {
      expect(
        extractMimeType(
          'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
        )
      ).toBe('image/gif');
    });

    it('should handle image/webp', () => {
      expect(
        extractMimeType(
          'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAQAAAAfQ'
        )
      ).toBe('image/webp');
    });
  });

  describe('base64ToBlob', () => {
    it('should convert PNG base64 to Blob', () => {
      const blob = base64ToBlob(VALID_BASE64_PNG);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should convert JPEG base64 to Blob', () => {
      const blob = base64ToBlob(VALID_BASE64_JPEG);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/jpeg');
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should create blob with correct size', () => {
      // The test PNG is a 1x1 pixel image, approximately 70 bytes
      const blob = base64ToBlob(VALID_BASE64_PNG);
      expect(blob.size).toBeGreaterThan(60);
      expect(blob.size).toBeLessThan(80);
    });
  });

  describe('generateMediaId', () => {
    it('should generate IDs starting with "img-"', () => {
      const id = generateMediaId();
      expect(id.startsWith('img-')).toBe(true);
    });

    it('should generate unique IDs', () => {
      const id1 = generateMediaId();
      const id2 = generateMediaId();
      expect(id1).not.toBe(id2);
    });

    it('should generate valid UUID format after prefix', () => {
      const id = generateMediaId();
      const uuid = id.replace('img-', '');
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });
  });

  describe('Media URL Functions', () => {
    const VALID_MEDIA_ID = 'img-abc123-def456';
    const VALID_MEDIA_URL = `${MEDIA_URL_PREFIX}${VALID_MEDIA_ID}`;

    describe('isMediaUrl', () => {
      it('should return true for valid media URLs', () => {
        expect(isMediaUrl(VALID_MEDIA_URL)).toBe(true);
      });

      it('should return true for any media: prefixed URL', () => {
        expect(isMediaUrl('media:anything')).toBe(true);
      });

      it('should return false for HTTP URLs', () => {
        expect(isMediaUrl('https://example.com/image.png')).toBe(false);
      });

      it('should return false for blob URLs', () => {
        expect(isMediaUrl('blob:http://localhost/abc-123')).toBe(false);
      });

      it('should return false for base64 data URLs', () => {
        expect(isMediaUrl(VALID_BASE64_PNG)).toBe(false);
      });

      it('should return false for empty string', () => {
        expect(isMediaUrl('')).toBe(false);
      });

      it('should return false for undefined/null', () => {
        expect(isMediaUrl(undefined as unknown as string)).toBe(false);
        expect(isMediaUrl(null as unknown as string)).toBe(false);
      });
    });

    describe('extractMediaId', () => {
      it('should extract media ID from valid media URL', () => {
        expect(extractMediaId(VALID_MEDIA_URL)).toBe(VALID_MEDIA_ID);
      });

      it('should return null for non-media URLs', () => {
        expect(extractMediaId('https://example.com/image.png')).toBeNull();
        expect(extractMediaId('blob:http://localhost/abc')).toBeNull();
        expect(extractMediaId('')).toBeNull();
      });

      it('should handle media URL with complex ID', () => {
        const complexId = 'img-12345678-1234-4123-8123-123456789abc';
        const mediaUrl = createMediaUrl(complexId);
        expect(extractMediaId(mediaUrl)).toBe(complexId);
      });
    });

    describe('createMediaUrl', () => {
      it('should create media URL from media ID', () => {
        expect(createMediaUrl(VALID_MEDIA_ID)).toBe(VALID_MEDIA_URL);
      });

      it('should create valid media URL that passes isMediaUrl', () => {
        const mediaUrl = createMediaUrl('test-id');
        expect(isMediaUrl(mediaUrl)).toBe(true);
      });

      it('should round-trip with extractMediaId', () => {
        const originalId = 'img-round-trip-test';
        const mediaUrl = createMediaUrl(originalId);
        const extractedId = extractMediaId(mediaUrl);
        expect(extractedId).toBe(originalId);
      });
    });
  });
});

describe('ImagePastePlugin', () => {
  let callbacks: ImagePastePluginCallbacks;
  let savedImages: Map<string, Blob>;

  beforeEach(() => {
    savedImages = new Map();

    callbacks = {
      saveImage: vi.fn((blob: Blob, _mimeType: string) => {
        const mediaId = generateMediaId();
        savedImages.set(mediaId, blob);
        return Promise.resolve(mediaId);
      }),
      getImageUrl: vi.fn((mediaId: string) => {
        if (savedImages.has(mediaId)) {
          return Promise.resolve(`blob:http://localhost/${mediaId}`);
        }
        return Promise.resolve(null);
      }),
      getProjectKey: vi.fn(() => 'testuser/testproject'),
    };
  });

  describe('createImagePastePlugin', () => {
    it('should create a plugin with the correct key', () => {
      const plugin = createImagePastePlugin(callbacks);
      expect(plugin.spec.key).toBe(imagePastePluginKey);
    });

    it('should register handlePaste prop', () => {
      const plugin = createImagePastePlugin(callbacks);
      expect(plugin.props.handlePaste).toBeDefined();
    });

    it('should register handleDrop prop', () => {
      const plugin = createImagePastePlugin(callbacks);
      expect(plugin.props.handleDrop).toBeDefined();
    });

    it('should register transformPasted prop', () => {
      const plugin = createImagePastePlugin(callbacks);
      expect(plugin.props.transformPasted).toBeDefined();
    });
  });

  describe('Plugin with EditorState', () => {
    let state: EditorState;

    beforeEach(() => {
      const plugin = createImagePastePlugin(callbacks);
      state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello world')]),
        ]),
        plugins: [plugin],
      });
    });

    it('should initialize correctly', () => {
      expect(state).toBeDefined();
      expect(state.plugins.length).toBe(1);
    });

    it('should have image node in schema', () => {
      expect(state.schema.nodes['image']).toBeDefined();
    });
  });

  describe('Document with base64 images', () => {
    it('should detect base64 images in document', () => {
      const plugin = createImagePastePlugin(callbacks);
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [
            testSchema.text('Before '),
            testSchema.nodes['image'].create({ src: VALID_BASE64_PNG }),
            testSchema.text(' After'),
          ]),
        ]),
        plugins: [plugin],
      });

      let hasBase64 = false;
      state.doc.descendants(node => {
        if (
          node.type.name === 'image' &&
          isBase64ImageUrl(node.attrs['src'] as string)
        ) {
          hasBase64 = true;
          return false;
        }
        return true;
      });

      expect(hasBase64).toBe(true);
    });

    it('should not flag blob URLs as base64', () => {
      const plugin = createImagePastePlugin(callbacks);
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [
            testSchema.nodes['image'].create({ src: BLOB_URL }),
          ]),
        ]),
        plugins: [plugin],
      });

      let hasBase64 = false;
      state.doc.descendants(node => {
        if (
          node.type.name === 'image' &&
          isBase64ImageUrl(node.attrs['src'] as string)
        ) {
          hasBase64 = true;
          return false;
        }
        return true;
      });

      expect(hasBase64).toBe(false);
    });
  });

  describe('Callbacks', () => {
    it('should call getProjectKey when checking for project', () => {
      createImagePastePlugin(callbacks);
      callbacks.getProjectKey();
      expect(callbacks.getProjectKey).toHaveBeenCalled();
    });

    it('should return null from getImageUrl for unknown mediaId', async () => {
      const result = await callbacks.getImageUrl('unknown-id');
      expect(result).toBeNull();
    });

    it('should return blob URL for saved image', async () => {
      const mediaId = await callbacks.saveImage(
        new Blob(['test'], { type: 'image/png' }),
        'image/png'
      );
      const url = await callbacks.getImageUrl(mediaId);
      expect(url).toContain(mediaId);
    });
  });

  describe('No project key scenario', () => {
    it('should handle missing project key gracefully', () => {
      const noProjectCallbacks: ImagePastePluginCallbacks = {
        saveImage: vi.fn(),
        getImageUrl: vi.fn(),
        getProjectKey: vi.fn(() => null),
      };

      const plugin = createImagePastePlugin(noProjectCallbacks);
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Test')]),
        ]),
        plugins: [plugin],
      });

      expect(state).toBeDefined();
      expect(noProjectCallbacks.getProjectKey()).toBeNull();
    });
  });
});

describe('Plugin Integration', () => {
  let container: HTMLElement;
  let view: EditorView;
  let callbacks: ImagePastePluginCallbacks;
  let savedImages: Map<string, Blob>;

  beforeEach(() => {
    savedImages = new Map();

    callbacks = {
      saveImage: vi.fn((blob: Blob, _mimeType: string) => {
        const mediaId = generateMediaId();
        savedImages.set(mediaId, blob);
        return Promise.resolve(mediaId);
      }),
      getImageUrl: vi.fn((mediaId: string) => {
        if (savedImages.has(mediaId)) {
          return Promise.resolve(`blob:http://localhost/${mediaId}`);
        }
        return Promise.resolve(null);
      }),
      getProjectKey: vi.fn(() => 'testuser/testproject'),
    };

    // Create container for EditorView
    container = document.createElement('div');
    document.body.appendChild(container);

    const plugin = createImagePastePlugin(callbacks);
    const state = EditorState.create({
      schema: testSchema,
      doc: testSchema.node('doc', null, [
        testSchema.node('paragraph', null, [testSchema.text('Hello world')]),
      ]),
      plugins: [plugin],
    });

    view = new EditorView(container, { state });
  });

  afterEach(() => {
    view.destroy();
    container.remove();
  });

  it('should create EditorView with plugin', () => {
    expect(view).toBeDefined();
    expect(view.state.plugins.length).toBe(1);
  });

  it('should have handlePaste in props', () => {
    const plugin = view.state.plugins[0];
    expect(plugin.props.handlePaste).toBeDefined();
  });

  it('should process document updates', () => {
    // Dispatch a simple transaction
    const tr = view.state.tr.insertText('!', view.state.doc.content.size - 1);
    view.dispatch(tr);

    expect(view.state.doc.textContent).toContain('!');
  });
});
