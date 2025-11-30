/**
 * Stub implementation of Yjs for testing
 * Prevents transpilation issues with the real Yjs library
 */

export class Doc {
  getXmlFragment(_name: string): XmlFragment {
    return new XmlFragment();
  }
  destroy(): void {}
  on(_event: string, _callback: (...args: any[]) => void): void {}
  off(_event: string, _callback: (...args: any[]) => void): void {}
}

export class XmlFragment {
  delete(_index: number, _length: number): void {}
  insert(_index: number, _content: any[]): void {}
  get length(): number {
    return 0;
  }
}

export class XmlElement {
  constructor(_name: string) {}
  insert(_index: number, _content: any[]): void {}
}

export class XmlText {
  insert(_index: number, _text: string): void {}
}

export function transact(_doc: Doc, _fn: () => void): void {
  _fn();
}

// Export everything the real yjs exports that might be used
export const applyUpdate = (_doc: Doc, _update: Uint8Array): void => {};
export const encodeStateAsUpdate = (_doc: Doc): Uint8Array => new Uint8Array();




