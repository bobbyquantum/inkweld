/**
 * Publishing support for conversations.
 *
 * The exporters (HTML, EPUB, Markdown, PDF) only know prose nodes. Rather
 * than teach each of them about `speech`, every conversation line is
 * rewritten as an ordinary paragraph before rendering:
 *
 *   **Mara:** *(not turning)* Then fix it. You said you would.
 *
 * so a conversation publishes like a script in a novel's typesetting, and
 * every existing output path (marks, element references, typography)
 * keeps working on its contents.
 */
import {
  DIALOGUE_NODE_NAME,
  PARENTHETICAL_NODE_NAME,
  SPEECH_NODE_NAME,
} from '@inkweld/prosemirror/schema';

/** ProseMirror JSON as returned by `DocumentService.getDocumentContent`. */
interface JsonNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  [key: string]: unknown;
}

/** Look up a linked speaker's current name (e.g. after a rename). */
export type SpeakerNameResolver = (elementId: string) => string | undefined;

const EXTENSION_LABELS: Record<string, string> = {
  os: ' (O.S.)',
  vo: ' (V.O.)',
};

function isNode(value: unknown): value is JsonNode {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: string, mark?: string): JsonNode {
  const node: JsonNode = { type: 'text', text: value };
  if (mark) node.marks = [{ type: mark }];
  return node;
}

/** Add `mark` to every text node in `nodes` that does not already carry it. */
function withMark(nodes: JsonNode[], mark: string): JsonNode[] {
  return nodes.map(node => {
    if (node.type !== 'text') return node;
    const marks = node.marks ?? [];
    if (marks.some(m => m.type === mark)) return node;
    return { ...node, marks: [...marks, { type: mark }] };
  });
}

function speechToParagraph(
  speech: JsonNode,
  resolveName?: SpeakerNameResolver
): JsonNode {
  const attrs = speech.attrs ?? {};
  const id = typeof attrs['speakerId'] === 'string' ? attrs['speakerId'] : '';
  const stored =
    typeof attrs['speakerName'] === 'string' ? attrs['speakerName'] : '';
  const name = (id && resolveName?.(id)) || stored.trim() || 'Unknown';
  const extension =
    EXTENSION_LABELS[
      typeof attrs['extension'] === 'string' ? attrs['extension'] : ''
    ] ?? '';

  const content: JsonNode[] = [text(`${name}${extension}:`, 'strong')];
  for (const child of speech.content ?? []) {
    const inline = (child.content ?? []).filter(isNode);
    if (inline.length === 0) continue;
    content.push(text(' '));
    if (child.type === PARENTHETICAL_NODE_NAME) {
      content.push(text('(', 'em'), ...withMark(inline, 'em'), text(')', 'em'));
    } else if (child.type === DIALOGUE_NODE_NAME) {
      content.push(...inline);
    }
  }
  return { type: 'paragraph', content };
}

/**
 * Return `content` with every `speech` node replaced by a paragraph. Works
 * on a node, an array of nodes, or anything else (returned unchanged).
 * Inputs are never mutated.
 */
export function flattenConversation(
  content: unknown,
  resolveName?: SpeakerNameResolver
): unknown {
  if (Array.isArray(content)) {
    return content.map(node => flattenConversation(node, resolveName));
  }
  if (!isNode(content)) return content;
  if (content.type === SPEECH_NODE_NAME) {
    return speechToParagraph(content, resolveName);
  }
  if (!Array.isArray(content.content)) return content;
  return {
    ...content,
    content: content.content.map(
      node => flattenConversation(node, resolveName) as JsonNode
    ),
  };
}
