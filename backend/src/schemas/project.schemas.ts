/**
 * Project management OpenAPI schemas
 */
import { z } from '@hono/zod-openapi';

/**
 * Project information
 * @component Project
 */
export const ProjectSchema = z
  .object({
    id: z.string().openapi({ description: 'Unique project identifier' }),
    slug: z.string().openapi({ description: 'URL-friendly project identifier' }),
    title: z.string().openapi({ description: 'Project title' }),
    description: z.string().nullable().optional().openapi({ description: 'Project description' }),
    username: z.string().openapi({ description: 'Project owner username' }),
    coverImage: z.string().nullable().optional().openapi({ description: 'Cover image URL' }),
    minClientVersion: z.string().nullable().optional().openapi({
      description:
        'Minimum client version required to open this project. If null, any client version is acceptable.',
      example: '0.2.0',
    }),
    createdDate: z.string().datetime().openapi({ description: 'Project creation date' }),
    updatedDate: z.string().datetime().openapi({ description: 'Last update date' }),
    // Access permissions (only set when user is authenticated)
    access: z
      .object({
        isOwner: z.boolean().openapi({ description: 'Whether user is project owner' }),
        canRead: z.boolean().openapi({ description: 'Whether user can read project content' }),
        canWrite: z.boolean().openapi({ description: 'Whether user can edit project content' }),
        canAdmin: z
          .boolean()
          .openapi({ description: 'Whether user can manage project settings and collaborators' }),
        role: z
          .enum(['viewer', 'editor', 'admin'])
          .nullable()
          .openapi({ description: 'Collaborator role if not owner' }),
      })
      .optional()
      .openapi({ description: 'User access permissions for this project' }),
  })
  .openapi('Project');

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
        description: 'URL-friendly project identifier (lowercase, numbers, hyphens only)',
        example: 'my-novel',
      }),
    title: z.string().min(1).openapi({ description: 'Project title', example: 'My Novel' }),
    description: z.string().optional().openapi({ description: 'Optional project description' }),
  })
  .openapi('CreateProjectRequest');

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
      .openapi({ description: 'Updated project title', example: 'My Updated Novel' }),
    description: z.string().optional().openapi({ description: 'Updated project description' }),
    minClientVersion: z.string().nullable().optional().openapi({
      description:
        'Minimum client version required to open this project. Set to null to remove the requirement.',
      example: '0.2.0',
    }),
  })
  .openapi('UpdateProjectRequest');

/**
 * Projects list response
 * @component ProjectsListResponse
 */
export const ProjectsListResponseSchema = z.array(ProjectSchema).openapi('ProjectsListResponse');
