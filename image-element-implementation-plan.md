# Image Element Implementation Plan

## 1. Data Model Updates

### Project Element Type Extension

```typescript
// In project-element.dto.ts
export namespace ProjectElementDto {
  export type TypeEnum = "FOLDER" | "ITEM" | "IMAGE";
  export const TypeEnum = {
    Folder: "FOLDER" as TypeEnum,
    Item: "ITEM" as TypeEnum,
    Image: "IMAGE" as TypeEnum,
  };
}
```

### Metadata System

```typescript
// New interfaces in project-element.dto.ts
export interface ProjectElementMetadata {
  version: number; // For change detection
  contentType?: string; // MIME type for images
  size?: number; // File size in bytes
  lastModified?: Date; // Last modification timestamp
  originalFilename?: string; // Original uploaded filename
}

// Update ProjectElementDto
export interface ProjectElementDto {
  // ... existing fields ...
  metadata?: ProjectElementMetadata;
}
```

## 2. Storage Implementation

### File System Structure

```
./data/projects/
  ├── {userId}/
  │   ├── {projectSlug}/
  │   │   ├── {elementId}.jpg
  │   │   ├── {elementId}.png
  │   │   └── ...
  │   └── ...
  └── ...
```

### Storage Service

- Create new service to handle file system operations
- Implement methods for:
  - Saving uploaded images
  - Reading images for download
  - Deleting images
  - Managing directory structure

## 3. Backend Implementation

### Controller Updates

- Add new endpoints with proper OpenAPI/Swagger annotations:

  ```typescript
  @ApiOperation({ summary: 'Upload image for project element' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary'
        }
      }
    }
  })
  @Post(':elementId/image')
  uploadImage()

  @ApiOperation({ summary: 'Download image for project element' })
  @ApiProduces('image/*')
  @Get(':elementId/image')
  downloadImage()

  @ApiOperation({ summary: 'Delete image for project element' })
  @Delete(':elementId/image')
  deleteImage()
  ```

### Service Layer

- Extend project element service to handle image type
- Implement image file handling with streams
- Update metadata management
- Integrate with existing project element lifecycle

### File Handling

- Accept common web image formats (jpg, png, gif, webp, etc.)
- Stream file uploads/downloads for efficiency
- Generate unique filenames based on elementId
- Maintain original file extensions

## 4. API Client Generation

### OpenAPI Generation

1. After implementing controller endpoints with proper annotations:
   ```bash
   cd worm-server
   bun run generate:openapi
   ```
   This will update openapi.json

### Angular Client Generation

2. Generate updated Angular client:
   ```bash
   cd worm-server
   bun run generate:angular-client
   ```
   This will update the frontend API client with new endpoints and types

## 5. Frontend Implementation

### Model Updates

- Use generated types from API client
- Add image-specific utility functions

### Component Updates

#### Project Tree

- Add image type icon/indicator
- Handle image element selection
- Update context menu for image elements

#### Image Element Editor

- Create new component for image elements
- Implement:
  - Image upload interface using generated API client
  - Image preview
  - Basic metadata display
  - Replace image functionality

#### Project Component

- Update to handle image elements
- Integrate image editor component
- Handle image element creation

### Service Updates

- Use generated API client for image operations
- Update project element handling for images
- Implement change detection based on metadata version

## 6. Testing Plan

### Backend Tests

- Test image upload/download endpoints
- Verify file system operations
- Test metadata management
- Test error conditions and edge cases

### Frontend Tests

- Test image element creation
- Test upload/download functionality
- Test UI components
- Test error handling and user feedback

## 7. Migration Plan

### Data Migration

- No migration needed for existing elements
- New image elements will be created with new type

### Code Deployment

1. Deploy backend changes
2. Deploy frontend changes
3. Verify file system permissions and structure

## 8. Documentation Updates

### API Documentation

- Documentation will be automatically generated from OpenAPI annotations
- Review and update annotations as needed for clarity

### User Documentation

- Document image support
- Document supported formats
- Document any limitations

## Implementation Phases

### Phase 1: Core Infrastructure

1. Update data models and DTOs with proper annotations
2. Implement file system structure
3. Create basic backend endpoints

### Phase 2: Backend Implementation

1. Implement file handling
2. Add metadata support
3. Update existing services
4. Generate OpenAPI spec and verify

### Phase 3: Frontend Implementation

1. Generate Angular client
2. Update project tree
3. Create image editor component
4. Integrate with existing UI

### Phase 4: Testing & Documentation

1. Implement test cases
2. Update documentation
3. Perform integration testing

## Notes

- No size restrictions implemented
- Support all browser-compatible image formats
- No image optimization/processing on upload
- Focus on high-quality image support for novel writing use case
- API client code should not be edited directly, always regenerate from OpenAPI spec
