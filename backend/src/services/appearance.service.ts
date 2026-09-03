import { eq } from 'drizzle-orm';
import { users } from '../db/schema/users';
import type { DatabaseInstance } from '../types/context';
import { configService } from './config.service';
import { logger } from './logger.service';

/**
 * The two independently themeable background surfaces.
 *
 * - `login` covers the pre-auth pages (welcome/login, setup, approval-pending,
 *   password and passkey recovery). Nobody is signed in when they render, so
 *   only an admin can ever influence them.
 * - `home` covers the post-auth pages (home, create-project, user profile),
 *   where a user's own choice may take precedence.
 */
export const BACKGROUND_SURFACES = ['login', 'home'] as const;
export type BackgroundSurface = (typeof BACKGROUND_SURFACES)[number];

export function isBackgroundSurface(value: string): value is BackgroundSurface {
  return (BACKGROUND_SURFACES as readonly string[]).includes(value);
}

/**
 * Built-in background presets a user may choose from.
 *
 * The ids are duplicated in the frontend (`BACKGROUND_PRESETS` in
 * `frontend/src/app/config/background-presets.ts`), which owns the actual
 * visuals — all but `bundled` are pure CSS gradients, so nothing is stored
 * server-side. The list lives here too so a preference can be validated rather
 * than trusted, and the two must be kept in step.
 */
export const BACKGROUND_PRESET_IDS = [
  'bundled',
  'midnight',
  'dusk',
  'forest',
  'parchment',
  'slate',
  'none',
] as const;
export type BackgroundPresetId = (typeof BACKGROUND_PRESET_IDS)[number];

/** How a resolved background gets its image. */
export type BackgroundSource = 'default' | 'asset' | 'url';

export interface SurfaceBackground {
  source: BackgroundSource;
  /**
   * For `asset`, a server-relative API path (the client prefixes its server
   * URL). For `url`, the absolute external URL. Null for `default`, meaning
   * the client's own bundled image.
   */
  value: string | null;
}

/** What a user has chosen for their own post-auth background. */
export interface BackgroundPreference {
  /**
   * - `default` follows whatever the admin configured.
   * - `preset` uses one of {@link BACKGROUND_PRESET_IDS}.
   * - `upload` uses the image the user uploaded.
   */
  kind: 'default' | 'preset' | 'upload';
  presetId?: BackgroundPresetId;
}

/** Device-independent per-user UI preferences (the `users.preferences` JSON). */
export interface UserPreferences {
  background?: BackgroundPreference;
}

export interface AppearanceConfig {
  login: SurfaceBackground;
  home: SurfaceBackground;
  /**
   * Opacity of the scrim over the background image, or null to keep the
   * per-theme defaults (0.5 dark / 0.7 light).
   */
  overlayOpacity: number | null;
  /** Blur radius in pixels applied behind the scrim. 0 disables the effect. */
  blur: number;
  userBackgroundEnabled: boolean;
  userBackgroundUploadEnabled: boolean;
}

/** Public path serving an admin-uploaded background for a surface. */
export function brandingAssetPath(surface: BackgroundSurface, version: string): string {
  return `/api/v1/appearance/background/${surface}?v=${encodeURIComponent(version)}`;
}

/** Storage slot key for an admin-uploaded background. */
export function brandingSlotKey(surface: BackgroundSurface): string {
  return `background-${surface}`;
}

/**
 * Accept an external background URL only if it is an absolute http(s) URL and
 * contains nothing that could break out of the CSS `url("…")` token the client
 * builds from it. The client sanitises too, but a value that can never be
 * rendered safely has no business being served in the first place.
 */
