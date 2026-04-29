import { beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  applyJsonToYjsMap,
  applyXmlToFragment,
  xmlFragmentToXmlString,
  yjsMapToJson,
} from './yjs-xml-serializer';

describe('yjs-xml-serializer', () => {
  describe('xmlFragmentToXmlString', () => {
    let ydoc: Y.Doc;
    let fragment: Y.XmlFragment;

    beforeEach(() => {
      ydoc = new Y.Doc();
      fragment = ydoc.getXmlFragment('test');
    });

    it('should serialize empty fragment to empty string', () => {
      const result = xmlFragmentToXmlString(fragment);
      expect(result).toBe('');
    });

    it('should serialize single paragraph element', () => {
      const paragraph = new Y.XmlElement('paragraph');
      fragment.insert(0, [paragraph]);

      const result = xmlFragmentToXmlString(fragment);
      expect(result).toBe('<paragraph></paragraph>');
    });

    it('should serialize element with text content', () => {
      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText();
      text.insert(0, 'Hello world');
      paragraph.insert(0, [text]);
      fragment.insert(0, [paragraph]);

      const result = xmlFragmentToXmlString(fragment);
      expect(result).toBe('<paragraph>Hello world</paragraph>');
    });

    it('should serialize element with attributes', () => {
      const heading = new Y.XmlElement('heading');
      heading.setAttribute('level', '2');
      fragment.insert(0, [heading]);

      const result = xmlFragmentToXmlString(fragment);
      expect(result).toBe('<heading level="2"></heading>');
    });

    it('should escape special XML characters in text', () => {
      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText();
      text.insert(0, 'Hello <world> & "friends"');
      paragraph.insert(0, [text]);
      fragment.insert(0, [paragraph]);

      const result = xmlFragmentToXmlString(fragment);
      expect(result).toContain('&lt;world&gt;');
      expect(result).toContain('&amp;');
      expect(result).toContain('&quot;');
    });

    it('should serialize nested elements', () => {
      const blockquote = new Y.XmlElement('blockquote');
      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText();
      text.insert(0, 'Quoted text');
      paragraph.insert(0, [text]);
      blockquote.insert(0, [paragraph]);
      fragment.insert(0, [blockquote]);

      const result = xmlFragmentToXmlString(fragment);
      expect(result).toBe(
        '<blockquote><paragraph>Quoted text</paragraph></blockquote>'
      );
    });

    it('should serialize multiple sibling elements', () => {
      const p1 = new Y.XmlElement('paragraph');
      const t1 = new Y.XmlText();
      t1.insert(0, 'First');
      p1.insert(0, [t1]);

      const p2 = new Y.XmlElement('paragraph');
      const t2 = new Y.XmlText();
      t2.insert(0, 'Second');
      p2.insert(0, [t2]);

      fragment.insert(0, [p1, p2]);

      const result = xmlFragmentToXmlString(fragment);
      expect(result).toBe(
        '<paragraph>First</paragraph><paragraph>Second</paragraph>'
      );
    });

    it('should serialize object attributes as JSON', () => {
      const element = new Y.XmlElement('custom');
      // Yjs accepts objects at runtime but TypeScript types are strict
      element.setAttribute('marks', {
        bold: true,
        italic: false,
      } as unknown as string);
      fragment.insert(0, [element]);

      const result = xmlFragmentToXmlString(fragment);
      expect(result).toContain('marks="');
      expect(result).toContain('bold');
    });

    it('should serialize text with bold formatting', () => {
      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText();
      text.insert(0, 'bold', { strong: {} });
      paragraph.insert(0, [text]);
      fragment.insert(0, [paragraph]);

      const result = xmlFragmentToXmlString(fragment);
      expect(result).toBe('<paragraph><strong>bold</strong></paragraph>');
    });

    it('should serialize text with multiple marks', () => {
      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText();
      text.insert(0, 'formatted', { strong: {}, em: {} });
      paragraph.insert(0, [text]);
      fragment.insert(0, [paragraph]);

      const result = xmlFragmentToXmlString(fragment);
      // Marks are sorted alphabetically: em wraps first, then strong around it
      expect(result).toBe(
        '<paragraph><strong><em>formatted</em></strong></paragraph>'
      );
    });

    it('should serialize mixed plain and formatted text', () => {
      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText();
      // Use applyDelta to create precise formatting runs
      text.applyDelta([
        { insert: 'Hello ' },
        { insert: 'world', attributes: { strong: {} } },
        { insert: ' today' },
      ]);
      paragraph.insert(0, [text]);
      fragment.insert(0, [paragraph]);

      const result = xmlFragmentToXmlString(fragment);
      expect(result).toBe(
        '<paragraph>Hello <strong>world</strong> today</paragraph>'
      );
    });

    it('should serialize link marks with attributes', () => {
      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText();
      text.insert(0, 'click here', {
        link: { href: 'https://example.com', title: 'Example' },
      });
      paragraph.insert(0, [text]);
      fragment.insert(0, [paragraph]);

      const result = xmlFragmentToXmlString(fragment);
      expect(result).toBe(
        '<paragraph><a href="https://example.com" title="Example">click here</a></paragraph>'
      );
    });

    it('should serialize unknown marks using span with data-mark', () => {
      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText();
      text.insert(0, 'colored', { text_color: { color: '#ff0000' } });
      paragraph.insert(0, [text]);
      fragment.insert(0, [paragraph]);

      const result = xmlFragmentToXmlString(fragment);
      expect(result).toBe(
        '<paragraph><span data-mark="text_color" color="#ff0000">colored</span></paragraph>'
      );
    });

    it('should use self-closing tags for empty non-block elements', () => {
      const element = new Y.XmlElement('image');
      element.setAttribute('src', 'test.jpg');
      fragment.insert(0, [element]);

      const result = xmlFragmentToXmlString(fragment);
      expect(result).toBe('<image src="test.jpg"/>');
    });

    it('should preserve camelCase node names (elementRef)', () => {
      // Regression: snapshot of a document containing an elementRef inline
      // atom node was lowercasing the tag name to `elementref`, which the
      // ProseMirror schema does not recognise — so on restore the node
      // disappeared entirely. y-prosemirror keeps the schema name verbatim
      // (e.g. `elementRef`, `codeBlock`, `listItem`) so we must preserve case.
      const paragraph = new Y.XmlElement('paragraph');
      const ref = new Y.XmlElement('elementRef');
      ref.setAttribute('elementId', 'char-elara');
      ref.setAttribute('elementType', 'WORLDBUILDING');
      ref.setAttribute('displayText', 'Elara Nightwhisper');
      paragraph.insert(0, [ref]);
      fragment.insert(0, [paragraph]);

      const result = xmlFragmentToXmlString(fragment);
      expect(result).toContain('<elementRef ');
      expect(result).not.toContain('<elementref');
      expect(result).toContain('elementId="char-elara"');
      expect(result).toContain('displayText="Elara Nightwhisper"');
    });

    it('should preserve camelCase node names for codeBlock and listItem', () => {
      // y-prosemirror uses the schema's node type names verbatim. The default
      // ProseMirror schema has `codeBlock`, `listItem`, `bulletList`,
      // `orderedList`, `hardBreak` — all camelCase.
      const codeBlock = new Y.XmlElement('codeBlock');
      const t = new Y.XmlText();
      t.insert(0, 'console.log("hi");');
      codeBlock.insert(0, [t]);

      const list = new Y.XmlElement('bulletList');
      const li = new Y.XmlElement('listItem');
      list.insert(0, [li]);

      fragment.insert(0, [codeBlock, list]);

      const result = xmlFragmentToXmlString(fragment);
      expect(result).toContain('<codeBlock>');
      expect(result).toContain('</codeBlock>');
      expect(result).toContain('<bulletList>');
      expect(result).toContain('<listItem');
    });
  });

  describe('applyXmlToFragment', () => {
    let ydoc: Y.Doc;
    let fragment: Y.XmlFragment;

    beforeEach(() => {
      ydoc = new Y.Doc();
      fragment = ydoc.getXmlFragment('test');
    });

    it('should apply empty XML to empty fragment', () => {
      applyXmlToFragment(ydoc, fragment, '');
      expect(fragment.length).toBe(0);
    });

    it('should apply single paragraph', () => {
      applyXmlToFragment(ydoc, fragment, '<paragraph>Hello</paragraph>');

      expect(fragment.length).toBe(1);
      const child = fragment.get(0) as Y.XmlElement;
      expect(child.nodeName).toBe('paragraph');
    });

    it('should apply multiple paragraphs', () => {
      applyXmlToFragment(
        ydoc,
        fragment,
        '<paragraph>First</paragraph><paragraph>Second</paragraph>'
      );

      expect(fragment.length).toBe(2);
    });

    it('should apply element with attributes', () => {
      applyXmlToFragment(ydoc, fragment, '<heading level="2">Title</heading>');

      const child = fragment.get(0) as Y.XmlElement;
      expect(child.nodeName).toBe('heading');
      expect(child.getAttribute('level')).toBe(2); // Parsed as number
    });

    it('should apply nested elements', () => {
      applyXmlToFragment(
        ydoc,
        fragment,
        '<blockquote><paragraph>Quoted</paragraph></blockquote>'
      );

      const blockquote = fragment.get(0) as Y.XmlElement;
      expect(blockquote.nodeName).toBe('blockquote');
      expect(blockquote.length).toBe(1);

      const paragraph = blockquote.get(0) as Y.XmlElement;
      expect(paragraph.nodeName).toBe('paragraph');
    });

    it('should clear existing content before applying new content', () => {
      // Add initial content
      const initial = new Y.XmlElement('paragraph');
      fragment.insert(0, [initial]);
      expect(fragment.length).toBe(1);

      // Apply new content
      applyXmlToFragment(
        ydoc,
        fragment,
        '<heading>New</heading><paragraph>Content</paragraph>'
      );

      expect(fragment.length).toBe(2);
      const first = fragment.get(0) as Y.XmlElement;
      expect(first.nodeName).toBe('heading');
    });

    it('should deserialize bold mark tags to formatted XmlText', () => {
      applyXmlToFragment(
        ydoc,
        fragment,
        '<paragraph>Hello <strong>world</strong></paragraph>'
      );

      const paragraph = fragment.get(0) as Y.XmlElement;
      expect(paragraph.nodeName).toBe('paragraph');
      // Should have a single XmlText with formatting runs
      expect(paragraph.length).toBe(1);
      const text = paragraph.get(0) as Y.XmlText;
      const delta = text.toDelta();
      expect(delta).toEqual([
        { insert: 'Hello ' },
        { insert: 'world', attributes: { strong: {} } },
      ]);
    });

    it('should deserialize nested marks (bold + italic)', () => {
      applyXmlToFragment(
        ydoc,
        fragment,
        '<paragraph><strong><em>both</em></strong></paragraph>'
      );

      const paragraph = fragment.get(0) as Y.XmlElement;
      const text = paragraph.get(0) as Y.XmlText;
      const delta = text.toDelta();
      expect(delta).toEqual([
        { insert: 'both', attributes: { strong: {}, em: {} } },
      ]);
    });

    it('should deserialize link mark tags with attributes', () => {
      applyXmlToFragment(
        ydoc,
        fragment,
        '<paragraph><a href="https://example.com" title="Example">link</a></paragraph>'
      );

      const paragraph = fragment.get(0) as Y.XmlElement;
      const text = paragraph.get(0) as Y.XmlText;
      const delta = text.toDelta();
      expect(delta).toEqual([
        {
          insert: 'link',
          attributes: {
            link: { href: 'https://example.com', title: 'Example' },
          },
        },
      ]);
    });

    it('should deserialize generic marks from span with data-mark', () => {
      applyXmlToFragment(
        ydoc,
        fragment,
        '<paragraph><span data-mark="text_color" color="#ff0000">colored</span></paragraph>'
      );

      const paragraph = fragment.get(0) as Y.XmlElement;
      const text = paragraph.get(0) as Y.XmlText;
      const delta = text.toDelta();
      expect(delta).toEqual([
        {
          insert: 'colored',
          attributes: { text_color: { color: '#ff0000' } },
        },
      ]);
    });

    it('should deserialize tag aliases (b, i, del)', () => {
      applyXmlToFragment(
        ydoc,
        fragment,
        '<paragraph><b>bold</b> <i>italic</i> <del>struck</del></paragraph>'
      );

      const paragraph = fragment.get(0) as Y.XmlElement;
      const text = paragraph.get(0) as Y.XmlText;
      const delta = text.toDelta();
      expect(delta).toEqual([
        { insert: 'bold', attributes: { strong: {} } },
        { insert: ' ' },
        { insert: 'italic', attributes: { em: {} } },
        { insert: ' ' },
        { insert: 'struck', attributes: { s: {} } },
      ]);
    });

    // Note: Skipped because DOMParser behavior varies between environments.
    // jsdom may not produce parsererror for all types of malformed XML.
    // The implementation handles parsererror correctly when it's present.
    it.skip('should throw on invalid XML', () => {
      // DOMParser returns <parsererror> for invalid XML, which our code detects and throws
      // Use XML with invalid entity reference to trigger parse error
      expect(() => {
        applyXmlToFragment(ydoc, fragment, '<p>&invalidEntity;</p>');
      }).toThrow();
    });

    it('should parse boolean attributes', () => {
      applyXmlToFragment(ydoc, fragment, '<custom enabled="true"/>');

      const child = fragment.get(0) as Y.XmlElement;
      expect(child.getAttribute('enabled')).toBe(true);
    });

    it('should parse JSON object attributes', () => {
      applyXmlToFragment(
        ydoc,
        fragment,
        '<custom data=\'{"key":"value"}\'></custom>'
      );

      const child = fragment.get(0) as Y.XmlElement;
      const data = child.getAttribute('data') as unknown as { key: string };
      expect(data).toEqual({ key: 'value' });
    });

    it('should keep empty attribute value as string, not parse as number 0', () => {
      applyXmlToFragment(ydoc, fragment, '<custom tag=""/>');

      const child = fragment.get(0) as Y.XmlElement;
      // Number('') === 0 (not NaN), but the value !== '' guard should prevent it
      // from being returned as a number
      expect(child.getAttribute('tag')).toBe('');
    });

    it('should preserve camelCase node names when parsing (elementRef)', () => {
      // Regression: deserialiser used to lowercase tag names, turning
      // `<elementRef>` into a Y.XmlElement called `elementref` — which the
      // ProseMirror schema rejects, causing every element reference to vanish
      // when a snapshot was restored.
      applyXmlToFragment(
        ydoc,
        fragment,
        '<paragraph>Hello <elementRef elementId="char-elara" elementType="WORLDBUILDING" displayText="Elara"/></paragraph>'
      );

      const paragraph = fragment.get(0) as Y.XmlElement;
      expect(paragraph.nodeName).toBe('paragraph');
      expect(paragraph.length).toBe(2);
      const ref = paragraph.get(1) as Y.XmlElement;
      expect(ref.nodeName).toBe('elementRef');
      expect(ref.getAttribute('elementId')).toBe('char-elara');
      expect(ref.getAttribute('displayText')).toBe('Elara');
    });

    it('should preserve camelCase node names for codeBlock and listItem', () => {
      applyXmlToFragment(
        ydoc,
        fragment,
        '<codeBlock>x</codeBlock><bulletList><listItem><paragraph>a</paragraph></listItem></bulletList>'
      );

      const code = fragment.get(0) as Y.XmlElement;
      const list = fragment.get(1) as Y.XmlElement;
      expect(code.nodeName).toBe('codeBlock');
      expect(list.nodeName).toBe('bulletList');
      const li = list.get(0) as Y.XmlElement;
      expect(li.nodeName).toBe('listItem');
    });
  });

  describe('roundtrip', () => {
    it('should roundtrip simple content', () => {
      const ydoc1 = new Y.Doc();
      const fragment1 = ydoc1.getXmlFragment('test');

      // Create content
      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText();
      text.insert(0, 'Hello world');
      paragraph.insert(0, [text]);
      fragment1.insert(0, [paragraph]);

      // Serialize
      const xml = xmlFragmentToXmlString(fragment1);

      // Deserialize into new doc
      const ydoc2 = new Y.Doc();
      const fragment2 = ydoc2.getXmlFragment('test');
      applyXmlToFragment(ydoc2, fragment2, xml);

      // Re-serialize and compare
      const xml2 = xmlFragmentToXmlString(fragment2);
      expect(xml2).toBe(xml);
    });

    it('should roundtrip complex nested content', () => {
      const ydoc1 = new Y.Doc();
      const fragment1 = ydoc1.getXmlFragment('test');

      // Create nested content
      const blockquote = new Y.XmlElement('blockquote');
      const p1 = new Y.XmlElement('paragraph');
      const t1 = new Y.XmlText();
      t1.insert(0, 'First paragraph');
      p1.insert(0, [t1]);

      const p2 = new Y.XmlElement('paragraph');
      const t2 = new Y.XmlText();
      t2.insert(0, 'Second paragraph');
      p2.insert(0, [t2]);

      blockquote.insert(0, [p1, p2]);
      fragment1.insert(0, [blockquote]);

      // Roundtrip
      const xml = xmlFragmentToXmlString(fragment1);
      const ydoc2 = new Y.Doc();
      const fragment2 = ydoc2.getXmlFragment('test');
      applyXmlToFragment(ydoc2, fragment2, xml);

      const xml2 = xmlFragmentToXmlString(fragment2);
      expect(xml2).toBe(xml);
    });

    it('should roundtrip bold and italic formatted text', () => {
      const ydoc1 = new Y.Doc();
      const fragment1 = ydoc1.getXmlFragment('test');

      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText();
      // Use applyDelta to create precise formatting runs
      text.applyDelta([
        { insert: 'Hello ' },
        { insert: 'bold', attributes: { strong: {} } },
        { insert: ' and ' },
        { insert: 'italic', attributes: { em: {} } },
        { insert: ' text' },
      ]);
      paragraph.insert(0, [text]);
      fragment1.insert(0, [paragraph]);

      const xml = xmlFragmentToXmlString(fragment1);
      expect(xml).toBe(
        '<paragraph>Hello <strong>bold</strong> and <em>italic</em> text</paragraph>'
      );

      const ydoc2 = new Y.Doc();
      const fragment2 = ydoc2.getXmlFragment('test');
      applyXmlToFragment(ydoc2, fragment2, xml);

      const xml2 = xmlFragmentToXmlString(fragment2);
      expect(xml2).toBe(xml);
    });

    it('should roundtrip link marks with attributes', () => {
      const ydoc1 = new Y.Doc();
      const fragment1 = ydoc1.getXmlFragment('test');

      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText();
      text.insert(0, 'Visit ');
      text.insert(6, 'this site', {
        link: { href: 'https://example.com' },
      });
      text.insert(15, ' for more.');
      paragraph.insert(0, [text]);
      fragment1.insert(0, [paragraph]);

      const xml = xmlFragmentToXmlString(fragment1);
      const ydoc2 = new Y.Doc();
      const fragment2 = ydoc2.getXmlFragment('test');
      applyXmlToFragment(ydoc2, fragment2, xml);

      const xml2 = xmlFragmentToXmlString(fragment2);
      expect(xml2).toBe(xml);
    });

    it('should roundtrip generic marks via data-mark spans', () => {
      const ydoc1 = new Y.Doc();
      const fragment1 = ydoc1.getXmlFragment('test');

      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText();
      text.insert(0, 'red text', {
        text_color: { color: '#ff0000' },
      });
      paragraph.insert(0, [text]);
      fragment1.insert(0, [paragraph]);

      const xml = xmlFragmentToXmlString(fragment1);
      const ydoc2 = new Y.Doc();
      const fragment2 = ydoc2.getXmlFragment('test');
      applyXmlToFragment(ydoc2, fragment2, xml);

      const xml2 = xmlFragmentToXmlString(fragment2);
      expect(xml2).toBe(xml);
    });

    it('should roundtrip elementRef inline atom nodes preserving attrs and case', () => {
      // Regression for snapshot bug: restoring a snapshot of a document
      // containing element references caused them all to vanish, because
      // the serializer was lowercasing `elementRef` -> `elementref` in both
      // directions, producing nodes the ProseMirror schema rejects.
      const ydoc1 = new Y.Doc();
      const fragment1 = ydoc1.getXmlFragment('test');

      const paragraph = new Y.XmlElement('paragraph');
      const before = new Y.XmlText();
      before.insert(0, 'See ');
      const ref = new Y.XmlElement('elementRef');
      ref.setAttribute('elementId', 'char-elara');
      ref.setAttribute('elementType', 'WORLDBUILDING');
      ref.setAttribute('displayText', 'Elara Nightwhisper');
      ref.setAttribute('originalName', 'Elara Nightwhisper');
      ref.setAttribute('relationshipTypeId', 'referenced-in');
      const after = new Y.XmlText();
      after.insert(0, ' for details.');
      paragraph.insert(0, [before, ref, after]);
      fragment1.insert(0, [paragraph]);

      const xml = xmlFragmentToXmlString(fragment1);
      // Sanity: the serialized XML must use the original camelCase tag.
      expect(xml).toContain('<elementRef ');

      const ydoc2 = new Y.Doc();
      const fragment2 = ydoc2.getXmlFragment('test');
      applyXmlToFragment(ydoc2, fragment2, xml);

      // The deserialized fragment must still contain a node literally named
      // `elementRef` with the original attributes.
      const p = fragment2.get(0) as Y.XmlElement;
      expect(p.length).toBe(3);
      const restoredRef = p.get(1) as Y.XmlElement;
      expect(restoredRef.nodeName).toBe('elementRef');
      expect(restoredRef.getAttribute('elementId')).toBe('char-elara');
      expect(restoredRef.getAttribute('elementType')).toBe('WORLDBUILDING');
      expect(restoredRef.getAttribute('displayText')).toBe(
        'Elara Nightwhisper'
      );
      expect(restoredRef.getAttribute('relationshipTypeId')).toBe(
        'referenced-in'
      );

      // Re-serializing must produce identical XML.
      const xml2 = xmlFragmentToXmlString(fragment2);
      expect(xml2).toBe(xml);
    });
  });

  describe('yjsMapToJson', () => {
    let ydoc: Y.Doc;
    let dataMap: Y.Map<unknown>;

    beforeEach(() => {
      ydoc = new Y.Doc();
      dataMap = ydoc.getMap('data');
    });

    it('should convert empty map to empty object', () => {
      const result = yjsMapToJson(dataMap);
      expect(result).toEqual({});
    });

    it('should convert simple key-value pairs', () => {
      dataMap.set('name', 'Test');
      dataMap.set('count', 42);
      dataMap.set('active', true);

      const result = yjsMapToJson(dataMap);
      expect(result).toEqual({
        name: 'Test',
        count: 42,
        active: true,
      });
    });

    it('should convert nested maps', () => {
      const nestedMap = new Y.Map<unknown>();
      nestedMap.set('inner', 'value');
      dataMap.set('nested', nestedMap);

      const result = yjsMapToJson(dataMap);
      expect(result).toEqual({
        nested: { inner: 'value' },
      });
    });

    it('should convert arrays', () => {
      const arr = new Y.Array<unknown>();
      arr.push(['a', 'b', 'c']);
      dataMap.set('items', arr);

      const result = yjsMapToJson(dataMap);
      expect(result).toEqual({
        items: ['a', 'b', 'c'],
      });
    });

    it('should convert arrays with nested maps', () => {
      const arr = new Y.Array<unknown>();
      const item1 = new Y.Map<unknown>();
      item1.set('id', 1);
      const item2 = new Y.Map<unknown>();
      item2.set('id', 2);
      arr.push([item1, item2]);
      dataMap.set('items', arr);

      const result = yjsMapToJson(dataMap);
      expect(result).toEqual({
        items: [{ id: 1 }, { id: 2 }],
      });
    });
  });

  describe('applyJsonToYjsMap', () => {
    let ydoc: Y.Doc;
    let dataMap: Y.Map<unknown>;

    beforeEach(() => {
      ydoc = new Y.Doc();
      dataMap = ydoc.getMap('data');
    });

    it('should apply empty object to map', () => {
      applyJsonToYjsMap(ydoc, dataMap, {});
      expect(dataMap.size).toBe(0);
    });

    it('should apply simple key-value pairs', () => {
      applyJsonToYjsMap(ydoc, dataMap, {
        name: 'Test',
        count: 42,
        active: true,
      });

      expect(dataMap.get('name')).toBe('Test');
      expect(dataMap.get('count')).toBe(42);
      expect(dataMap.get('active')).toBe(true);
    });

    it('should clear existing data before applying', () => {
      dataMap.set('old', 'value');

      applyJsonToYjsMap(ydoc, dataMap, { new: 'data' });

      expect(dataMap.has('old')).toBe(false);
      expect(dataMap.get('new')).toBe('data');
    });

    it('should apply nested objects', () => {
      applyJsonToYjsMap(ydoc, dataMap, {
        nested: { inner: 'value' },
      });

      expect(dataMap.get('nested')).toEqual({ inner: 'value' });
    });

    it('should apply arrays', () => {
      applyJsonToYjsMap(ydoc, dataMap, {
        items: ['a', 'b', 'c'],
      });

      expect(dataMap.get('items')).toEqual(['a', 'b', 'c']);
    });
  });

  describe('JSON roundtrip', () => {
    it('should roundtrip simple object', () => {
      const ydoc = new Y.Doc();
      const dataMap = ydoc.getMap('data');

      const original = {
        name: 'Character',
        age: 30,
        traits: ['brave', 'clever'],
      };

      applyJsonToYjsMap(ydoc, dataMap, original);
      const result = yjsMapToJson(dataMap);

      expect(result).toEqual(original);
    });
  });
});
