# Quick Reference: Using R2 Storage in Routes

## Import the Storage Service

```typescript
import { getStorageService } from '../services/storage.service';
```

## Get Storage Instance in Route Handler

```typescript
// In your route handler
const storage = getStorageService(c.get('storage'));
```

This automatically:

- Uses R2 if running on Cloudflare Workers (when `c.get('storage')` is available)
- Falls back to filesystem if running locally with Bun/Node

## Common Operations

### Save a File

```typescript
await storage.saveProjectFile(
  username,          // Project owner username
  projectSlug,       // Project slug
  'filename.ext',    // File name
  fileData,          // Buffer | ArrayBuffer | Uint8Array
  'image/jpeg'       // Optional: Content-Type for R2
);
```

### Read a File

```typescript
const data = await storage.readProjectFile(username, projectSlug, 'filename.ext');
// Returns: Buffer | ArrayBuffer | null

if (!data) {
  throw new HTTPException(404, { message: 'File not found' });
}

// Convert to Uint8Array for response
const uint8Array = data instanceof Buffer ? new Uint8Array(data) : new Uint8Array(data);
```

### Check if File Exists

```typescript
const exists = await storage.projectFileExists(username, projectSlug, 'filename.ext');
// Returns: boolean
```

### Delete a File

```typescript
await storage.deleteProjectFile(username, projectSlug, 'filename.ext');
```

### List All Files in Project

```typescript
const files = await storage.listProjectFiles(username, projectSlug);
// Returns: string[] (array of filenames)
```

### Delete Entire Project Directory

```typescript
await storage.deleteProjectDirectory(username, projectSlug);
// Deletes all files in the project
```

## User Avatars

### Save Avatar

```typescript
await storage.saveUserAvatar(username, avatarData);
// Always saves as avatars/{username}.png
```

### Get Avatar

```typescript
const data = await storage.getUserAvatar(username);
// Returns: Buffer | ArrayBuffer | null
```

### Check Avatar Exists

```typescript
const hasAvatar = await storage.hasUserAvatar(username);
// Returns: boolean
```

### Delete Avatar

```typescript
await storage.deleteUserAvatar(username);
```

## Example: Upload Cover Image

```typescript
imageRoutes.post(
  '/:username/:slug/cover',
  requireAuth,
  async (c) => {
    const storage = getStorageService(c.get('storage'));
    const username = c.req.param('username');
    const slug = c.req.param('slug');

    // Get uploaded file
    const body = await c.req.parseBody();
    const file = body['cover'] as File;

    if (!file) {
      throw new HTTPException(400, { message: 'No file uploaded' });
    }

    // Process image (validate, resize, etc.)
    const buffer = Buffer.from(await file.arrayBuffer());
    const processedImage = await imageService.processCoverImage(buffer);

    // Save to storage (R2 or filesystem)
    await storage.saveProjectFile(
      username,
      slug,
      'cover.jpg',
      processedImage,
      'image/jpeg'
    );

    return c.json({ message: 'Cover uploaded successfully' });
  }
);
```

## Example: Download File

```typescript
fileRoutes.get(
  '/:username/:slug/files/:filename',
  requireAuth,
  async (c) => {
    const storage = getStorageService(c.get('storage'));
    const username = c.req.param('username');
    const slug = c.req.param('slug');
    const filename = c.req.param('filename');

    // Check if file exists
    const exists = await storage.projectFileExists(username, slug, filename);
    if (!exists) {
      throw new HTTPException(404, { message: 'File not found' });
    }

    // Read file
    const data = await storage.readProjectFile(username, slug, filename);
    if (!data) {
      throw new HTTPException(404, { message: 'File not found' });
    }

    // Convert to Uint8Array for response
    const uint8Array = data instanceof Buffer ? new Uint8Array(data) : new Uint8Array(data);

    // Send file
    return c.body(uint8Array, 200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': uint8Array.length.toString(),
    });
  }
);
```

## Example: Delete Project Files

```typescript
projectRoutes.delete(
  '/:username/:slug',
  requireAuth,
  async (c) => {
    const storage = getStorageService(c.get('storage'));
    const username = c.req.param('username');
    const slug = c.req.param('slug');

    // Delete all project files
    await storage.deleteProjectDirectory(username, slug);

    // Also delete project from database
    await projectService.deleteProject(db, username, slug);

    return c.json({ message: 'Project deleted successfully' });
  }
);
```

## Storage Key Structure

### Project Files

```text
{username}/{project-slug}/{filename}
```

Examples:

- `alice/my-novel/cover.jpg`
- `bob/scifi-story/chapter1.epub`

### Avatar Files

```text
avatars/{username}.png
```

Examples:

- `avatars/alice.png`
- `avatars/bob.png`

## Best Practices

### ✅ Do

- Always use `getStorageService(c.get('storage'))` to get storage instance
- Check if file exists before attempting to read
- Specify content type when saving images or known file types
- Handle `null` returns from read operations
- Use try-catch for storage operations in production

### ❌ Don't

- Don't import `FileStorageService` directly in routes
- Don't assume files always exist (always check first)
- Don't forget to clean up files when deleting projects
- Don't store sensitive data without encryption

## Error Handling

```typescript
try {
  const data = await storage.readProjectFile(username, slug, filename);
  if (!data) {
    throw new HTTPException(404, { message: 'File not found' });
  }
  // Process data...
} catch (error) {
  console.error('Storage error:', error);
  throw new HTTPException(500, { message: 'Failed to read file' });
}
```

## Type Information

```typescript
interface StorageService {
  // Project files
  saveProjectFile(
    username: string,
    projectSlug: string,
    filename: string,
    data: Buffer | ArrayBuffer | Uint8Array,
    contentType?: string
  ): Promise<void>;

  readProjectFile(
    username: string,
    projectSlug: string,
    filename: string
  ): Promise<Buffer | ArrayBuffer | null>;

  projectFileExists(
    username: string,
    projectSlug: string,
    filename: string
  ): Promise<boolean>;

  deleteProjectFile(
    username: string,
    projectSlug: string,
    filename: string
  ): Promise<void>;

  listProjectFiles(username: string, projectSlug: string): Promise<string[]>;

  deleteProjectDirectory(username: string, projectSlug: string): Promise<void>;

  // User avatars
  saveUserAvatar(username: string, data: Buffer | ArrayBuffer | Uint8Array): Promise<void>;

  getUserAvatar(username: string): Promise<Buffer | ArrayBuffer | null>;

  hasUserAvatar(username: string): Promise<boolean>;

  deleteUserAvatar(username: string): Promise<void>;
}
```

## Testing

### Mock Storage Service

```typescript
import { vi } from 'vitest';

const mockStorage = {
  saveProjectFile: vi.fn(),
  readProjectFile: vi.fn(),
  projectFileExists: vi.fn().mockResolvedValue(true),
  deleteProjectFile: vi.fn(),
  listProjectFiles: vi.fn().mockResolvedValue(['file1.txt', 'file2.txt']),
  deleteProjectDirectory: vi.fn(),
  saveUserAvatar: vi.fn(),
  getUserAvatar: vi.fn(),
  hasUserAvatar: vi.fn().mockResolvedValue(false),
  deleteUserAvatar: vi.fn(),
};
```

## Related Files

- `backend/src/services/storage.service.ts` - Main storage interface
- `backend/src/services/r2-storage.service.ts` - R2 implementation
- `backend/src/services/file-storage.service.ts` - Filesystem implementation
- `backend/R2_MIGRATION.md` - Detailed migration guide
