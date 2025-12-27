import { eq, asc } from 'drizzle-orm';
import type { DatabaseInstance } from '../types/context';
import {
  imageModelProfiles,
  ImageModelProfile,
  InsertImageModelProfile,
  IMAGE_PROVIDERS,
  type ImageProvider,
} from '../db/schema/image-model-profiles';

/**
 * Public representation of an image model profile (for API responses)
 */
export interface PublicImageModelProfile {
  id: string;
  name: string;
  description: string | null;
  provider: ImageProvider;
  modelId: string;
  enabled: boolean;
  supportsImageInput: boolean;
  supportsCustomResolutions: boolean;
  supportedSizes: string[] | null;
  defaultSize: string | null;
  sortOrder: number;
}

/**
 * Full profile with config (for admin responses)
 */
export interface AdminImageModelProfile extends PublicImageModelProfile {
  modelConfig: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Convert database profile to public representation (hides internal config)
 */
export function toPublicProfile(profile: ImageModelProfile): PublicImageModelProfile {
  return {
    id: profile.id,
    name: profile.name,
    description: profile.description,
    provider: profile.provider as ImageProvider,
    modelId: profile.modelId,
    enabled: profile.enabled,
    supportsImageInput: profile.supportsImageInput,
    supportsCustomResolutions: profile.supportsCustomResolutions,
    supportedSizes: profile.supportedSizes,
    defaultSize: profile.defaultSize,
    sortOrder: profile.sortOrder,
  };
}

/**
 * Convert database profile to admin representation (includes config)
 */
export function toAdminProfile(profile: ImageModelProfile): AdminImageModelProfile {
  return {
    ...toPublicProfile(profile),
    modelConfig: profile.modelConfig,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

/**
 * Validate that a provider string is valid
 */
export function isValidProvider(provider: string): provider is ImageProvider {
  return IMAGE_PROVIDERS.includes(provider as ImageProvider);
}

/**
 * Input for creating a new profile
 */
export interface CreateProfileInput {
  name: string;
  description?: string;
  provider: ImageProvider;
  modelId: string;
  enabled?: boolean;
  supportsImageInput?: boolean;
  supportsCustomResolutions?: boolean;
  supportedSizes?: string[];
  defaultSize?: string;
  modelConfig?: Record<string, unknown>;
  sortOrder?: number;
}

/**
 * Input for updating a profile
 */
export interface UpdateProfileInput {
  name?: string;
  description?: string | null;
  provider?: ImageProvider;
  modelId?: string;
  enabled?: boolean;
  supportsImageInput?: boolean;
  supportsCustomResolutions?: boolean;
  supportedSizes?: string[] | null;
  defaultSize?: string | null;
  modelConfig?: Record<string, unknown> | null;
  sortOrder?: number;
}

/**
 * Service for managing image model profiles
 */
class ImageProfileService {
  /**
   * List all profiles (admin view with full details)
   */
  async listAll(db: DatabaseInstance): Promise<AdminImageModelProfile[]> {
    const profiles = await db
      .select()
      .from(imageModelProfiles)
      .orderBy(asc(imageModelProfiles.sortOrder), asc(imageModelProfiles.name));

    return profiles.map(toAdminProfile);
  }

  /**
   * List enabled profiles (user view, hides internal config)
   */
  async listEnabled(db: DatabaseInstance): Promise<PublicImageModelProfile[]> {
    const profiles = await db
      .select()
      .from(imageModelProfiles)
      .where(eq(imageModelProfiles.enabled, true))
      .orderBy(asc(imageModelProfiles.sortOrder), asc(imageModelProfiles.name));

    return profiles.map(toPublicProfile);
  }

  /**
   * Get the first enabled profile (for MCP tools when no profile specified)
   */
  async getFirstEnabled(db: DatabaseInstance): Promise<ImageModelProfile | null> {
    const [profile] = await db
      .select()
      .from(imageModelProfiles)
      .where(eq(imageModelProfiles.enabled, true))
      .orderBy(asc(imageModelProfiles.sortOrder), asc(imageModelProfiles.name))
      .limit(1);

    return profile || null;
  }

  /**
   * Get a profile by ID
   */
  async getById(db: DatabaseInstance, id: string): Promise<ImageModelProfile | null> {
    const [profile] = await db
      .select()
      .from(imageModelProfiles)
      .where(eq(imageModelProfiles.id, id))
      .limit(1);

    return profile || null;
  }

  /**
   * Get a profile by name
   */
  async getByName(db: DatabaseInstance, name: string): Promise<ImageModelProfile | null> {
    const [profile] = await db
      .select()
      .from(imageModelProfiles)
      .where(eq(imageModelProfiles.name, name))
      .limit(1);

    return profile || null;
  }

  /**
   * Create a new profile
   */
  async create(db: DatabaseInstance, input: CreateProfileInput): Promise<ImageModelProfile> {
    // Validate provider
    if (!isValidProvider(input.provider)) {
      throw new Error(`Invalid provider: ${input.provider}`);
    }

    // Check for duplicate name
    const existing = await this.getByName(db, input.name);
    if (existing) {
      throw new Error(`Profile with name "${input.name}" already exists`);
    }

    const profileData: InsertImageModelProfile = {
      name: input.name,
      description: input.description ?? null,
      provider: input.provider,
      modelId: input.modelId,
      enabled: input.enabled ?? true,
      supportsImageInput: input.supportsImageInput ?? false,
      supportedSizes: input.supportedSizes ?? null,
      defaultSize: input.defaultSize ?? null,
      modelConfig: input.modelConfig ?? null,
      sortOrder: input.sortOrder ?? 0,
    };

    await db.insert(imageModelProfiles).values(profileData);

    // Fetch the created record
    const created = await this.getByName(db, input.name);
    if (!created) {
      throw new Error('Failed to create profile');
    }

    return created;
  }

  /**
   * Update an existing profile
   */
  async update(
    db: DatabaseInstance,
    id: string,
    input: UpdateProfileInput
  ): Promise<ImageModelProfile> {
    const existing = await this.getById(db, id);
    if (!existing) {
      throw new Error(`Profile not found: ${id}`);
    }

    // If changing name, check for duplicates
    if (input.name && input.name !== existing.name) {
      const duplicate = await this.getByName(db, input.name);
      if (duplicate) {
        throw new Error(`Profile with name "${input.name}" already exists`);
      }
    }

    // Validate provider if provided
    if (input.provider && !isValidProvider(input.provider)) {
      throw new Error(`Invalid provider: ${input.provider}`);
    }

    const updateData: Partial<ImageModelProfile> = {
      ...input,
      updatedAt: new Date(),
    };

    await db.update(imageModelProfiles).set(updateData).where(eq(imageModelProfiles.id, id));

    const updated = await this.getById(db, id);
    if (!updated) {
      throw new Error('Failed to update profile');
    }

    return updated;
  }

  /**
   * Delete a profile
   */
  async delete(db: DatabaseInstance, id: string): Promise<void> {
    const existing = await this.getById(db, id);
    if (!existing) {
      throw new Error(`Profile not found: ${id}`);
    }

    await db.delete(imageModelProfiles).where(eq(imageModelProfiles.id, id));
  }

  /**
   * Get the internal config for a profile (used by image generation service)
   */
  async getProfileConfig(
    db: DatabaseInstance,
    profileId: string
  ): Promise<{
    provider: ImageProvider;
    modelId: string;
    modelConfig: Record<string, unknown> | null;
    supportsImageInput: boolean;
    supportedSizes: string[] | null;
    defaultSize: string | null;
  } | null> {
    const profile = await this.getById(db, profileId);
    if (!profile || !profile.enabled) {
      return null;
    }

    return {
      provider: profile.provider as ImageProvider,
      modelId: profile.modelId,
      modelConfig: profile.modelConfig,
      supportsImageInput: profile.supportsImageInput,
      supportedSizes: profile.supportedSizes,
      defaultSize: profile.defaultSize,
    };
  }
}

export const imageProfileService = new ImageProfileService();
