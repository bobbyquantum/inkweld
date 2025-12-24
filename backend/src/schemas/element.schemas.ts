import { z } from '@hono/zod-openapi';

/**
 * Element type enum
 * @component ElementType
 */
export const ELEMENT_TYPES = ['FOLDER', 'ITEM', 'WORLDBUILDING'] as const;

export const ElementTypeSchema = z.enum(ELEMENT_TYPES).openapi('ElementType');

/**
 * Element information
 * @component Element
 */
export const ElementSchema = z
  .object({
    id: z.string().openapi({ example: 'elem-123', description: 'Element ID' }),
    name: z.string().openapi({ example: 'Chapter 1', description: 'Element name' }),
    type: ElementTypeSchema,
    parentId: z.string().nullable().openapi({ example: null, description: 'Parent element ID' }),
    order: z.number().openapi({ example: 0, description: 'Order in parent' }),
    level: z.number().openapi({ example: 0, description: 'Nesting level in tree hierarchy' }),
    expandable: z
      .boolean()
      .openapi({ example: false, description: 'Whether element can be expanded (folders)' }),
    version: z
      .number()
      .openapi({ example: 1, description: 'Version number for optimistic locking' }),
    schemaId: z
      .string()
      .optional()
      .openapi({ example: 'char-schema', description: 'Schema ID for worldbuilding elements' }),
    metadata: z
      .record(z.string(), z.string())
      .openapi({ description: 'Element metadata key-value pairs' }),
    createdAt: z
      .string()
      .optional()
      .openapi({ example: '2023-01-01T00:00:00.000Z', description: 'Creation timestamp' }),
    updatedAt: z
      .string()
      .optional()
      .openapi({ example: '2023-01-01T00:00:00.000Z', description: 'Last update timestamp' }),
  })
  .openapi('Element');

export type ElementType = z.infer<typeof ElementTypeSchema>;
export type Element = z.infer<typeof ElementSchema>;

/**
 * Element error response
 * @component ElementError
 */
export const ElementErrorSchema = z
  .object({
    error: z.string().openapi({ example: 'An error occurred', description: 'Error message' }),
  })
  .openapi('ElementError');
