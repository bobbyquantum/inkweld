import {
  ElementTypeSchema,
  FieldLayout,
  FieldSchema,
  FieldType,
  FieldValidation,
  TabSchema,
} from './schema-types';

describe('schema-types', () => {
  describe('FieldType enum', () => {
    it('should have TEXT type', () => {
      expect(FieldType.TEXT).toBe('text');
    });

    it('should have TEXTAREA type', () => {
      expect(FieldType.TEXTAREA).toBe('textarea');
    });

    it('should have NUMBER type', () => {
      expect(FieldType.NUMBER).toBe('number');
    });

    it('should have DATE type', () => {
      expect(FieldType.DATE).toBe('date');
    });

    it('should have SELECT type', () => {
      expect(FieldType.SELECT).toBe('select');
    });

    it('should have MULTISELECT type', () => {
      expect(FieldType.MULTISELECT).toBe('multiselect');
    });

    it('should have ARRAY type', () => {
      expect(FieldType.ARRAY).toBe('array');
    });

    it('should have CHECKBOX type', () => {
      expect(FieldType.CHECKBOX).toBe('checkbox');
    });
  });

  describe('type interfaces', () => {
    describe('FieldLayout', () => {
      it('should allow optional span and order', () => {
        const layout: FieldLayout = {
          span: 6,
          order: 1,
        };
        expect(layout.span).toBe(6);
        expect(layout.order).toBe(1);
      });

      it('should allow empty layout', () => {
        const layout: FieldLayout = {};
        expect(layout.span).toBeUndefined();
        expect(layout.order).toBeUndefined();
      });
    });

    describe('FieldValidation', () => {
      it('should allow all validation options', () => {
        const validation: FieldValidation = {
          required: true,
          minLength: 5,
          maxLength: 100,
          min: 0,
          max: 10,
          pattern: '^[a-z]+$',
          custom: 'customValidator',
        };

        expect(validation.required).toBe(true);
        expect(validation.minLength).toBe(5);
        expect(validation.maxLength).toBe(100);
        expect(validation.min).toBe(0);
        expect(validation.max).toBe(10);
        expect(validation.pattern).toBe('^[a-z]+$');
        expect(validation.custom).toBe('customValidator');
      });
    });

    describe('FieldSchema', () => {
      it('should accept minimal field definition', () => {
        const field: FieldSchema = {
          key: 'name',
          label: 'Name',
          type: FieldType.TEXT,
        };

        expect(field.key).toBe('name');
        expect(field.label).toBe('Name');
        expect(field.type).toBe(FieldType.TEXT);
      });

      it('should accept string type for custom types', () => {
        const field: FieldSchema = {
          key: 'custom',
          label: 'Custom Field',
          type: 'custom-type',
        };

        expect(field.type).toBe('custom-type');
      });

      it('should accept nested fields', () => {
        const field: FieldSchema = {
          key: 'parent',
          label: 'Parent Field',
          type: FieldType.ARRAY,
          isNested: true,
          nestedFields: [
            { key: 'child1', label: 'Child 1', type: FieldType.TEXT },
            { key: 'child2', label: 'Child 2', type: FieldType.NUMBER },
          ],
        };

        expect(field.isNested).toBe(true);
        expect(field.nestedFields).toHaveLength(2);
      });
    });

    describe('TabSchema', () => {
      it('should accept tab definition with fields', () => {
        const tab: TabSchema = {
          key: 'general',
          label: 'General Info',
          icon: 'info',
          order: 0,
          fields: [{ key: 'name', label: 'Name', type: FieldType.TEXT }],
        };

        expect(tab.key).toBe('general');
        expect(tab.label).toBe('General Info');
        expect(tab.icon).toBe('info');
        expect(tab.order).toBe(0);
        expect(tab.fields).toHaveLength(1);
      });
    });

    describe('ElementTypeSchema', () => {
      it('should accept complete schema definition', () => {
        const schema: ElementTypeSchema = {
          id: 'character-schema',
          name: 'Character',
          icon: 'person',
          description: 'A character template',
          version: 1,
          isBuiltIn: true,
          tabs: [
            {
              key: 'basic',
              label: 'Basic Info',
              fields: [{ key: 'name', label: 'Name', type: FieldType.TEXT }],
            },
          ],
          defaultValues: { name: 'New Character' },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        };

        expect(schema.id).toBe('character-schema');
        expect(schema.isBuiltIn).toBe(true);
        expect(schema.tabs).toHaveLength(1);
        expect(schema.defaultValues).toEqual({ name: 'New Character' });
      });
    });
  });
});
