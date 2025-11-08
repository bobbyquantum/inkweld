/**
 * Project management OpenAPI schemas
 */
import { z } from 'zod';
import 'zod-openapi/extend';

/**
 * Project information
 * @component Project
 */
export const ProjectSchema = z
  .object({
    id: z.string().openapi({ example: 'proj-123' }),
    slug: z.string().openapi({ example: 'my-novel' }),
    title: z.string().openapi({ example: 'My Novel' }),
    description: z
      .string()
      .nullable()
      .optional()
      .openapi({ example: 'A thrilling adventure story' }),
    username: z.string().openapi({ example: 'johndoe' }),
    createdDate: z.string().datetime().openapi({ example: '2023-01-01T00:00:00.000Z' }),
    updatedDate: z.string().datetime().openapi({ example: '2023-01-01T00:00:00.000Z' }),
  })
  .openapi({ ref: 'Project' });

/**
 * Project creation request
 * @component CreateProjectRequest
 */
export const CreateProjectRequestSchema = z
  .object({
    slug: z
      .string()
      .min(3)
      .regex(/^[a-z0-9-]+$/)
      .openapi({
        example: 'my-novel',
        description: 'URL-friendly project identifier (lowercase, numbers, hyphens only)',
      }),
    title: z.string().min(1).openapi({ example: 'My Novel', description: 'Project title' }),
    description: z
      .string()
      .optional()
      .openapi({ example: 'A thrilling adventure story', description: 'Project description' }),
  })
  .openapi({ ref: 'CreateProjectRequest' });

/**
 * Project update request
 * @component UpdateProjectRequest
 */
export const UpdateProjectRequestSchema = z
  .object({
    title: z
      .string()
      .min(1)
      .optional()
      .openapi({ example: 'My Updated Novel', description: 'Project title' }),
    description: z.string().optional().openapi({
      example: 'An updated thrilling adventure story',
      description: 'Project description',
    }),
  })
  .openapi({ ref: 'UpdateProjectRequest' });

/**
 * Projects list response
 * @component ProjectsListResponse
 */
export const ProjectsListResponseSchema = z
  .array(ProjectSchema)
  .openapi({ ref: 'ProjectsListResponse' });
