import { describe, expect, it } from 'vitest';

import { isSafeNavigationUrl } from './safe-navigation-url';

describe('isSafeNavigationUrl', () => {
  it('allows web and native-app URLs', () => {
    expect(
      isSafeNavigationUrl('https://claude.ai/api/mcp/auth_callback?code=x')
    ).toBe(true);
    expect(isSafeNavigationUrl('http://localhost:9999/callback')).toBe(true);
    expect(isSafeNavigationUrl('claude://oauth/callback?code=x')).toBe(true);
  });

  it('refuses script and content schemes, whatever their case', () => {
    for (const url of [
      "javascript:void(0)||fetch('https://evil.example')//?code=x",
      ' JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'blob:https://inkweld.app/abc',
      'file:///etc/passwd',
    ]) {
      expect(isSafeNavigationUrl(url)).toBe(false);
    }
  });

  it('refuses empty and relative values', () => {
    expect(isSafeNavigationUrl('')).toBe(false);
    expect(isSafeNavigationUrl(null)).toBe(false);
    expect(isSafeNavigationUrl('/relative/path')).toBe(false);
  });
});
