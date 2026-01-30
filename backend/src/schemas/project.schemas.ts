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
    slug: z
      .string()
      .min(3)
      .regex(/^[a-z0-9-]+$/)
      .optional()
      .openapi({
        description:
          'Updated URL-friendly project identifier (lowercase, numbers, hyphens only). Changing this will update the project URL.',
        example: 'my-renamed-novel',
      }),
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
 * Project rename redirect response - returned when accessing old slug
 * @component ProjectRenameRedirect
 */
export const ProjectRenameRedirectSchema = z
  .object({
    renamed: z.literal(true).openapi({ description: 'Indicates this is a redirect response' }),
    oldSlug: z.string().openapi({ description: 'The old slug that was requested' }),
    newSlug: z.string().openapi({ description: 'The new slug to redirect to' }),
    username: z.string().openapi({ description: 'Project owner username' }),
    renamedAt: z.string().datetime().openapi({ description: 'When the rename occurred' }),
  })
  .openapi('ProjectRenameRedirect');

/**
 * Project tombstone - indicates a project was deleted
 * @component ProjectTombstone
 */
export const ProjectTombstoneSchema = z
  .object({
    username: z.string().openapi({ description: 'The owner username of the deleted project' }),
    slug: z.string().openapi({ description: 'The slug of the deleted project' }),
    deletedAt: z.string().datetime().openapi({ description: 'When the project was deleted' }),
  })
  .openapi('ProjectTombstone');

/**
 * Check tombstones request - for batch checking multiple project keys
 * @component CheckTombstonesRequest
 */
export const CheckTombstonesRequestSchema = z
  .object({
    projectKeys: z
      .array(z.string())
      .min(1)
      .max(100)
      .openapi({
        description:
          'List of project keys (username/slug format) to check for tombstones (max 100)',
        example: ['alice/my-project', 'bob/another-project'],
      }),
  })
  .openapi('CheckTombstonesRequest');

/**
 * Check tombstones response
 * @component CheckTombstonesResponse
 */
export const CheckTombstonesResponseSchema = z
  .object({
    tombstones: z.array(ProjectTombstoneSchema).openapi({
      description: 'List of tombstones found for the requested slugs',
    }),
  })
  .openapi('CheckTombstonesResponse');

/**
 * Projects list response
 * @component ProjectsListResponse
 */
export const ProjectsListResponseSchema = z.array(ProjectSchema).openapi('ProjectsListResponse');
