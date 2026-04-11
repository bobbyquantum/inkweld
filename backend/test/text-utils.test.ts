import { describe, it, expect } from 'bun:test';
import {
  countWords,
  extractTextContent,
  filterMoveRootIds,
  moveRequestedElements,
  parseMoveElementsArgs,
  textToProseMirrorXml,
  toErrorResult,
  validateMoveParent,
  validateSnapshotPayloadForPersistence,
} from '../src/mcp/tools/mutation.tools';
import { expandDimensionOptions } from '../src/services/fal-model-metadata.service';
import {
  decodeXmlEntities,
  xmlContentToText,
  sanitizeFilename,
  skipTopLevelWhitespace,
} from '../src/utils/xml-utils';
import { escapeHtml } from '../src/routes/document.routes';

describe('textToProseMirrorXml', () => {
  it('should return empty paragraph for whitespace-only input', () => {
    expect(textToProseMirrorXml('')).toBe('<paragraph></paragraph>');
    expect(textToProseMirrorXml('   ')).toBe('<paragraph></paragraph>');
  });

  it('should wrap plain text in paragraph tags', () => {
    expect(textToProseMirrorXml('Hello world')).toBe('<paragraph>Hello world</paragraph>');
  });

  it('should escape XML special characters', () => {
    const result = textToProseMirrorXml('a & b < c > d "e" \'f\'');
    expect(result).toBe(
      '<paragraph>a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;</paragraph>'
    );
  });

  it('should split on double newlines into separate paragraphs', () => {
    const result = textToProseMirrorXml('First paragraph\n\nSecond paragraph');
    expect(result).toBe(
      '<paragraph>First paragraph</paragraph><paragraph>Second paragraph</paragraph>'
    );
  });

  it('should convert single newlines to hard_break elements', () => {
    const result = textToProseMirrorXml('Line 1\nLine 2');
    expect(result).toBe('<paragraph>Line 1<hard_break/>Line 2</paragraph>');
  });

  it('should handle triple+ newlines as paragraph break', () => {
    const result = textToProseMirrorXml('A\n\n\nB');
    expect(result).toBe('<paragraph>A</paragraph><paragraph>B</paragraph>');
  });

  it('should handle mixed paragraphs and line breaks', () => {
    const result = textToProseMirrorXml('Line 1\nLine 2\n\nParagraph 2');
    expect(result).toBe(
      '<paragraph>Line 1<hard_break/>Line 2</paragraph><paragraph>Paragraph 2</paragraph>'
    );
  });
});

describe('decodeXmlEntities', () => {
  it('should decode named XML entities', () => {
    expect(decodeXmlEntities('&amp;')).toBe('&');
    expect(decodeXmlEntities('&lt;')).toBe('<');
    expect(decodeXmlEntities('&gt;')).toBe('>');
    expect(decodeXmlEntities('&quot;')).toBe('"');
    expect(decodeXmlEntities('&apos;')).toBe("'");
  });

  it('should decode decimal numeric references', () => {
    expect(decodeXmlEntities('&#65;')).toBe('A');
    expect(decodeXmlEntities('&#97;')).toBe('a');
    expect(decodeXmlEntities('&#169;')).toBe('\u00A9'); // ©
  });

  it('should decode hex numeric references', () => {
    expect(decodeXmlEntities('&#x41;')).toBe('A');
    expect(decodeXmlEntities('&#x61;')).toBe('a');
    expect(decodeXmlEntities('&#xA9;')).toBe('\u00A9'); // ©
  });

  it('should decode multiple entities in a string', () => {
    expect(decodeXmlEntities('a &amp; b &lt; c')).toBe('a & b < c');
  });

  it('should pass through text without entities unchanged', () => {
    expect(decodeXmlEntities('hello world')).toBe('hello world');
  });

  it('should handle all entity types in one string', () => {
    expect(decodeXmlEntities('&lt;div class=&quot;test&quot;&gt;&#65;&#x42;&lt;/div&gt;')).toBe(
      '<div class="test">AB</div>'
    );
  });
});

