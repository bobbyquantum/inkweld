import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database as BunDatabase } from 'bun:sqlite';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import { config, CONFIG_KEYS, type ConfigKey } from '../src/db/schema/config';
import { users } from '../src/db/schema/users';
import { configService } from '../src/services/config.service';
import {
  appearanceService,
  BACKGROUND_PRESET_IDS,
  brandingSlotKey,
  isBackgroundSurface,
  isSafeExternalImageUrl,
  parseBlur,
  parseOverlayOpacity,
} from '../src/services/appearance.service';

let db: BunSQLiteDatabase<typeof schema>;
let sqlite: BunDatabase;

beforeAll(() => {
  // The host environment may set any of these; defaults must be what we assert.
  for (const key of Object.keys(CONFIG_KEYS)) {
    delete process.env[CONFIG_KEYS[key as ConfigKey].envVar];
  }

  sqlite = new BunDatabase(':memory:');
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: join(__dirname, '../drizzle') });
});

afterAll(() => {
  sqlite.close();
});

beforeEach(async () => {
  await db.delete(config);
  await db.delete(users);
});

async function createUser(id = 'user-1'): Promise<string> {
  await db.insert(users).values({
    id,
    username: `user-${id}`,
    enabled: true,
    approved: true,
  });
  return id;
}

describe('isSafeExternalImageUrl', () => {
  it.each([
    'https://cdn.example.com/bg.jpg',
    'http://localhost:8080/bg.png',
    'https://cdn.example.com/path/to/my-background_v2.webp?x=1&y=2',
  ])('accepts %s', (url) => {
    expect(isSafeExternalImageUrl(url)).toBe(true);
  });

  it.each([
    // Nothing at all.
    '',
    '   ',
    // Not absolute.
    '/local/path.png',
    'cdn.example.com/bg.jpg',
    // Schemes we will not render.
    'data:image/png;base64,AAAA',
    'javascript:alert(1)',
    'file:///etc/passwd',
    // Characters that would escape the CSS url("…") token.
    'https://x.test/a.png") ; background: url("y',
    "https://x.test/a'.png",
    'https://x.test/a(1).png',
    'https://x.test/a\\b.png',
    'https://x.test/a b.png',
  ])('rejects %p', (url) => {
    expect(isSafeExternalImageUrl(url)).toBe(false);
  });

  it('rejects a URL containing a control character', () => {
    expect(isSafeExternalImageUrl('https://x.test/a\u0000.png')).toBe(false);
    expect(isSafeExternalImageUrl('https://x.test/a\u001f.png')).toBe(false);
    expect(isSafeExternalImageUrl('https://x.test/a\u007f.png')).toBe(false);
  });
});

describe('parseOverlayOpacity', () => {
  it('returns null for unset or unparseable values so defaults survive', () => {
    expect(parseOverlayOpacity('')).toBeNull();
    expect(parseOverlayOpacity('   ')).toBeNull();
    expect(parseOverlayOpacity('abc')).toBeNull();
    expect(parseOverlayOpacity('NaN')).toBeNull();
  });

  it('clamps to the 0–0.95 range', () => {
    expect(parseOverlayOpacity('0.42')).toBe(0.42);
    expect(parseOverlayOpacity('5')).toBe(0.95);
    expect(parseOverlayOpacity('-3')).toBe(0);
  });
});

describe('parseBlur', () => {
  it('treats anything non-positive or unparseable as off', () => {
    expect(parseBlur('')).toBe(0);
    expect(parseBlur('0')).toBe(0);
    expect(parseBlur('-4')).toBe(0);
    expect(parseBlur('xyz')).toBe(0);
  });

  it('rounds and caps at 40px', () => {
    expect(parseBlur('12')).toBe(12);
    expect(parseBlur('12.6')).toBe(13);
    expect(parseBlur('999')).toBe(40);
  });
});

describe('surface helpers', () => {
  it('recognises only the two known surfaces', () => {
    expect(isBackgroundSurface('login')).toBe(true);
    expect(isBackgroundSurface('home')).toBe(true);
    expect(isBackgroundSurface('bogus')).toBe(false);
    expect(isBackgroundSurface('../../etc/passwd')).toBe(false);
  });

  it('namespaces storage slots per surface', () => {
    expect(brandingSlotKey('login')).toBe('background-login');
    expect(brandingSlotKey('home')).toBe('background-home');
  });
});

