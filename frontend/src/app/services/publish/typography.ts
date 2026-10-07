/**
 * Publish-time typography: straight quotes and hyphen runs become the curly
 * quotes, apostrophes and dashes a typeset book uses.
 *
 * Stored documents are never touched. The editor keeps what was typed, and
 * generators run the content tree through {@link smartenDocument} on the way
 * out. Kept free of Angular so it can be tested directly.
 */
import { PublishFormat, type PublishPlan } from '@models/publish-plan';

/** Quote marks for one language. */
export interface QuoteStyle {
  open: string;
  close: string;
  openInner: string;
  closeInner: string;
  /** Text inserted inside the outer quotes (French wants a no-break space). */
  pad?: string;
}

const EN: QuoteStyle = {
  open: '“',
  close: '”',
  openInner: '‘',
  closeInner: '’',
};

const QUOTE_STYLES: Record<string, QuoteStyle> = {
  en: EN,
  nl: EN,
  pt: EN,
  ar: EN,
  he: EN,
  de: {
    open: '„',
    close: '“',
    openInner: '‚',
    closeInner: '‘',
  },
  cs: {
    open: '„',
    close: '“',
    openInner: '‚',
    closeInner: '‘',
  },
  sk: {
    open: '„',
    close: '“',
    openInner: '‚',
    closeInner: '‘',
  },
  sl: {
    open: '„',
    close: '“',
    openInner: '‚',
    closeInner: '‘',
  },
  pl: {
    open: '„',
    close: '”',
    openInner: '‚',
    closeInner: '’',
  },
  sv: {
    open: '”',
    close: '”',
    openInner: '’',
    closeInner: '’',
  },
  fi: {
    open: '”',
    close: '”',
    openInner: '’',
    closeInner: '’',
  },
  da: {
    open: '»',
    close: '«',
    openInner: '›',
    closeInner: '‹',
  },
  nb: {
    open: '«',
    close: '»',
    openInner: '‘',
    closeInner: '’',
  },
  fr: {
    open: '«',
    close: '»',
    openInner: '“',
    closeInner: '”',
    pad: ' ',
  },
  es: {
    open: '«',
    close: '»',
    openInner: '“',
    closeInner: '”',
  },
  it: {
    open: '«',
    close: '»',
    openInner: '“',
    closeInner: '”',
  },
  ru: {
    open: '«',
    close: '»',
    openInner: '„',
    closeInner: '“',
  },
  uk: {
    open: '«',
    close: '»',
    openInner: '„',
    closeInner: '“',
  },
  ja: {
    open: '「',
    close: '」',
    openInner: '『',
    closeInner: '』',
  },
  zh: {
    open: '“',
    close: '”',
    openInner: '‘',
    closeInner: '’',
  },
};
QUOTE_STYLES['no'] = QUOTE_STYLES['nb'];
QUOTE_STYLES['nn'] = QUOTE_STYLES['nb'];

/** Languages that set a parenthetical dash as a spaced en dash, not an em dash. */
const SPACED_EN_DASH = new Set([
  'de',
  'cs',
  'sk',
  'pl',
  'ru',
  'uk',
  'fr',
  'it',
  'nl',
]);

const EN_DASH = '–';
const EM_DASH = '—';
const APOSTROPHE = '’';
/** Stands in for non-text content (inline code, images…) in a text run. */
const OBJECT = '￼';

const primaryLanguage = (language: string | undefined): string =>
  (language ?? 'en').split(/[-_]/)[0].toLowerCase();

export function quoteStyleFor(language: string | undefined): QuoteStyle {
  return QUOTE_STYLES[primaryLanguage(language)] ?? EN;
}

/** Words that take a leading apostrophe, not an opening quote ('tis, 'em…). */
const ELISIONS = /^(?:tis|twas|twere|twill|em|cause|cos|til|round|n|im|ere)\b/i;

const OPENING_CONTEXT = new RegExp(
  `[\\s([{<${EM_DASH}${EN_DASH}\\u00A0${OBJECT}]`
);
const isOpeningContext = (prev: string | undefined, quotes: QuoteStyle) =>
  prev === undefined ||
  OPENING_CONTEXT.test(prev) ||
  prev === quotes.open ||
  prev === quotes.openInner;

/**
 * Convert a run of text. The run may be a whole paragraph assembled from
 * several marked pieces, so a quote at the start of a piece still sees what
 * precedes it. Returns, for every input character, what it becomes (an empty
 * string when it was merged into the previous replacement), which lets the
 * caller split the result back into its pieces.
 */