describe('xmlContentToText', () => {
  it('should strip all tags and return plain text', () => {
    expect(xmlContentToText('<paragraph>Hello world</paragraph>')).toBe('Hello world');
  });

  it('should convert block-level closing tags to newlines', () => {
    const result = xmlContentToText('<paragraph>First</paragraph><paragraph>Second</paragraph>');
    expect(result).toBe('First\nSecond');
  });

  it('should strip inline tags entirely', () => {
    expect(xmlContentToText('<paragraph>Hello <hard_break/>world</paragraph>')).toBe('Hello world');
  });

  it('should decode HTML entities', () => {
    expect(xmlContentToText('<paragraph>a &amp; b &lt; c &gt; d &quot;e&quot;</paragraph>')).toBe(
      'a & b < c > d "e"'
    );
  });

  it('should decode &#39; entity', () => {
    expect(xmlContentToText('<paragraph>it&#39;s</paragraph>')).toBe("it's");
  });

  it('should handle heading closing tags as newlines', () => {
    const xml = '<heading level="1">Title</heading><paragraph>Body</paragraph>';
    expect(xmlContentToText(xml)).toBe('Title\nBody');
  });

  it('should trim leading and trailing whitespace', () => {
    expect(xmlContentToText('<paragraph>  Hello  </paragraph>')).toBe('Hello');
  });

  it('should return empty string for empty XML', () => {
    expect(xmlContentToText('<paragraph></paragraph>')).toBe('');
  });
});

describe('sanitizeFilename', () => {
  it('should pass through a safe filename unchanged', () => {
    expect(sanitizeFilename('document.pdf')).toBe('document.pdf');
  });

  it('should remove double quotes', () => {
    expect(sanitizeFilename('my "file".pdf')).toBe('my file.pdf');
  });

  it('should remove backslashes', () => {
    expect(sanitizeFilename('path\\file.pdf')).toBe('pathfile.pdf');
  });

  it('should remove carriage returns and newlines', () => {
    expect(sanitizeFilename('file\r\nname.pdf')).toBe('filename.pdf');
  });

  it('should replace non-ASCII characters with underscore', () => {
    expect(sanitizeFilename('café.pdf')).toBe('caf_.pdf');
  });

  it('should replace non-printable ASCII with underscore', () => {
    expect(sanitizeFilename('file\x01name.pdf')).toBe('file_name.pdf');
  });

  it('should handle multiple replaceable characters', () => {
    expect(sanitizeFilename('"bad\nfile\\name".pdf')).toBe('badfilename.pdf');
  });
});

describe('escapeHtml', () => {
  it('should escape ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('should escape angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('should escape double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('should escape all special characters together', () => {
    expect(escapeHtml('<a href="x&y">')).toBe('&lt;a href=&quot;x&amp;y&quot;&gt;');
  });

  it('should pass through safe text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('should handle multiple occurrences with replaceAll', () => {
    expect(escapeHtml('a & b & c')).toBe('a &amp; b &amp; c');
    expect(escapeHtml('<<>>')).toBe('&lt;&lt;&gt;&gt;');
  });
});

describe('filterMoveRootIds', () => {
  it('keeps ancestor and drops selected descendants', () => {
    const elements = [
      {
        id: 'folder',
        name: 'Folder',
        type: 'FOLDER',
        parentId: null,
        level: 0,
        expandable: true,
        order: 0,
        version: 0,
        metadata: {},
      },
      {
        id: 'child',
        name: 'Child',
        type: 'ITEM',
        parentId: 'folder',
        level: 1,
        expandable: false,
        order: 1,
        version: 0,
        metadata: {},
      },
      {
        id: 'grandchild',
        name: 'Grandchild',
        type: 'ITEM',
        parentId: 'child',
        level: 2,
        expandable: false,
        order: 2,
        version: 0,
        metadata: {},
      },
      {
        id: 'peer',
        name: 'Peer',
        type: 'ITEM',
        parentId: null,
        level: 0,
        expandable: false,
        order: 3,
        version: 0,
        metadata: {},
      },
    ];

    const filtered = filterMoveRootIds(elements, ['folder', 'child', 'grandchild', 'peer']);
    expect(filtered).toEqual(['folder', 'peer']);
  });

  it('keeps ids that are not present in the element array', () => {
    const filtered = filterMoveRootIds([], ['missing-id']);
    expect(filtered).toEqual(['missing-id']);
  });
});

describe('validateSnapshotPayloadForPersistence', () => {
  it('returns an error when ITEM xml content is empty', () => {
    const error = validateSnapshotPayloadForPersistence('ITEM', 'doc-1', '  ', null);
    expect(error).toContain('failed to extract document content');
  });

  it('returns an error when WORLDBUILDING data is missing', () => {
    const error = validateSnapshotPayloadForPersistence('WORLDBUILDING', 'wb-1', '', null);
    expect(error).toContain('failed to extract worldbuilding data');
  });

  it('returns null when payload is valid', () => {
    const itemOk = validateSnapshotPayloadForPersistence(
      'ITEM',
      'doc-1',
      '<paragraph>ok</paragraph>',
      null
    );
    const wbOk = validateSnapshotPayloadForPersistence('WORLDBUILDING', 'wb-1', '', {
      name: 'Hero',
    });

    expect(itemOk).toBeNull();
    expect(wbOk).toBeNull();
  });
});

