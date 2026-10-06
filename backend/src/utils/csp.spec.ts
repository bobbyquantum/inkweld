import { describe, it, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildContentSecurityPolicy,
  collectExternalScriptOrigins,
  collectInlineScriptHashes,
  cspHeaderName,
  cspSettingsComment,
  parseCspMode,
  parseTrustedSources,
} from './csp';

const sha256 = (text: string) =>
  `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

function directive(policy: string, name: string): string[] {
  const entry = policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));
  return entry ? entry.split(/\s+/).slice(1) : [];
}

describe('csp', () => {
  describe('parseCspMode', () => {
    it('defaults to enforce', () => {
      expect(parseCspMode(undefined)).toBe('enforce');
      expect(parseCspMode('')).toBe('enforce');
      expect(parseCspMode('nonsense')).toBe('enforce');
    });

    it('accepts report-only and off case-insensitively', () => {
      expect(parseCspMode(' Report-Only ')).toBe('report-only');
      expect(parseCspMode('OFF')).toBe('off');
    });
  });

  describe('cspHeaderName', () => {
    it('maps each mode to its header', () => {
      expect(cspHeaderName('enforce')).toBe('Content-Security-Policy');
      expect(cspHeaderName('report-only')).toBe('Content-Security-Policy-Report-Only');
      expect(cspHeaderName('off')).toBeNull();
    });
  });

  describe('parseTrustedSources', () => {
    it('keeps host sources separated by spaces, commas or newlines', () => {
      expect(
        parseTrustedSources(
          'https://www.googletagmanager.com, *.example.com\nhttps://cdn.example.com:8443/js/'
        )
      ).toEqual([
        'https://www.googletagmanager.com',
        '*.example.com',
        'https://cdn.example.com:8443/js/',
      ]);
    });

    it('drops keywords and anything that could end the directive', () => {
      expect(
        parseTrustedSources(
          "'unsafe-inline' https://ok.example.com;script-src https: data: javascript:alert(1) https://ok.example.com"
        )
      ).toEqual(['https://ok.example.com']);
      expect(parseTrustedSources("https://a.example.com 'unsafe-eval' https:")).toEqual([
        'https://a.example.com',
      ]);
    });

    it('de-duplicates', () => {
      expect(parseTrustedSources('https://a.example.com https://a.example.com')).toEqual([
        'https://a.example.com',
      ]);
    });
  });

  describe('collectInlineScriptHashes', () => {
    it('hashes the exact text of each inline script', () => {
      const inline = "\n  window.dataLayer = [];\n  console.log('a');\n";
      const html = `<head><script>${inline}</script><SCRIPT type="text/javascript">x()</SCRIPT></head>`;
      expect(collectInlineScriptHashes(html)).toEqual([sha256(inline), sha256('x()')]);
    });

    it('ignores external scripts and look-alike elements', () => {
      const html = '<script src="/a.js"></script><scripts>nope</scripts><script-x>nope</script-x>';
      expect(collectInlineScriptHashes(html)).toEqual([]);
    });

    it('stops at an unterminated script', () => {
      expect(collectInlineScriptHashes('<script>never closed')).toEqual([]);
    });
  });

  describe('collectExternalScriptOrigins', () => {
    it('returns origins of absolute and protocol-relative sources', () => {
      const html = [
        '<script async src="https://plausible.io/js/script.js"></script>',
        "<script src='//cdn.example.com/w.js'></script>",
        '<script src=http://insecure.example.com/x.js></script>',
        '<script src="main.js" type="module"></script>',
        '<script src="data:text/javascript,alert(1)"></script>',
      ].join('');
      expect(collectExternalScriptOrigins(html)).toEqual([
        'https://plausible.io',
        'https://cdn.example.com',
        'http://insecure.example.com',
      ]);
    });

    it('does not read data-src or similar attributes as src', () => {
      expect(
        collectExternalScriptOrigins('<script data-src="https://x.example.com/a.js">1</script>')
      ).toEqual([]);
    });
  });

  describe('cspSettingsComment', () => {
    it('is empty for the default settings so index.html stays as built', () => {
      expect(cspSettingsComment('enforce', '')).toBe('');
      expect(cspSettingsComment('enforce', "'unsafe-inline'")).toBe('');
    });

    it('changes whenever the mode or trusted sources do', () => {
      const comments = [
        cspSettingsComment('report-only', ''),
        cspSettingsComment('off', ''),
        cspSettingsComment('enforce', 'https://a.example.com'),
        cspSettingsComment('enforce', 'https://b.example.com'),
      ];
      for (const comment of comments)
        expect(comment).toMatch(/^<!-- inkweld-csp:[0-9a-f]{16} -->$/);
      expect(new Set(comments).size).toBe(comments.length);
    });
  });

  describe('buildContentSecurityPolicy', () => {
    it('allows only same-origin scripts by default, never inline ones', () => {
      const policy = buildContentSecurityPolicy();
      // 'unsafe-eval' is for Typst's wasm-bindgen glue (see csp.ts).
      expect(directive(policy, 'script-src')).toEqual(["'self'", "'unsafe-eval'"]);
      expect(directive(policy, 'object-src')).toEqual(["'none'"]);
      expect(directive(policy, 'base-uri')).toEqual(["'self'"]);
      expect(directive(policy, 'script-src')).not.toContain("'unsafe-inline'");
    });

    it('allows the custom HTML scripts in the served document', () => {
      const html =
        '<head><script>track()</script><script src="https://stats.example.com/s.js"></script></head>';
      const scriptSrc = directive(buildContentSecurityPolicy({ html }), 'script-src');
      expect(scriptSrc).toContain('https://stats.example.com');
      expect(scriptSrc).toContain(sha256('track()'));
    });

    it('adds trusted sources to script, style, font and frame directives only', () => {
      const policy = buildContentSecurityPolicy({
        trustedSources: "https://widget.example.com 'unsafe-inline'",
      });
      for (const name of ['script-src', 'style-src', 'font-src', 'frame-src']) {
        expect(directive(policy, name)).toContain('https://widget.example.com');
      }
      expect(directive(policy, 'default-src')).toEqual(["'self'"]);
      expect(directive(policy, 'script-src')).not.toContain("'unsafe-inline'");
    });

    it('matches the static policy Cloudflare Pages serves from _headers', () => {
      const headers = readFileSync(
        join(import.meta.dir, '../../../frontend/public/_headers'),
        'utf8'
      );
      const line = headers
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith('Content-Security-Policy:'));
      expect(line?.slice('Content-Security-Policy:'.length).trim()).toBe(
        buildContentSecurityPolicy()
      );
    });
  });
});
