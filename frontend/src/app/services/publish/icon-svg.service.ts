import { Injectable } from '@angular/core';

import { resolveIconName } from '../../models/worldbuilding-icons';

/** Where the app serves the staged Material Symbols SVGs (see scripts/copy-icon-svgs.mjs). */
const LOCAL_ICON_BASE = '/assets/icons/outlined/';
/** Fallback for icons outside the curated set; same package and version as the staged files. */
const CDN_ICON_BASE =
  'https://cdn.jsdelivr.net/npm/@material-symbols/svg-400@0.47.1/outlined/';

/**
 * Resolves Material Symbols icon names to inline SVG markup for exports.
 *
 * Exported HTML embeds icons as SVG rather than relying on the icon font, so
 * the output is self-contained and readable offline. Files are looked up
 * locally first (the curated picker set is staged into `/assets/icons/` at
 * install time), then from a CDN for custom icon names. Fetched markup is
 * parsed and rebuilt from whitelisted elements and attributes only, so no
 * script or foreign content can ride along, and results are cached for the
 * lifetime of the service.
 */
@Injectable({ providedIn: 'root' })
export class IconSvgService {
  private readonly cache = new Map<string, Promise<string | null>>();

  /**
   * Inline `<svg>` markup for the icon, or null when it cannot be resolved.
   * Names are validated against the Material Symbols naming scheme first.
   */
  getSvg(name: string): Promise<string | null> {
    if (!/^[a-z][a-z0-9_]*$/.test(name)) return Promise.resolve(null);
    const resolved = resolveIconName(name);
    let pending = this.cache.get(resolved);
    if (!pending) {
      pending = this.load(resolved);
      this.cache.set(resolved, pending);
    }
    return pending;
  }

  private async load(name: string): Promise<string | null> {
    for (const base of [LOCAL_ICON_BASE, CDN_ICON_BASE]) {
      const text = await this.fetchText(`${base}${name}.svg`);
      const svg = text ? IconSvgService.sanitize(text) : null;
      if (svg) return svg;
    }
    return null;
  }

  private async fetchText(url: string): Promise<string | null> {
    if (typeof fetch !== 'function') return null;
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const type = response.headers.get('content-type') ?? '';
      if (type && !/svg|xml|octet-stream|text\/plain/i.test(type)) return null;
      return await response.text();
    } catch {
      return null;
    }
  }

  /**
   * Rebuild the SVG from its `viewBox` and `<path d>` children only.
   * Material Symbols files contain nothing else; anything more is refused.
   */
  static sanitize(markup: string): string | null {
    if (typeof DOMParser === 'undefined') return null;
    const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
    const root = doc.documentElement;
    if (root?.nodeName.toLowerCase() !== 'svg') return null;
    const viewBox = root.getAttribute('viewBox') ?? '';
    if (!/^-?[\d.]+(?: -?[\d.]+){3}$/.test(viewBox)) return null;

    const paths: string[] = [];
    for (const child of Array.from(root.children)) {
      if (child.nodeName.toLowerCase() !== 'path') return null;
      const d = child.getAttribute('d') ?? '';
      if (!/^[MmZzLlHhVvCcSsQqTtAa0-9,.\s-]+$/.test(d)) return null;
      paths.push(`<path d="${d}"/>`);
    }
    if (paths.length === 0) return null;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" focusable="false" aria-hidden="true">${paths.join('')}</svg>`;
  }
}