describe('skipTopLevelWhitespace', () => {
  it('returns pos unchanged when char is a tag opener', () => {
    expect(skipTopLevelWhitespace('<p>hello</p>', 0)).toBe(0);
  });

  it('returns pos unchanged when char is not whitespace', () => {
    expect(skipTopLevelWhitespace('abc', 0)).toBe(0);
  });

  it('skips pure whitespace to the next tag', () => {
    const xml = '  \n  <p>hi</p>';
    expect(skipTopLevelWhitespace(xml, 0)).toBe(5);
  });

  it('returns end of string when no tag follows', () => {
    const xml = '   ';
    expect(skipTopLevelWhitespace(xml, 0)).toBe(3);
  });

  it('does not skip whitespace that contains non-whitespace chars', () => {
    const xml = ' x <p>';
    expect(skipTopLevelWhitespace(xml, 0)).toBe(0);
  });
});

describe('parseMoveElementsArgs', () => {
  it('returns parsed elementIds and newParentId when valid', () => {
    const result = parseMoveElementsArgs({ elementIds: ['a', 'b'], newParentId: 'parent-1' });
    expect(result).toEqual({ elementIds: ['a', 'b'], newParentId: 'parent-1' });
  });

  it('returns null newParentId when not provided', () => {
    const result = parseMoveElementsArgs({ elementIds: ['a'] });
    expect(result).toEqual({ elementIds: ['a'], newParentId: null });
  });

  it('returns null newParentId for empty string', () => {
    const result = parseMoveElementsArgs({ elementIds: ['a'], newParentId: '' });
    expect(result).toEqual({ elementIds: ['a'], newParentId: null });
  });

  it('returns error when elementIds is missing', () => {
    const result = parseMoveElementsArgs({});
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.isError).toBe(true);
      expect(result.error.content[0].text).toContain('elementIds');
    }
  });

  it('returns error when elementIds is empty array', () => {
    const result = parseMoveElementsArgs({ elementIds: [] });
    expect('error' in result).toBe(true);
  });

  it('returns error when elementIds is not an array', () => {
    const result = parseMoveElementsArgs({ elementIds: 'not-array' });
    expect('error' in result).toBe(true);
  });
});

describe('validateMoveParent', () => {
  const elements = [
    {
      id: 'folder-1',
      name: 'Folder',
      type: 'FOLDER',
      parentId: null,
      level: 0,
      expandable: true,
      order: 0,
      version: 0,
      metadata: {},
    },
    {
      id: 'item-1',
      name: 'Item',
      type: 'ITEM',
      parentId: null,
      level: 0,
      expandable: false,
      order: 1,
      version: 0,
      metadata: {},
    },
  ];

  it('returns undefined when newParentId is null', () => {
    expect(validateMoveParent(elements, null)).toBeUndefined();
  });

  it('returns undefined when parent is a FOLDER', () => {
    expect(validateMoveParent(elements, 'folder-1')).toBeUndefined();
  });

  it('returns error when parent is not found', () => {
    const result = validateMoveParent(elements, 'nonexistent');
    expect(result).toBeDefined();
    expect(result?.isError).toBe(true);
    expect(result?.content[0].text).toContain('not found');
  });

  it('returns error when parent is not a FOLDER', () => {
    const result = validateMoveParent(elements, 'item-1');
    expect(result).toBeDefined();
    expect(result?.isError).toBe(true);
    expect(result?.content[0].text).toContain('not a folder');
  });
});

describe('toErrorResult', () => {
  it('creates an error result with text content', () => {
    const result = toErrorResult('Something went wrong');
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: 'text', text: 'Something went wrong' });
  });
});

describe('countWords', () => {
  it('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('returns 0 for whitespace-only string', () => {
    expect(countWords('   \t\n  ')).toBe(0);
  });

  it('returns 1 for single word', () => {
    expect(countWords('hello')).toBe(1);
  });

  it('counts words separated by various whitespace', () => {
    expect(countWords('one two  three\tfour\nfive')).toBe(5);
  });

  it('handles leading and trailing whitespace', () => {
    expect(countWords('  hello world  ')).toBe(2);
  });
});

