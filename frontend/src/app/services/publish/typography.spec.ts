import { PublishFormat, type PublishPlan } from '@models/publish-plan';
import { describe, expect, it } from 'vitest';

import {
  smartenDocument,
  smartenSegments,
  smartenText,
  typographyLanguageFor,
} from './typography';

describe('smartenText (English)', () => {
  it.each([
    ['"Hello," she said.', '“Hello,” she said.'],
    ['She said, "Go."', 'She said, “Go.”'],
    ["It's Tom's dog.", 'It’s Tom’s dog.'],
    ["'Hello,' he said.", '‘Hello,’ he said.'],
    ['"He said \'run\'."', '“He said ‘run’.”'],
    ['"\'Quoted\' text"', '“‘Quoted’ text”'],
    ["the dogs' bowls", 'the dogs’ bowls'],
    ["'Tis the season, 'em all", '’Tis the season, ’em all'],
    ["the '90s were fun", 'the ’90s were fun'],
    ['("aside")', '(“aside”)'],
    ['wait—"what?"', 'wait—“what?”'],
  ])('%s', (input, expected) => {
    expect(smartenText(input, 'en')).toBe(expected);
  });

  it('turns hyphen runs into dashes', () => {
    expect(smartenText('wait--what', 'en')).toBe('wait—what');
    expect(smartenText('wait---what', 'en')).toBe('wait—what');
    expect(smartenText('a - b', 'en')).toBe('a – b');
    expect(smartenText('well-known 1-2', 'en')).toBe('well-known 1-2');
  });

  it('is idempotent on already curly text', () => {
    const curly = '“It’s fine” — really';
    expect(smartenText(curly, 'en')).toBe(curly);
  });

  it('leaves text without quotes alone', () => {
    expect(smartenText('plain text', 'en')).toBe('plain text');
  });
});

describe('smartenText (other languages)', () => {
  it('uses German low-high quotes and spaced en dashes', () => {
    expect(smartenText('"Hallo" -- sagte er', 'de')).toBe('„Hallo“ – sagte er');
  });

  it('uses French guillemets with no-break spaces', () => {
    expect(smartenText('Il dit "oui".', 'fr-CA')).toBe('Il dit « oui ».');
  });

  it('uses Spanish angle quotes', () => {
    expect(smartenText('"Hola"', 'es')).toBe('«Hola»');
  });

  it('uses Swedish right quotes on both sides', () => {
    expect(smartenText('"Hej"', 'sv')).toBe('”Hej”');
  });

  it('falls back to English for unknown languages', () => {
    expect(smartenText('"x"', 'xx')).toBe('“x”');
  });
});

describe('smartenSegments', () => {
  it('keeps context across pieces and splits the result back', () => {
    expect(smartenSegments(['"Hello ', 'world', '"'], 'en')).toEqual([
      '“Hello ',
      'world',
      '”',
    ]);
  });

  it('opens a quote that follows an emphasised word', () => {
    expect(smartenSegments(['It was ', null, ' "odd"'], 'en')).toEqual([
      'It was ',
      null,
      ' “odd”',
    ]);
  });

  it('keeps lengths aligned when dashes shrink', () => {
    expect(smartenSegments(['a--', 'b'], 'en')).toEqual(['a—', 'b']);
  });
});

describe('smartenDocument', () => {
  it('converts ProseMirror JSON text across marks without mutating input', () => {
    const doc = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '"Don\'t ' },
          { type: 'text', text: 'stop', marks: [{ type: 'italic' }] },
          { type: 'text', text: '," she said.' },
        ],
      },
    ];
    const snapshot = JSON.stringify(doc);
    const result = smartenDocument(doc, 'en');
    expect(JSON.stringify(doc)).toBe(snapshot);
    expect(result[0].content.map(n => n.text).join('')).toBe(
      '“Don’t stop,” she said.'
    );
    expect(result[0].content[1].marks).toEqual([{ type: 'italic' }]);
  });

  it('converts the Yjs shape with string leaves', () => {
    const doc = [{ nodeName: 'paragraph', children: ['"Hi"'] }];
    expect(smartenDocument(doc, 'en')[0].children).toEqual(['“Hi”']);
  });

  it('skips code blocks and code-marked text', () => {
    const doc = [
      { type: 'code_block', content: [{ type: 'text', text: 'say("hi")' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Run ' },
          { type: 'text', text: 'f("x")', marks: [{ type: 'code' }] },
          { type: 'text', text: ' now -- "ok"' },
        ],
      },
    ];
    const result = smartenDocument(doc, 'en');
    expect(result[0].content[0].text).toBe('say("hi")');
    expect(result[1].content[1].text).toBe('f("x")');
    expect(result[1].content[2].text).toBe(' now — “ok”');
  });

  it('recurses into nested blocks', () => {
    const doc = {
      type: 'blockquote',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: "it's" }] },
      ],
    };
    expect(smartenDocument(doc, 'en').content[0].content[0].text).toBe('it’s');
  });
});

describe('typographyLanguageFor', () => {
  const plan = (format: PublishFormat, extra = {}, language = 'fr') =>
    ({
      format,
      metadata: { language },
      options: { ...extra },
    }) as unknown as PublishPlan;

  it('defaults on for typeset formats and off for Markdown', () => {
    expect(typographyLanguageFor(plan(PublishFormat.EPUB))).toBe('fr');
    expect(typographyLanguageFor(plan(PublishFormat.PDF_SIMPLE))).toBe('fr');
    expect(typographyLanguageFor(plan(PublishFormat.HTML))).toBe('fr');
    expect(typographyLanguageFor(plan(PublishFormat.MARKDOWN))).toBeNull();
  });

  it('honours an explicit choice', () => {
    expect(
      typographyLanguageFor(
        plan(PublishFormat.EPUB, { typographicQuotes: false })
      )
    ).toBeNull();
    expect(
      typographyLanguageFor(
        plan(PublishFormat.MARKDOWN, { typographicQuotes: true })
      )
    ).toBe('fr');
  });

  it('falls back to English without a language', () => {
    expect(typographyLanguageFor(plan(PublishFormat.EPUB, {}, ''))).toBe('en');
  });
});
