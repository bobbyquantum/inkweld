# R2 Storage Migration Guide

## Overview

Inkweld backend now supports **Cloudflare R2** for file storage, replacing the filesystem-based approach with a cloud-compatible solution. This enables deployment to Cloudflare Workers free tier and other serverless platforms.

## What Changed

### Files Stored in R2

All project-related files now use R2 storage:

- **Project covers** (`cover.jpg`) - Processed cover images for projects
- **Project files** - User-uploaded files (e.g., exported EPUBs, PDFs, etc.)
- **User avatars** - Profile pictures stored as `avatars/{username}.png`

### Storage Hierarchy

R2 uses a key-based storage with the following structure:

```text
inkweld-storage/
├── {username}/
│   └── {project-slug}/
│       ├── cover.jpg
│       ├── exported.epub
│       └── {other-files}
└── avatars/
    └── {username}.png
```

This mirrors the previous filesystem structure but is stored in R2.

## Implementation Details

### Core Services

1. **`r2-storage.service.ts`** - Direct R2 operations using Cloudflare's R2 API
2. **`storage.service.ts`** - Unified storage interface that works with both R2 and filesystem
3. **`file-storage.service.ts`** - Existing filesystem service (fallback for local dev)

### Automatic Fallback

The storage service automatically detects the runtime environment:

- **Cloudflare Workers**: Uses R2 when `STORAGE` binding is available
- **Local Development (Bun/Node)**: Falls back to filesystem storage

```typescript
// In route handlers
const storage = getStorageService(c.get('storage'));
await storage.saveProjectFile(username, slug, 'cover.jpg', imageBuffer, 'image/jpeg');
```

### Updated Routes

The following routes now support R2:

- `POST /api/images/:username/:slug/cover` - Upload cover image
- `GET /api/images/:username/:slug/cover` - Download cover image
- `DELETE /api/images/:username/:slug/cover` - Delete cover image
- `GET /api/v1/projects/:username/:slug/files` - List project files
- `GET /api/v1/projects/:username/:slug/files/:storedName` - Download file
- `POST /api/v1/projects/:username/:slug/files` - Upload file
- `DELETE /api/v1/projects/:username/:slug/files/:storedName` - Delete file

## Cloudflare Setup

### 1. Create R2 Bucket

```bash
cd backend
npx wrangler r2 bucket create inkweld-storage
```

For preview/development:

```bash
npx wrangler r2 bucket create inkweld-storage-preview
```

### 2. Configure wrangler.toml

The R2 binding is already configured in `wrangler.toml`:

```toml
[[r2_buckets]]
binding = "STORAGE"
bucket_name = "inkweld-storage"
preview_bucket_name = "inkweld-storage-preview"
```

For local development, you can override in `wrangler.toml.local`:

```toml
[[r2_buckets]]
binding = "STORAGE"
bucket_name = "inkweld-storage-dev"
```

### 3. Deploy

```bash
bun run deploy:dev    # Deploy to dev environment
bun run deploy:prod   # Deploy to production
```

## Local Development

### With R2 (Cloudflare Workers)

```bash
# Uses wrangler dev with R2 bindings
bun run dev:worker
```

### Without R2 (Filesystem Fallback)

```bash
# Uses local filesystem in ./data/
bun run dev
```

The filesystem fallback stores files in:

```text
backend/data/
├── {username}/
│   └── {project-slug}/
│       └── cover.jpg
└── avatars/
    └── {username}.png
```

## Migration Strategy

### Existing Data

If you have existing projects with files in the filesystem:

1. **Development**: Continue using filesystem storage (`bun run dev`)
2. **Production**: Use a migration script to copy existing files to R2

### Migration Script (TODO)

```bash
# Copy all files from filesystem to R2
bun run admin migrate:r2
```

This will:

- Scan `data/` directory
- Upload all files to R2 with proper keys
- Verify uploads
- Optionally delete local files after successful upload

## API Changes

### For Frontend/Clients

**No changes required!** The API endpoints remain the same. The storage backend is transparent to clients.

### For Backend Developers

When adding new file operations:

```typescript
// ✅ Correct - Use unified storage service
import { getStorageService } from '../services/storage.service';

const storage = getStorageService(c.get('storage'));
await storage.saveProjectFile(username, slug, filename, data, contentType);

// ❌ Wrong - Don't use FileStorageService directly
import { fileStorageService } from '../services/file-storage.service';
await fileStorageService.saveProjectFile(username, slug, filename, data);
```

## Testing

### Unit Tests

Storage services should be mocked in tests:

```typescript
// Mock storage in tests
const mockStorage = {
  saveProjectFile: vi.fn(),
  readProjectFile: vi.fn(),
  projectFileExists: vi.fn(),
  // ... other methods
};
```

### Integration Tests

Test against real R2 in preview environment:

```bash
bun run test:integration --env dev
```

## Costs & Limits

### Cloudflare R2 Free Tier

- **Storage**: 10 GB/month
- **Class A operations** (writes): 1 million/month
- **Class B operations** (reads): 10 million/month
- **Egress**: Free (no egress charges!)

### Typical Usage

For a small creative writing platform:

- **Cover images**: ~500 KB each
- **EPUB exports**: ~1-5 MB each
- **Avatars**: ~100 KB each

10 GB can store:

- ~20,000 cover images
- ~2,000-10,000 EPUB files
- ~100,000 avatars

## Troubleshooting

### R2 binding not found

```text
Error: R2 bucket binding (STORAGE) not found
```

**Solution**: Make sure you've created the R2 bucket and configured `wrangler.toml`:

```bash
npx wrangler r2 bucket create inkweld-storage
```

### Local development uses R2 instead of filesystem

If you want to test with filesystem locally:

```bash
# Use Bun runtime (not Workers)
bun run dev
```

### Files not appearing in R2

Check the R2 bucket contents:

```bash
npx wrangler r2 object list inkweld-storage
```

## Future Enhancements

### Planned Features

1. **Automatic migration script** - Move existing filesystem data to R2
2. **R2 presigned URLs** - Direct client uploads for large files
3. **Image optimization** - Cloudflare Images integration for cover images
4. **CDN caching** - Leverage Cloudflare CDN for static assets
5. **Backup/sync** - Periodic backups to external storage

### Potential Optimizations

- Use R2 multipart uploads for files >100 MB
- Implement content-based deduplication
- Add file compression before storage
- Stream large files instead of buffering

## Related Files

- `backend/src/services/r2-storage.service.ts` - R2 implementation
- `backend/src/services/storage.service.ts` - Unified interface
- `backend/src/services/file-storage.service.ts` - Filesystem fallback
- `backend/src/routes/image.routes.ts` - Cover image endpoints
- `backend/src/routes/file.routes.ts` - File management endpoints
- `backend/src/middleware/database.d1.middleware.ts` - R2 binding injection
- `backend/wrangler.toml` - R2 configuration

## Questions?

See also:

- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Wrangler R2 Commands](https://developers.cloudflare.com/workers/wrangler/commands/#r2)
