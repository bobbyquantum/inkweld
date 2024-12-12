import { beforeEach, describe, expect, test } from '@jest/globals';

import type { PersistenceAdapter } from '../utils.js';
import {
  getPersistence,
  getYDocSharedObjectContent,
  setPersistence,
  WSSharedDoc,
} from '../utils.js';

describe('utils', () => {
  describe('persistence', () => {
    beforeEach(() => {
      // Reset persistence before each test
      setPersistence(null as unknown as PersistenceAdapter);
    });

    test('should allow setting and getting persistence adapter', () => {
      const mockPersistence: PersistenceAdapter = {
        bindState: () => {},
        writeState: async () => Promise.resolve(),
      };

      setPersistence(mockPersistence);
      expect(getPersistence()).toBe(mockPersistence);
    });
  });

  describe('getYDocSharedObjectContent', () => {
    let doc: WSSharedDoc;

    beforeEach(() => {
      doc = new WSSharedDoc('test-doc');
    });

    test('should return array content', () => {
      const array = doc.getArray('testArray');
      array.insert(0, ['item1', 'item2']);

      const content = getYDocSharedObjectContent(doc, 'testArray', 'Array');
      expect(content).toEqual(['item1', 'item2']);
    });

    test('should return map content', () => {
      const map = doc.getMap('testMap');
      map.set('key1', 'value1');
      map.set('key2', 'value2');

      const content = getYDocSharedObjectContent(doc, 'testMap', 'Map');
      expect(content).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
    });

    test('should return text content', () => {
      const text = doc.getText('testText');
      text.insert(0, 'Hello World');

      const content = getYDocSharedObjectContent(doc, 'testText', 'Text');
      expect(content).toBe('Hello World');
    });

    test('should return empty object for unknown type', () => {
      const content = getYDocSharedObjectContent(doc, 'test', 'Unknown');
      expect(content).toEqual({});
    });
  });
});