function convertRun(text: string, language: string | undefined): string[] {
  const quotes = quoteStyleFor(language);
  const dash = SPACED_EN_DASH.has(primaryLanguage(language))
    ? EN_DASH
    : EM_DASH;
  const out: string[] = Array.from(text, ch => ch);
  const chars = out.slice();
  // The last character already written before position i.
  const prevOf = (i: number): string | undefined => {
    for (let j = i - 1; j >= 0; j--) {
      if (out[j]) return out[j].slice(-1);
    }
    return undefined;
  };

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const next = chars[i + 1];

    if (ch === '-' && next === '-') {
      if (chars[i + 2] === '-') {
        out[i] = EM_DASH;
        out[i + 1] = '';
        out[i + 2] = '';
        i += 2;
      } else {
        out[i] = dash;
        out[i + 1] = '';
        i += 1;
      }
      continue;
    }
    if (
      ch === '-' &&
      /\s/.test(chars[i - 1] ?? '') &&
      /\s/.test(next ?? '') &&
      i > 1 &&
      !/\s/.test(chars[i - 2])
    ) {
      out[i] = EN_DASH;
      continue;
    }

    if (ch === '"') {
      const opening = isOpeningContext(prevOf(i), quotes) && next !== undefined;
      const pad = quotes.pad ?? '';
      if (opening) {
        out[i] = quotes.open + (/\s/.test(next) ? '' : pad);
      } else {
        const before = chars[i - 1];
        out[i] = (before && !/\s/.test(before) ? pad : '') + quotes.close;
      }
      continue;
    }

    if (ch === "'") {
      const prev = prevOf(i);
      const rest = text.slice(i + 1);
      const wordBefore = prev !== undefined && /[\p{L}\p{N}]/u.test(prev);
      const wordAfter = next !== undefined && /[\p{L}\p{N}]/u.test(next);
      if (wordBefore && wordAfter) {
        out[i] = APOSTROPHE;
      } else if (
        isOpeningContext(prev, quotes) &&
        wordAfter &&
        !ELISIONS.test(rest) &&
        !/^\d\d(?!\d)/.test(rest)
      ) {
        out[i] = quotes.openInner;
      } else if (isOpeningContext(prev, quotes) && next && /\S/.test(next)) {
        // 'tis, 'em, '90s: an apostrophe standing in for dropped letters.
        out[i] = /[\p{L}\p{N}]/u.test(next) ? APOSTROPHE : quotes.openInner;
      } else {
        // After a word or closing punctuation: closing quote or apostrophe (dogs').
        out[i] = quotes.closeInner;
      }
    }
  }
  return out;
}

/** Convert one stand-alone string. */
export function smartenText(text: string, language?: string): string {
  return convertRun(text, language).join('');
}

/**
 * Convert text pieces that form one run (the leaves of a paragraph).
 * `null` entries are boundaries that must not be converted (inline code,
 * images, …): they keep their place in the context but are returned as-is.
 */
export function smartenSegments(
  segments: (string | null)[],
  language?: string
): (string | null)[] {
  const joined = segments.map(s => s ?? OBJECT).join('');
  const converted = convertRun(joined, language);
  const result: (string | null)[] = [];
  let offset = 0;
  for (const segment of segments) {
    if (segment === null) {
      result.push(null);
      offset += 1;
      continue;
    }
    const length = Array.from(segment).length;
    result.push(converted.slice(offset, offset + length).join(''));
    offset += length;
  }
  return result;
}

// ── Document tree ────────────────────────────────────────────────────────

type Json = unknown;
type Rec = Record<string, unknown>;

const isRec = (v: Json): v is Rec =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Block nodes whose text is literal and must stay as typed. */
const LITERAL_NODES = new Set(['code_block', 'codeblock', 'pre', 'code']);

function nodeName(node: Rec): string {
  if (typeof node['nodeName'] === 'string')
    return node['nodeName'].toLowerCase();
  if (typeof node['type'] === 'string') return node['type'].toLowerCase();
  return '';
}

function hasCodeMark(node: Rec): boolean {
  const marks = node['marks'];
  if (!Array.isArray(marks)) return false;
  return marks.some(m => {
    const type = typeof m === 'string' ? m : isRec(m) ? m['type'] : undefined;
    return typeof type === 'string' && type.toLowerCase() === 'code';
  });
}

const isTextLeaf = (child: Json): boolean =>
  typeof child === 'string' ||
  (isRec(child) && typeof child['text'] === 'string');

/**
 * Return a copy of a document tree with typographic quotes and dashes
 * applied. Accepts both ProseMirror JSON (`type`/`content`/`text`) and the
 * Yjs shape (`nodeName`/`children`, string leaves). Code blocks and
 * code-marked text are left alone; the input is not modified.
 */
export function smartenDocument<T extends Json>(doc: T, language?: string): T {
  return smartenNode(doc, language) as T;
}

function smartenNode(node: Json, language: string | undefined): Json {
  if (Array.isArray(node)) return smartenChildren(node, language);
  if (!isRec(node)) return node;
  if (LITERAL_NODES.has(nodeName(node))) return node;

  const key = Array.isArray(node['content'])
    ? 'content'
    : Array.isArray(node['children'])
      ? 'children'
      : null;
  if (!key) return node;
  return {
    ...node,
    [key]: smartenChildren(node[key] as Json[], language),
  };
}

function smartenChildren(
  children: Json[],
  language: string | undefined
): Json[] {
  if (!children.some(isTextLeaf)) {
    return children.map(c => smartenNode(c, language));
  }

  // A textblock: convert its text as one run so context carries across marks.
  const segments = children.map(c => {
    if (typeof c === 'string') return c;
    if (isRec(c) && typeof c['text'] === 'string' && !hasCodeMark(c)) {
      return c['text'];
    }
    return null;
  });
  const converted = smartenSegments(segments, language);
  return children.map((child, i) => {
    const text = converted[i];
    if (text === null) return smartenNode(child, language);
    return typeof child === 'string' ? text : { ...(child as Rec), text };
  });
}

// ── Plan option ──────────────────────────────────────────────────────────

/**
 * The language to typeset a plan's text in, or null when typographic
 * conversion is off. Plans that never set the option follow the format's
 * default: on for the typeset outputs (EPUB, PDF, HTML, website), off for
 * Markdown, whose output is source text a person may edit further.
 */
export function typographyLanguageFor(plan: PublishPlan): string | null {
  const enabled =
    plan.options.typographicQuotes ?? plan.format !== PublishFormat.MARKDOWN;
  return enabled ? plan.metadata.language || 'en' : null;
}