describe('appearanceService.getConfig', () => {
  it('reports the bundled default when nothing is configured', async () => {
    const result = await appearanceService.getConfig(db);

    expect(result.login).toEqual({ source: 'default', value: null });
    expect(result.home).toEqual({ source: 'default', value: null });
    expect(result.overlayOpacity).toBeNull();
    expect(result.blur).toBe(0);
    // Presets cost nothing, so personalisation is on by default…
    expect(result.userBackgroundEnabled).toBe(true);
    // …but uploads consume storage, so they are not.
    expect(result.userBackgroundUploadEnabled).toBe(false);
  });

  it('prefers an uploaded asset over an external URL', async () => {
    await configService.set(db, 'HOME_BACKGROUND_ASSET', 'v123');
    await configService.set(db, 'HOME_BACKGROUND_URL', 'https://cdn.example.com/bg.jpg');

    const result = await appearanceService.getConfig(db);

    expect(result.home.source).toBe('asset');
    expect(result.home.value).toBe('/api/v1/appearance/background/home?v=v123');
  });

  it('uses an external URL when no asset is uploaded', async () => {
    await configService.set(db, 'HOME_BACKGROUND_URL', 'https://cdn.example.com/bg.jpg');

    const result = await appearanceService.getConfig(db);

    expect(result.home).toEqual({
      source: 'url',
      value: 'https://cdn.example.com/bg.jpg',
    });
  });

  it('ignores an unsafe stored URL rather than serving it', async () => {
    await configService.set(
      db,
      'HOME_BACKGROUND_URL',
      'https://x.test/a.png") ; background: url("javascript:0'
    );

    const result = await appearanceService.getConfig(db);

    expect(result.home).toEqual({ source: 'default', value: null });
  });

  it('cache-busts the asset path per version token', async () => {
    await configService.set(db, 'HOME_BACKGROUND_ASSET', 'first');
    const first = await appearanceService.getConfig(db);

    await configService.set(db, 'HOME_BACKGROUND_ASSET', 'second');
    const second = await appearanceService.getConfig(db);

    expect(first.home.value).not.toBe(second.home.value);
    expect(second.home.value).toContain('v=second');
  });

  it('escapes a version token in the asset path', async () => {
    await configService.set(db, 'HOME_BACKGROUND_ASSET', 'a b&c');
    const result = await appearanceService.getConfig(db);

    expect(result.home.value).toBe('/api/v1/appearance/background/home?v=a%20b%26c');
  });

  describe('login inherits home', () => {
    it('falls back to the home background when login has nothing set', async () => {
      await configService.set(db, 'HOME_BACKGROUND_ASSET', 'v1');

      const result = await appearanceService.getConfig(db);

      expect(result.login).toEqual(result.home);
      expect(result.login.value).toBe('/api/v1/appearance/background/home?v=v1');
    });

    it('does not inherit once login has its own image', async () => {
      await configService.set(db, 'HOME_BACKGROUND_ASSET', 'v1');
      await configService.set(db, 'LOGIN_BACKGROUND_ASSET', 'v2');

      const result = await appearanceService.getConfig(db);

      expect(result.login.value).toBe('/api/v1/appearance/background/login?v=v2');
      expect(result.home.value).toBe('/api/v1/appearance/background/home?v=v1');
    });

    it('does not inherit once login has its own URL', async () => {
      await configService.set(db, 'HOME_BACKGROUND_ASSET', 'v1');
      await configService.set(db, 'LOGIN_BACKGROUND_URL', 'https://cdn.example.com/l.jpg');

      const result = await appearanceService.getConfig(db);

      expect(result.login).toEqual({
        source: 'url',
        value: 'https://cdn.example.com/l.jpg',
      });
    });
  });

  it('clamps the stored treatment values', async () => {
    await configService.set(db, 'BACKGROUND_OVERLAY_OPACITY', '9');
    await configService.set(db, 'BACKGROUND_BLUR', '900');

    const result = await appearanceService.getConfig(db);

    expect(result.overlayOpacity).toBe(0.95);
    expect(result.blur).toBe(40);
  });

  it('forces uploads off while personalisation as a whole is off', async () => {
    await configService.set(db, 'USER_BACKGROUND_ENABLED', 'false');
    await configService.set(db, 'USER_BACKGROUND_UPLOAD_ENABLED', 'true');

    const result = await appearanceService.getConfig(db);

    expect(result.userBackgroundEnabled).toBe(false);
    expect(result.userBackgroundUploadEnabled).toBe(false);
  });
});

describe('appearanceService preferences', () => {
  it('returns an empty object for a user with nothing stored', async () => {
    const userId = await createUser();
    expect(await appearanceService.getPreferences(db, userId)).toEqual({});
  });

  it('round-trips a background preference', async () => {
    const userId = await createUser();

    await appearanceService.setBackgroundPreference(db, userId, {
      kind: 'preset',
      presetId: 'midnight',
    });

    expect(await appearanceService.getPreferences(db, userId)).toEqual({
      background: { kind: 'preset', presetId: 'midnight' },
    });
  });

  it('merges rather than replaces the preferences blob', async () => {
    const userId = await createUser();
    // Something a future feature might have written.
    await db
      .update(users)
      .set({ preferences: JSON.stringify({ somethingElse: 42 }) })
      .where(eq(users.id, userId));

    await appearanceService.setBackgroundPreference(db, userId, { kind: 'default' });

    const stored = await appearanceService.getPreferences(db, userId);
    expect(stored).toEqual({
      somethingElse: 42,
      background: { kind: 'default' },
    } as never);
  });

  it('treats an unparseable blob as empty rather than throwing', async () => {
    const userId = await createUser();
    await db.update(users).set({ preferences: 'not json' }).where(eq(users.id, userId));

    expect(await appearanceService.getPreferences(db, userId)).toEqual({});
  });

  it('treats a non-object blob as empty', async () => {
    const userId = await createUser();
    await db.update(users).set({ preferences: '"a string"' }).where(eq(users.id, userId));

    expect(await appearanceService.getPreferences(db, userId)).toEqual({});
  });

  it('returns empty preferences for an unknown user id', async () => {
    expect(await appearanceService.getPreferences(db, 'no-such-user')).toEqual({});
  });
});

describe('preset catalogue', () => {
  it('includes the bundled image and a plain option', () => {
    // The frontend owns the visuals; these ids are the contract between them.
    expect(BACKGROUND_PRESET_IDS).toContain('bundled');
    expect(BACKGROUND_PRESET_IDS).toContain('none');
  });

  it('has no duplicate ids', () => {
    expect(new Set(BACKGROUND_PRESET_IDS).size).toBe(BACKGROUND_PRESET_IDS.length);
  });
});
