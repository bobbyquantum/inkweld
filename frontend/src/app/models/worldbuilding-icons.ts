/**
 * Worldbuilding icon catalogue.
 *
 * The curated list backs the schema/tab icon picker; the alias map translates
 * legacy Material Icons names (which the icon font still renders) to their
 * Material Symbols equivalents so the SVG export can find a glyph file.
 *
 * Source of truth is `worldbuilding-icons.json` so the build script that
 * stages the SVG files (`scripts/copy-icon-svgs.mjs`) reads the same data.
 */
import iconManifest from './worldbuilding-icons.json';

/** Icons offered by the worldbuilding icon picker, in display order. */
export const WORLDBUILDING_ICONS: readonly string[] = iconManifest.icons;

/** Legacy Material Icons name → Material Symbols name. */
export const MATERIAL_ICON_ALIASES: Readonly<Record<string, string>> =
  iconManifest.aliases;

/** Resolve an icon name to the Material Symbols name used for SVG lookup. */
export function resolveIconName(name: string): string {
  return MATERIAL_ICON_ALIASES[name] ?? name;
}
