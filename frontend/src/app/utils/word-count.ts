import { extendedSchema } from '@components/element-ref/extended-schema';
import { type Node as ProseMirrorNode } from 'prosemirror-model';
import * as Y from 'yjs';

/**
 * Word counting for prose documents, shared by the editor's status bar and
 * snapshots so the two always agree: whitespace-separated words of the
 * document's text, with a space between blocks (so the last word of one
 * paragraph never runs into the first word of the next) and nothing for
 * leaf nodes such as images or hard breaks.
 */

/** Count whitespace-separated words in plain text. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Count the words in a ProseMirror document, as the editor shows them. */
export function countDocumentWords(doc: ProseMirrorNode): number {
  return countWords(doc.textBetween(0, doc.content.size, ' '));
}

/**
 * Count the words in a document's Yjs fragment (the `prosemirror` fragment
 * y-prosemirror binds), giving the same count as {@link countDocumentWords}
 * on the document it holds without building a ProseMirror node.
 */
export function countFragmentWords(fragment: Y.XmlFragment): number {
  return countWords(fragmentText(fragment));
}

function fragmentText(node: Y.XmlFragment | Y.XmlElement): string {
  let text = '';
  for (const child of node.toArray()) {
    if (child instanceof Y.XmlText) {
      // toDelta() rather than toString(): toString() wraps formatted runs in
      // their mark tags, which would glue onto the words.
      for (const op of child.toDelta() as { insert?: unknown }[]) {
        if (typeof op.insert === 'string') text += op.insert;
      }
    } else if (child instanceof Y.XmlElement) {
      const inner = fragmentText(child);
      text += isBlockNode(child.nodeName) ? ` ${inner} ` : inner;
    }
  }
  return text;
}

function isBlockNode(name: string): boolean {
  return extendedSchema.nodes[name]?.isBlock ?? false;
}