describe('moveRequestedElements', () => {
  const makeElement = (id: string, name: string, type: string, level: number, order: number) => ({
    id,
    name,
    type,
    parentId: null,
    level,
    expandable: type === 'FOLDER',
    order,
    version: 0,
    metadata: {},
  });

  it('moves a single root element to a folder', () => {
    const folder = makeElement('f1', 'Folder', 'FOLDER', 0, 0);
    const item = makeElement('i1', 'Item', 'ITEM', 0, 1);
    const result = moveRequestedElements([folder, item], ['i1'], 'f1');
    expect(result.movedElements).toEqual(['Item']);
    expect(result.errors).toEqual([]);
    // Item should now be inside the folder (level 1)
    const moved = result.currentElements.find((e) => e.id === 'i1');
    expect(moved?.level).toBe(1);
  });

  it('moves multiple elements to root (null parent)', () => {
    const folder = makeElement('f1', 'Folder', 'FOLDER', 0, 0);
    const item1 = { ...makeElement('i1', 'Item1', 'ITEM', 1, 1), parentId: 'f1' };
    const item2 = { ...makeElement('i2', 'Item2', 'ITEM', 1, 2), parentId: 'f1' };
    const result = moveRequestedElements([folder, item1, item2], ['i1', 'i2'], null);
    expect(result.movedElements).toEqual(['Item1', 'Item2']);
    expect(result.errors).toEqual([]);
  });

  it('collects errors for elements that fail to move', () => {
    const item = makeElement('i1', 'Item', 'ITEM', 0, 0);
    // Moving to a non-existent parent ID will throw in moveElement
    const result = moveRequestedElements([item], ['i1'], 'nonexistent');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('i1');
  });

  it('returns empty results for empty elementIds', () => {
    const item = makeElement('i1', 'Item', 'ITEM', 0, 0);
    const result = moveRequestedElements([item], [], null);
    expect(result.movedElements).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.currentElements).toEqual([item]);
  });
});

describe('extractTextContent', () => {
  it('extracts text from a simple node with toString', () => {
    const fragment = {
      toString: () => 'Hello world',
    };
    expect(extractTextContent(fragment)).toBe('Hello world');
  });

  it('skips nodes whose toString starts with <', () => {
    const fragment = {
      toString: () => '<paragraph>',
      toArray: () => [{ toString: () => 'child text' }],
    };
    expect(extractTextContent(fragment)).toBe('child text');
  });

  it('traverses nested children via toArray', () => {
    const fragment = {
      toString: () => '<doc>',
      toArray: () => [
        { toString: () => 'first' },
        {
          toString: () => '<p>',
          toArray: () => [{ toString: () => 'second' }],
        },
      ],
    };
    expect(extractTextContent(fragment)).toBe('first second');
  });

  it('returns empty string for null fragment', () => {
    expect(extractTextContent(null)).toBe('');
  });

  it('handles fragment with no toArray by using toString', () => {
    // Plain objects have toString() returning "[object Object]" which is non-XML, so treated as text
    expect(extractTextContent({})).toBe('[object Object]');
  });

  it('trims whitespace from result', () => {
    const fragment = {
      toString: () => '  hello  ',
    };
    expect(extractTextContent(fragment)).toBe('hello');
  });
});

describe('expandDimensionOptions', () => {
  it('returns empty array for undefined input', () => {
    expect(expandDimensionOptions(undefined)).toEqual([]);
  });

  it('returns empty array for empty options', () => {
    expect(expandDimensionOptions([])).toEqual([]);
  });

  it('computes cross product of widths and heights', () => {
    const result = expandDimensionOptions([
      {
        properties: {
          width: { enum: [512, 1024] },
          height: { enum: [512, 768] },
        },
      },
    ]);
    expect(result).toEqual(['512x512', '512x768', '1024x512', '1024x768']);
  });

  it('skips options without both width and height enums', () => {
    const result = expandDimensionOptions([
      { properties: { width: { enum: [512] } } },
      {
        properties: {
          width: { enum: [256] },
          height: { enum: [256] },
        },
      },
    ]);
    expect(result).toEqual(['256x256']);
  });

  it('deduplicates identical dimension strings', () => {
    const result = expandDimensionOptions([
      {
        properties: {
          width: { enum: [512] },
          height: { enum: [512] },
        },
      },
      {
        properties: {
          width: { enum: [512] },
          height: { enum: [512] },
        },
      },
    ]);
    expect(result).toEqual(['512x512']);
  });

  it('handles multiple options with different dimensions', () => {
    const result = expandDimensionOptions([
      {
        properties: {
          width: { enum: [512] },
          height: { enum: [512] },
        },
      },
      {
        properties: {
          width: { enum: [1024] },
          height: { enum: [1024] },
        },
      },
    ]);
    expect(result).toEqual(['512x512', '1024x1024']);
  });
});
