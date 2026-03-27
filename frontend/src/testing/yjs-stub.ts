/**
 * Stub implementation of Yjs for testing
 * Prevents transpilation issues with the real Yjs library
 */

export class Doc {
  getXmlFragment(_name: string): XmlFragment {
    return new XmlFragment();
  }
  destroy(): void {
    // Intentional no-op: stub for testing
  }
  on(_event: string, _callback: (...args: any[]) => void): void {
    // Intentional no-op: stub for testing
  }
  off(_event: string, _callback: (...args: any[]) => void): void {
    // Intentional no-op: stub for testing
  }
}

export class XmlFragment {
  delete(_index: number, _length: number): void {
    // Intentional no-op: stub for testing
  }
  insert(_index: number, _content: any[]): void {
    // Intentional no-op: stub for testing
  }
  get length(): number {
    return 0;
  }
}

export class XmlElement {
  constructor(_name: string) {
    // Intentional no-op: stub for testing
  }
  insert(_index: number, _content: any[]): void {
    // Intentional no-op: stub for testing
  }
}

export class XmlText {
  insert(_index: number, _text: string): void {
    // Intentional no-op: stub for testing
  }
}

export function transact(_doc: Doc, _fn: () => void): void {
  _fn();
}

// Export everything the real yjs exports that might be used
export const applyUpdate = (_doc: Doc, _update: Uint8Array): void => {};
export const encodeStateAsUpdate = (_doc: Doc): Uint8Array => new Uint8Array();
