import { Schema } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';

import {
  createExtendedSchema,
  extendedSchema,
  ngxEditorSchema,
} from './extended-schema';

describe('extended-schema', () => {
  describe('createExtendedSchema', () => {
    it('should create a valid ProseMirror Schema', () => {
      const schema = createExtendedSchema();
      expect(schema).toBeInstanceOf(Schema);
    });

    it('should include the elementRef node type', () => {
      const schema = createExtendedSchema();
      expect(schema.nodes['elementRef']).toBeDefined();
    });

    it('should include standard nodes from ngx-editor', () => {
      const schema = createExtendedSchema();
      expect(schema.nodes['doc']).toBeDefined();
      expect(schema.nodes['paragraph']).toBeDefined();
      expect(schema.nodes['text']).toBeDefined();
    });

    it('should include standard marks from ngx-editor', () => {
      const schema = createExtendedSchema();
      expect(schema.marks['strong']).toBeDefined();
      expect(schema.marks['em']).toBeDefined();
      expect(schema.marks['link']).toBeDefined();
    });
  });

  describe('extendedSchema', () => {
    it('should be a pre-created Schema instance', () => {
      expect(extendedSchema).toBeInstanceOf(Schema);
    });

    it('should have elementRef node available', () => {
      expect(extendedSchema.nodes['elementRef']).toBeDefined();
    });
  });

  describe('ngxEditorSchema re-export', () => {
    it('should re-export the original ngx-editor schema', () => {
      expect(ngxEditorSchema).toBeDefined();
      expect(ngxEditorSchema).toBeInstanceOf(Schema);
    });

    it('should not include elementRef in the original schema', () => {
      // The original schema should NOT have our custom elementRef node
      expect(ngxEditorSchema.nodes['elementRef']).toBeUndefined();
    });
  });
});
