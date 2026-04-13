/**
 * Tests for Image Paste ProseMirror Plugin
 */
import { type Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  base64ToBlob,
  createImagePastePlugin,
  createMediaImageNodeViews,
  createMediaUrl,
  extractMediaId,
  extractMimeType,
  generateMediaId,
  type ImagePastePluginCallbacks,
  imagePastePluginKey,
  isBase64ImageUrl,
  isMediaUrl,
  MEDIA_URL_PREFIX,
  MediaImageNodeView,
  type MediaImageNodeViewOptions,
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
      expect(id.startsWith('img-')).toBe(true);
      const uuid = id.slice('img-'.length);
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

  describe('handlePaste', () => {
    it('should save image files and insert media URL nodes', async () => {
      const plugin = view.state.plugins[0];
      const imageFile = new File(['fake-png'], 'test.png', {
        type: 'image/png',
      });

      const clipboardEvent = {
        clipboardData: {
          files: [imageFile],
        },
        preventDefault: vi.fn(),
      } as unknown as ClipboardEvent;

      plugin.props.handlePaste!.call(
        plugin,
        view,
        clipboardEvent,
        view.state.doc.content as unknown as import('prosemirror-model').Slice
      );

      // Wait for async handler to complete
      await vi.waitFor(() => {
        expect(callbacks.saveImage).toHaveBeenCalledWith(
          imageFile,
          'image/png'
        );
      });

      expect(clipboardEvent.preventDefault).toHaveBeenCalled();
    });

    it('should not process paste without clipboardData', () => {
      const plugin = view.state.plugins[0];

      const clipboardEvent = {
        clipboardData: null,
        preventDefault: vi.fn(),
      } as unknown as ClipboardEvent;

      plugin.props.handlePaste!.call(
        plugin,
        view,
        clipboardEvent,
        view.state.doc.content as unknown as import('prosemirror-model').Slice
      );

      expect(callbacks.saveImage).not.toHaveBeenCalled();
      expect(clipboardEvent.preventDefault).not.toHaveBeenCalled();
    });

    it('should not process paste when no project key', async () => {
      (callbacks.getProjectKey as ReturnType<typeof vi.fn>).mockReturnValue(
        null
      );
      const plugin = view.state.plugins[0];
      const imageFile = new File(['fake-png'], 'test.png', {
        type: 'image/png',
      });

      const clipboardEvent = {
        clipboardData: {
          files: [imageFile],
        },
        preventDefault: vi.fn(),
      } as unknown as ClipboardEvent;

      plugin.props.handlePaste!.call(
        plugin,
        view,
        clipboardEvent,
        view.state.doc.content as unknown as import('prosemirror-model').Slice
      );

      // Give async handler time to run
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(callbacks.saveImage).not.toHaveBeenCalled();
      expect(clipboardEvent.preventDefault).not.toHaveBeenCalled();
    });

    it('should skip non-image files in clipboard', async () => {
      const plugin = view.state.plugins[0];
      const textFile = new File(['hello'], 'test.txt', {
        type: 'text/plain',
      });

      const clipboardEvent = {
        clipboardData: {
          files: [textFile],
        },
        preventDefault: vi.fn(),
      } as unknown as ClipboardEvent;

      plugin.props.handlePaste!.call(
        plugin,
        view,
        clipboardEvent,
        view.state.doc.content as unknown as import('prosemirror-model').Slice
      );

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(callbacks.saveImage).not.toHaveBeenCalled();
      expect(clipboardEvent.preventDefault).not.toHaveBeenCalled();
    });

    it('should handle saveImage failure gracefully', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      (callbacks.saveImage as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Save failed')
      );

      const plugin = view.state.plugins[0];
      const imageFile = new File(['fake-png'], 'test.png', {
        type: 'image/png',
      });

      const clipboardEvent = {
        clipboardData: {
          files: [imageFile],
        },
        preventDefault: vi.fn(),
      } as unknown as ClipboardEvent;

      plugin.props.handlePaste!.call(
        plugin,
        view,
        clipboardEvent,
        view.state.doc.content as unknown as import('prosemirror-model').Slice
      );

      await vi.waitFor(() => {
        expect(callbacks.saveImage).toHaveBeenCalled();
      });

      // Should not crash — error logged
      consoleError.mockRestore();
    });
  });

  describe('handleDrop', () => {
    it('should save dropped image files and insert at drop position', async () => {
      const plugin = view.state.plugins[0];
      const imageFile = new File(['fake-png'], 'dropped.png', {
        type: 'image/png',
      });

      // Mock posAtCoords since JSDOM doesn't support layout
      vi.spyOn(view, 'posAtCoords').mockReturnValue({ pos: 1, inside: -1 });

      const dropEvent = {
        dataTransfer: {
          files: [imageFile],
        },
        clientX: 10,
        clientY: 10,
        preventDefault: vi.fn(),
      } as unknown as DragEvent;

      plugin.props.handleDrop!.call(
        plugin,
        view,
        dropEvent,
        view.state.doc.content as unknown as import('prosemirror-model').Slice,
        false
      );

      await vi.waitFor(() => {
        expect(callbacks.saveImage).toHaveBeenCalledWith(
          imageFile,
          'image/png'
        );
      });

      expect(dropEvent.preventDefault).toHaveBeenCalled();
    });

    it('should not process drop without dataTransfer', () => {
      const plugin = view.state.plugins[0];

      const dropEvent = {
        dataTransfer: null,
        preventDefault: vi.fn(),
      } as unknown as DragEvent;

      plugin.props.handleDrop!.call(
        plugin,
        view,
        dropEvent,
        view.state.doc.content as unknown as import('prosemirror-model').Slice,
        false
      );

      expect(callbacks.saveImage).not.toHaveBeenCalled();
    });

    it('should not process drop when no project key', async () => {
      (callbacks.getProjectKey as ReturnType<typeof vi.fn>).mockReturnValue(
        null
      );
      const plugin = view.state.plugins[0];
      const imageFile = new File(['fake-png'], 'test.png', {
        type: 'image/png',
      });

      const dropEvent = {
        dataTransfer: {
          files: [imageFile],
        },
        clientX: 10,
        clientY: 10,
        preventDefault: vi.fn(),
      } as unknown as DragEvent;

      plugin.props.handleDrop!.call(
        plugin,
        view,
        dropEvent,
        view.state.doc.content as unknown as import('prosemirror-model').Slice,
        false
      );

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(callbacks.saveImage).not.toHaveBeenCalled();
    });

    it('should skip non-image files in drop', async () => {
      const plugin = view.state.plugins[0];
      const textFile = new File(['hello'], 'test.txt', {
        type: 'text/plain',
      });

      const dropEvent = {
        dataTransfer: {
          files: [textFile],
        },
        clientX: 10,
        clientY: 10,
        preventDefault: vi.fn(),
      } as unknown as DragEvent;

      plugin.props.handleDrop!.call(
        plugin,
        view,
        dropEvent,
        view.state.doc.content as unknown as import('prosemirror-model').Slice,
        false
      );

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(callbacks.saveImage).not.toHaveBeenCalled();
    });
  });

  describe('transformPasted', () => {
    it('should return slice unchanged', () => {
      const plugin = view.state.plugins[0];
      const slice = view.state.doc
        .content as unknown as import('prosemirror-model').Slice;

      const result = plugin.props.transformPasted!.call(
        plugin,
        slice,
        view,
        false
      );

      expect(result).toBe(slice);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MediaImageNodeView
// ─────────────────────────────────────────────────────────────────────────────

describe('MediaImageNodeView', () => {
  let options: MediaImageNodeViewOptions;

  beforeEach(() => {
    options = {
      getImageUrl: vi.fn((mediaId: string) =>
        Promise.resolve(`blob:http://localhost/${mediaId}`)
      ),
    };
  });

  function createImageNode(
    attrs: Record<string, string | null> = {}
  ): ProseMirrorNode {
    return testSchema.nodes['image'].create({
      src: 'media:img-test-123',
      alt: 'Test image',
      ...attrs,
    });
  }

  function createNodeView(node?: ProseMirrorNode): MediaImageNodeView {
    const imageNode = node ?? createImageNode();
    const mockView = {} as EditorView;
    const mockGetPos = () => 0;
    return new MediaImageNodeView(imageNode, mockView, mockGetPos, options);
  }

  describe('constructor', () => {
    it('should create DOM container and img element', () => {
      const nodeView = createNodeView();

      expect(nodeView.dom).toBeInstanceOf(HTMLElement);
      expect(nodeView.dom.tagName).toBe('SPAN');
      expect(nodeView.dom.className).toBe('media-image-container');

      const img = nodeView.dom.querySelector('img');
      expect(img).toBeTruthy();
      expect(img!.className).toBe('media-image');
    });

    it('should copy non-src attributes to img', () => {
      const node = createImageNode({ alt: 'My photo', title: 'Photo title' });
      const nodeView = createNodeView(node);

      const img = nodeView.dom.querySelector('img')!;
      expect(img.getAttribute('alt')).toBe('My photo');
      expect(img.getAttribute('title')).toBe('Photo title');
    });

    it('should not set src attribute directly', () => {
      const nodeView = createNodeView();

      const img = nodeView.dom.querySelector('img')!;
      // src should NOT be set by constructor — init() handles it
      expect(img.getAttribute('src')).toBeNull();
    });
  });

  describe('init', () => {
    it('should resolve media: URL to blob URL', async () => {
      const nodeView = createNodeView();
      nodeView.init('media:img-test-123');

      await vi.waitFor(() => {
        const img = nodeView.dom.querySelector('img')!;
        expect(img.src).toContain('blob:http://localhost/img-test-123');
      });

      expect(options.getImageUrl).toHaveBeenCalledWith('img-test-123');
    });

    it('should use non-media URL directly', async () => {
      const nodeView = createNodeView();
      nodeView.init('https://example.com/photo.png');

      // Non-media URLs go directly to src
      await vi.waitFor(() => {
        const img = nodeView.dom.querySelector('img')!;
        expect(img.src).toBe('https://example.com/photo.png');
      });

      expect(options.getImageUrl).not.toHaveBeenCalled();
    });

    it('should set empty src for null/undefined', async () => {
      const nodeView = createNodeView();
      nodeView.init(null);

      await new Promise(resolve => setTimeout(resolve, 10));

      const img = nodeView.dom.querySelector('img')!;
      expect(img.getAttribute('src')).toBe('');
    });

    it('should show not-found state when getImageUrl returns null', async () => {
      (options.getImageUrl as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const nodeView = createNodeView();
      nodeView.init('media:img-missing');

      await vi.waitFor(() => {
        const img = nodeView.dom.querySelector('img')!;
        expect(img.alt).toBe('Image not found');
        expect(img.style.opacity).toBe('0.5');
      });
    });

    it('should handle getImageUrl rejection', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      (options.getImageUrl as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Network error')
      );

      const nodeView = createNodeView();
      nodeView.init('media:img-error');

      await vi.waitFor(() => {
        const img = nodeView.dom.querySelector('img')!;
        expect(img.alt).toBe('Failed to load image');
        expect(img.style.opacity).toBe('0.5');
      });

      consoleError.mockRestore();
    });

    it('should not update img after destroy', async () => {
      const nodeView = createNodeView();
      nodeView.destroy();
      nodeView.init('media:img-test-123');

      await new Promise(resolve => setTimeout(resolve, 10));

      const img = nodeView.dom.querySelector('img')!;
      // src should remain empty since the view was destroyed
      expect(img.getAttribute('src')).toBeNull();
      expect(options.getImageUrl).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should return true for same node type', () => {
      const nodeView = createNodeView();
      const newNode = createImageNode({ src: 'media:img-new' });

      const result = nodeView.update(newNode);

      expect(result).toBe(true);
    });

    it('should return false for different node type', () => {
      const nodeView = createNodeView();
      const textNode = testSchema.node('paragraph', null, [
        testSchema.text('Hello'),
      ]);

      const result = nodeView.update(textNode);

      expect(result).toBe(false);
    });

    it('should re-resolve image src on update', async () => {
      const nodeView = createNodeView();
      const newNode = createImageNode({ src: 'media:img-updated' });

      nodeView.update(newNode);

      await vi.waitFor(() => {
        expect(options.getImageUrl).toHaveBeenCalledWith('img-updated');
      });
    });

    it('should update non-src attributes', () => {
      const nodeView = createNodeView();
      const newNode = createImageNode({
        alt: 'Updated alt',
        title: 'New title',
      });

      nodeView.update(newNode);

      const img = nodeView.dom.querySelector('img')!;
      expect(img.getAttribute('alt')).toBe('Updated alt');
      expect(img.getAttribute('title')).toBe('New title');
    });
  });

  describe('destroy', () => {
    it('should mark the node view as destroyed', async () => {
      const nodeView = createNodeView();
      nodeView.destroy();

      // After destroy, resolving should be a no-op
      nodeView.init('media:img-test-123');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(options.getImageUrl).not.toHaveBeenCalled();
    });
  });
});

describe('createMediaImageNodeViews', () => {
  it('should return an object with image key', () => {
    const nodeViews = createMediaImageNodeViews({
      getImageUrl: vi.fn(),
    });

    expect(nodeViews).toHaveProperty('image');
    expect(typeof nodeViews['image']).toBe('function');
  });

  it('should create MediaImageNodeView and call init', () => {
    const getImageUrl = vi.fn(() => Promise.resolve('blob:url'));
    const nodeViews = createMediaImageNodeViews({ getImageUrl });

    const node = testSchema.nodes['image'].create({
      src: 'media:img-factory-test',
    });
    const mockView = {} as EditorView;
    const mockGetPos = () => 0;

    const nodeView = nodeViews['image'](node, mockView, mockGetPos);

    expect(nodeView).toBeInstanceOf(MediaImageNodeView);
    // init was called with the src
    expect(getImageUrl).toHaveBeenCalledWith('img-factory-test');
  });
});
