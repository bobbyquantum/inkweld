/**
 * Publish Style Presets
 *
 * Curated PublishStyles starting points covering common publishing scenarios.
 * Selecting a preset in the UI copies its values into the plan; the plan
 * stores the preset name for display only and is otherwise self-contained.
 */
import {
  createDefaultPublishStyles,
  type PublishStyles,
} from './publish-style';

export interface PublishStylePreset {
  /** Stable id stored on PublishStyles.preset. */
  id: string;
  /** Human readable name. */
  label: string;
  /** Short description shown under the picker. */
  description: string;
  /** Concrete styles applied when this preset is selected. */
  build: () => PublishStyles;
}

/**
 * Manuscript: standard double-spaced Courier submission format.
 */
const manuscript: PublishStylePreset = {
  id: 'manuscript',
  label: 'Manuscript',
  description:
    'Double-spaced Courier, US Letter, 1" margins. Submission-ready.',
  build: () => {
    const styles = createDefaultPublishStyles();
    styles.preset = 'manuscript';
    styles.page = {
      size: 'us-letter',
      marginTop: 1,
      marginBottom: 1,
      marginInside: 1,
      marginOutside: 1,
      pageNumbers: 'numeric',
      runningHeader: true,
    };
    styles.baseText = {
      font: 'serifManuscript',
      fontSize: 12,
      weight: 'normal',
      style: 'normal',
      lineHeight: 2,
      align: 'left',
      firstLineIndent: 0.5,
      color: '#000000',
    };
    styles.nodes.paragraph = {
      text: { firstLineIndent: 0.5 },
      box: { marginTop: 0, marginBottom: 0 },
    };
    styles.structure.chapterTitle = {
      ...styles.structure.chapterTitle,
      text: {
        ...styles.structure.chapterTitle.text,
        font: 'serifManuscript',
        fontSize: 12,
        weight: 'normal',
        transform: 'uppercase',
      },
      box: { marginTop: 144, marginBottom: 48 },
      pageBreakBefore: true,
    };
    return styles;
  },
};

/**
 * Paperback: 6x9 trade book with classic serif.
 */
const paperback: PublishStylePreset = {
  id: 'paperback',
  label: 'Paperback (6x9)',
  description: 'Classic trade paperback with serif body and centered chapters.',
  build: () => {
    const styles = createDefaultPublishStyles();
    styles.preset = 'paperback';
    return styles;
  },
};

/**
 * Ebook: optimized for e-readers; ignores page setup beyond hints.
 */
const ebook: PublishStylePreset = {
  id: 'ebook',
  label: 'Ebook',
  description: 'Reflowable defaults tuned for EPUB readers.',
  build: () => {
    const styles = createDefaultPublishStyles();
    styles.preset = 'ebook';
    styles.baseText = {
      ...styles.baseText,
      font: 'serifBook',
      fontSize: 12,
      lineHeight: 1.5,
      firstLineIndent: 1,
    };
    styles.page.size = 'us-trade';
    styles.page.runningHeader = false;
    styles.page.pageNumbers = 'none';
    return styles;
  },
};

/**
 * Web serial: sans-serif, generous spacing, left-aligned for screens.
 */
const webSerial: PublishStylePreset = {
  id: 'webSerial',
  label: 'Web Serial',
  description: 'Sans-serif, left-aligned, generous spacing for HTML reading.',
  build: () => {
    const styles = createDefaultPublishStyles();
    styles.preset = 'webSerial';
    styles.baseText = {
      ...styles.baseText,
      font: 'sansHumanist',
      fontSize: 12,
      lineHeight: 1.6,
      align: 'left',
      firstLineIndent: 0,
      color: '#1a1a1a',
    };
    styles.nodes.paragraph = {
      text: { firstLineIndent: 0 },
      box: { marginTop: 0, marginBottom: 12 },
    };
    styles.structure.chapterTitle = {
      ...styles.structure.chapterTitle,
      text: {
        ...styles.structure.chapterTitle.text,
        font: 'sansHumanist',
        fontSize: 28,
        align: 'left',
      },
      box: { marginTop: 24, marginBottom: 16 },
    };
    return styles;
  },
};

/**
 * Large print: 14pt, looser leading, generous margins.
 */
const largePrint: PublishStylePreset = {
  id: 'largePrint',
  label: 'Large Print',
  description: '14pt body with looser leading, accessible reading copy.',
  build: () => {
    const styles = createDefaultPublishStyles();
    styles.preset = 'largePrint';
    styles.page = {
      size: 'us-letter',
      marginTop: 1,
      marginBottom: 1,
      marginInside: 1.25,
      marginOutside: 1,
      pageNumbers: 'numeric',
      runningHeader: true,
    };
    styles.baseText = {
      ...styles.baseText,
      font: 'sansHumanist',
      fontSize: 14,
      lineHeight: 1.7,
      firstLineIndent: 1,
    };
    return styles;
  },
};

/**
 * Reference: dense reference material with prominent worldbuilding entries.
 */
const reference: PublishStylePreset = {
  id: 'reference',
  label: 'Reference',
  description:
    'Reference layout: tight body, prominent worldbuilding entry cards.',
  build: () => {
    const styles = createDefaultPublishStyles();
    styles.preset = 'reference';
    styles.baseText = {
      ...styles.baseText,
      font: 'sansClean',
      fontSize: 10,
      lineHeight: 1.35,
      align: 'left',
      firstLineIndent: 0,
    };
    styles.worldbuilding = {
      ...styles.worldbuilding,
      defaultLayout: 'detail',
      entryTitle: {
        ...styles.worldbuilding.entryTitle,
        fontSize: 16,
      },
      entryBox: {
        ...styles.worldbuilding.entryBox,
        borderWidth: 1,
        borderColor: '#888888',
      },
    };
    return styles;
  },
};

export const PUBLISH_STYLE_PRESETS: PublishStylePreset[] = [
  manuscript,
  paperback,
  ebook,
  webSerial,
  largePrint,
  reference,
];

export function getPublishStylePreset(
  id: string
): PublishStylePreset | undefined {
  return PUBLISH_STYLE_PRESETS.find(p => p.id === id);
}
