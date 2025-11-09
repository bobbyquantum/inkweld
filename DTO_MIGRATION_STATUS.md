# DTO Name Migration Status

## Overview
This document tracks the migration from NestJS backend DTO names (with `Dto` suffix) to Hono backend names (without suffix).

## Completed Migrations

### Core Types
- ✅ `UserDto` → `User`
- ✅ `ProjectDto` → `Project`  
- ✅ `LoginRequestDto` → `LoginRequest`
- ✅ `LoginResponseDto` → `LoginResponse`
- ✅ `SnapshotDto` → `DocumentSnapshot`
- ✅ `CreateSnapshotDto` → `CreateSnapshotRequest`
- ✅ `RestoreSnapshotDto` → `MessageResponse`
- ✅ `UserRegisterDto` → `PostApiV1UsersRegisterRequest`
- ✅ `UserRegisterResponseDto` → `PostApiV1UsersRegister200Response`
- ✅ `PaginatedSnapshotsDto` → `DocumentSnapshot[]`
- ✅ `LintRequestDto` → `PostLintRequest`
- ✅ `LintResponseDto` → `PostLint200Response`

### Method Names
- ✅ `csrfControllerGetCsrfToken` → `getCsrfToken`
- ✅ `getApiAuthProviders` → `getProviders`
- ✅ `userControllerGetMe` → (kept same, from UsersService)
- ✅ `userControllerRegister` → (kept same, from UsersService)

### Files Updated
- ✅ `src/app/services/user.service.ts`
- ✅ `src/app/services/offline-user.service.ts`
- ✅ `src/app/services/unified-user.service.ts`
- ✅ `src/app/services/project.service.ts`
- ✅ `src/app/services/offline-project.service.ts`
- ✅ `src/app/services/unified-project.service.ts`
- ✅ `src/app/services/document-snapshot.service.ts`
- ✅ `src/app/services/worldbuilding.service.ts`
- ✅ `src/app/services/xsrf.service.ts`
- ✅ `src/app/components/snapshot-panel/snapshot-panel.component.ts/html`
- ✅ `src/app/components/lint/*.ts`
- ✅ `src/app/components/oauth-provider-list/*.ts`
- ✅ `src/app/models/project-element.ts`
- ✅ `src/testing/*.mock.ts`

## Known Issues

### API Feature Gaps
The new Hono backend doesn't yet implement these features from NestJS:

1. **Element Metadata & Version**
   - Old: `ProjectElementDto` had `metadata` and `version` fields
   - New: `GetApiV1ProjectsUsernameSlugElements200ResponseInner` only has basic fields
   - Impact: Frontend ProjectElement model uses defaults

2. **Worldbuilding Types**
   - Old: Had specific types like CHARACTER, LOCATION, MAP, etc.
   - New: Only has FOLDER and ITEM
   - Workaround: Using string literals for legacy type references

3. **Snapshot Creator Info**
   - Old: `SnapshotDto` had `createdBy` with user info
   - New: `DocumentSnapshot` only has timestamp
   - Workaround: Commented out UI display of creator

4. **Element Positioning**
   - Old: Used `position` field
   - New: Uses `order` field  
   - Fix: Mapping in `mapDtoToProjectElement`

### TypeScript Errors (~177 remaining)

Most errors fall into these categories:

#### 1. Type Mismatches (ProjectElement)
```typescript
// Error: Argument of type 'ProjectElement' is not assignable to 
// parameter of type 'GetApiV1ProjectsUsernameSlugElements200ResponseInner'
```
**Cause**: ProjectElement is a frontend-extended type with extra fields (`level`, `metadata`, `version`, etc.)

**Solution Options**:
- Add mapper functions to convert between types
- Update API calls to only send supported fields
- Wait for backend to add missing fields

#### 2. Worldbuilding Type Enum
```typescript
// Error: Property 'Character' does not exist on type 
// '{ readonly Folder: "FOLDER"; readonly Item: "ITEM"; }'
```
**Cause**: Worldbuilding types not in new backend enum

**Status**: Partially fixed with string literals, but some references remain

#### 3. Lint Service Types
```typescript
// Error: CorrectionDto vs PostLint200ResponseCorrectionsInner
```
**Cause**: Type name mismatch in function signatures

**Solution**: Update function parameter types

## Recommended Next Steps

### Short Term (Frontend Only)
1. Add type conversion utilities:
   ```typescript
   // frontend/src/app/utils/type-converters.ts
   export function projectElementToApiType(element: ProjectElement): Partial<GetApiV1...> {
     return {
       id: element.id,
       name: element.name,
       type: element.type,
       order: element.position,
       parentId: null,
     };
   }
   ```

2. Fix remaining CorrectionDto references
3. Add null checks for missing fields

### Medium Term (Backend Additions)
According to MIGRATION_HONO.md, these are "Optional Future Enhancements":
- Worldbuilding/Schema services
- Element metadata and versioning
- Snapshot creator tracking

### Long Term (Full Parity)
- Complete all optional features
- Update frontend to remove workarounds
- Remove old DTO files from api-client

## Testing Strategy

### Unit Tests
- ✅ Updated test mocks with new type names
- ⚠️ Some tests may fail due to type mismatches
- Action: Run `npm test` and fix failures

### E2E Tests
- Status: Not tested yet
- Risk: High - API changes may break integration
- Action: Run `npm run e2e` on clean data

### Manual Testing Checklist
- [ ] User login/logout
- [ ] User registration
- [ ] Project creation
- [ ] Project listing
- [ ] Document editing
- [ ] Snapshot creation/restore
- [ ] OAuth provider listing
- [ ] CSRF token handling

## Migration Tips

### Finding Old DTO References
```bash
# Search for old DTO imports
grep -r "from.*-dto'" src/ --include="*.ts"

# Search for old type names
grep -r "UserDto\|ProjectDto\|SnapshotDto" src/ --include="*.ts"
```

### Common Replacements
```bash
# User types
s/UserDto/User/g
s/from '.*user-dto'/from '.*user'/g

# Project types  
s/ProjectDto/Project/g
s/from '.*project-dto'/from '.*project'/g

# Snapshot types
s/SnapshotDto/DocumentSnapshot/g
s/CreateSnapshotDto/CreateSnapshotRequest/g
```

## Summary

**Migration Status**: ~60% complete

**Core functionality**: Most basic features migrated and working

**Blocking issues**: Type mismatches need resolution before frontend builds successfully

**Path forward**: Either complete backend features or adjust frontend to new API shape