export function isSafeExternalImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  // Quotes, parens, backslashes and whitespace would all let a value escape
  // the url("…") wrapper; control characters are never legitimate here.
  // eslint-disable-next-line no-control-regex -- deliberately rejecting control chars
  if (/["'()\\\s]|[\u0000-\u001f\u007f]/.test(trimmed)) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Clamp an admin-entered overlay opacity. Returns null when unset or
 * unparseable so the client keeps its per-theme defaults rather than snapping
 * to an arbitrary number.
 */
export function parseOverlayOpacity(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.min(0.95, Math.max(0, parsed));
}

/** Clamp an admin-entered blur radius to a sane pixel range. */
export function parseBlur(raw: string): number {
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.min(40, Math.round(parsed));
}

class AppearanceService {
  /**
   * Resolve one surface: uploaded asset wins over external URL, which wins
   * over the client's bundled default.
   */
  private async resolveSurface(
    db: DatabaseInstance,
    surface: BackgroundSurface
  ): Promise<SurfaceBackground> {
    const assetKey = surface === 'login' ? 'LOGIN_BACKGROUND_ASSET' : 'HOME_BACKGROUND_ASSET';
    const urlKey = surface === 'login' ? 'LOGIN_BACKGROUND_URL' : 'HOME_BACKGROUND_URL';

    const asset = (await configService.get(db, assetKey)).value.trim();
    if (asset) {
      return { source: 'asset', value: brandingAssetPath(surface, asset) };
    }

    const url = (await configService.get(db, urlKey)).value.trim();
    if (url) {
      if (isSafeExternalImageUrl(url)) {
        return { source: 'url', value: url };
      }
      logger.warn('Appearance', `Ignoring unsafe ${urlKey} value; falling back to default`);
    }

    return { source: 'default', value: null };
  }

  /**
   * Build the public appearance payload. Served unauthenticated because the
   * login page needs it before anyone can sign in.
   */
  async getConfig(db: DatabaseInstance): Promise<AppearanceConfig> {
    const [home, login] = await Promise.all([
      this.resolveSurface(db, 'home'),
      this.resolveSurface(db, 'login'),
    ]);

    const [overlayRaw, blurRaw, userEnabled, userUploadEnabled] = await Promise.all([
      configService.get(db, 'BACKGROUND_OVERLAY_OPACITY'),
      configService.get(db, 'BACKGROUND_BLUR'),
      configService.getBoolean(db, 'USER_BACKGROUND_ENABLED'),
      configService.getBoolean(db, 'USER_BACKGROUND_UPLOAD_ENABLED'),
    ]);

    return {
      // An admin who uploads a single branding image almost always wants it on
      // both surfaces, so an unset login background inherits the home one
      // rather than dropping back to the bundled default.
      login: login.source === 'default' ? home : login,
      home,
      overlayOpacity: parseOverlayOpacity(overlayRaw.value),
      blur: parseBlur(blurRaw.value),
      userBackgroundEnabled: userEnabled,
      // Uploads are meaningless when personalisation as a whole is off.
      userBackgroundUploadEnabled: userEnabled && userUploadEnabled,
    };
  }

  /**
   * Read a user's stored preferences. Malformed JSON is treated as empty
   * rather than fatal — a corrupt blob should not lock someone out of the app.
   */
  async getPreferences(db: DatabaseInstance, userId: string): Promise<UserPreferences> {
    // Full-row select rather than a projection: the DatabaseInstance union
    // (Bun / better-sqlite / D1) only agrees on the unprojected overload.
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const row = rows[0];

    if (!row?.preferences) {
      return {};
    }

    try {
      const parsed: unknown = JSON.parse(row.preferences);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as UserPreferences;
      }
    } catch {
      logger.warn('Appearance', 'Discarding unparseable user preferences blob');
    }
    return {};
  }

  /** Merge a background choice into a user's preferences. */
  async setBackgroundPreference(
    db: DatabaseInstance,
    userId: string,
    background: BackgroundPreference
  ): Promise<UserPreferences> {
    const current = await this.getPreferences(db, userId);
    const next: UserPreferences = { ...current, background };
    await db
      .update(users)
      .set({ preferences: JSON.stringify(next) })
      .where(eq(users.id, userId));
    return next;
  }
}

export const appearanceService = new AppearanceService();
