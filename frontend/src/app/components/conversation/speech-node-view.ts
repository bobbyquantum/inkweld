/**
 * Node view for a `speech`: avatar, speaker name and a bubble holding the
 * editable "how they say it" note and line, plus hover tools.
 *
 * Grouping (first/last line in a run by the same speaker) and the speaker
 * colour arrive as node decorations, which ProseMirror applies to `dom`;
 * this view only ever adds or removes its own classes so it never clobbers
 * them.
 */
import { type SpeechNodeAttrs } from '@inkweld/prosemirror/schema';
import { type Node as PMNode } from 'prosemirror-model';
import { type EditorView, type NodeView } from 'prosemirror-view';

import {
  type Speaker,
  speakerOf,
  toggleExtension,
  toggleParenthetical,
} from './conversation-commands';

/** What the node view needs from the host application. */
export interface SpeechViewHost {
  /** Name to show for a speaker (the element's current name when linked). */
  displayName(speaker: Speaker): string;
  /** Portrait for a linked speaker, if it has one. */
  avatarUrl(speaker: Speaker): Promise<string | null>;
  /** The avatar was clicked: offer a different speaker. */
  onSpeakerClick(event: SpeakerClickEvent): void;
  /** Translated label for a UI key under `editor.conversation`. */
  label(key: string): string;
}

export interface SpeakerClickEvent {
  pos: number;
  speaker: Speaker;
  rect: DOMRect;
}

/** Up to two initials for an avatar without a picture. */
export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters =
    words.length === 1
      ? Array.from(words[0]).slice(0, 2)
      : [Array.from(words[0])[0], Array.from(words.at(-1)!)[0]];
  return letters.join('').toLocaleUpperCase();
}

function iconButton(
  icon: string,
  label: string,
  className: string
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.title = label;
  button.setAttribute('aria-label', label);
  const glyph = document.createElement('span');
  glyph.className = 'material-icons';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = icon;
  button.appendChild(glyph);
  return button;
}

export class SpeechNodeView implements NodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;
  private readonly avatar: HTMLButtonElement;
  private readonly nameEl: HTMLElement;
  private readonly controls: HTMLElement;
  private node: PMNode;
  /** Bumped per render so a late portrait never lands on the wrong speaker. */
  private avatarRequest = 0;

  constructor(
    node: PMNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
    private readonly host: SpeechViewHost
  ) {
    this.node = node;

    this.dom = document.createElement('div');
    this.dom.classList.add('speech');
    this.dom.dataset['speech'] = '';

    this.avatar = document.createElement('button');
    this.avatar.type = 'button';
    this.avatar.className = 'speech__avatar';
    this.avatar.contentEditable = 'false';
    this.avatar.addEventListener('mousedown', e => e.preventDefault());
    this.avatar.addEventListener('click', () => this.openSpeakerPicker());

    const body = document.createElement('div');
    body.className = 'speech__body';

    this.nameEl = document.createElement('div');
    this.nameEl.className = 'speech__name';
    this.nameEl.contentEditable = 'false';

    this.contentDOM = document.createElement('div');
    this.contentDOM.className = 'speech__bubble';

    body.append(this.nameEl, this.contentDOM);

    this.controls = document.createElement('div');
    this.controls.className = 'speech__tools';
    this.controls.contentEditable = 'false';
    const how = iconButton(
      'mood',
      host.label('howTheySayIt'),
      'speech__tool speech__tool--how'
    );
    how.addEventListener('click', () => this.run('how'));
    const offscreen = iconButton(
      'visibility_off',
      host.label('offscreen'),
      'speech__tool speech__tool--offscreen'
    );
    offscreen.addEventListener('click', () => this.run('offscreen'));
    for (const button of [how, offscreen]) {
      button.addEventListener('mousedown', e => e.preventDefault());
    }
    this.controls.append(how, offscreen);

    this.dom.append(this.avatar, body, this.controls);
    this.render();
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    const changed = !this.sameHeader(node);
    this.node = node;
    if (changed) this.render();
    return true;
  }

  /** Controls outside the bubble handle their own events. */
  stopEvent(event: Event): boolean {
    const target = event.target as Node | null;
    return (
      !!target && this.dom.contains(target) && !this.contentDOM.contains(target)
    );
  }

  /** Only the bubble's content is ProseMirror's business. */
  ignoreMutation(mutation: MutationRecord | { type: 'selection' }): boolean {
    if (mutation.type === 'selection') return false;
    const target = mutation.target;
    return !this.contentDOM.contains(target);
  }

  private sameHeader(node: PMNode): boolean {
    const a = this.node.attrs as SpeechNodeAttrs;
    const b = node.attrs as SpeechNodeAttrs;
    return (
      a.speakerId === b.speakerId &&
      a.speakerName === b.speakerName &&
      a.extension === b.extension
    );
  }

  private render(): void {
    const speaker = speakerOf(this.node);
    const attrs = this.node.attrs as SpeechNodeAttrs;
    const name = this.host.displayName(speaker) || this.host.label('unknown');

    this.nameEl.textContent = name;
    if (attrs.extension) {
      // Chat view says "· off-screen"; script view uses the convention.
      const chat = document.createElement('span');
      chat.className = 'speech__extension speech__extension--chat';
      chat.textContent = ` · ${this.host.label(attrs.extension === 'vo' ? 'voiceover' : 'offscreen')}`;
      const script = document.createElement('span');
      script.className = 'speech__extension speech__extension--script';
      script.textContent = attrs.extension === 'vo' ? ' (V.O.)' : ' (O.S.)';
      this.nameEl.append(chat, script);
    }
    this.dom.classList.toggle('speech--offscreen', !!attrs.extension);
    this.avatar.title = this.host.label('changeSpeaker');
    this.avatar.setAttribute(
      'aria-label',
      `${name}. ${this.host.label('changeSpeaker')}`
    );

    this.avatar.replaceChildren(document.createTextNode(initialsFor(name)));
    this.avatar.classList.remove('speech__avatar--image');
    const request = ++this.avatarRequest;
    if (speaker.id) {
      void this.host.avatarUrl(speaker).then(url => {
        if (!url || request !== this.avatarRequest) return;
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        this.avatar.replaceChildren(img);
        this.avatar.classList.add('speech__avatar--image');
      });
    }
  }

  private openSpeakerPicker(): void {
    const pos = this.getPos();
    if (pos === undefined || !this.view.editable) return;
    this.host.onSpeakerClick({
      pos,
      speaker: speakerOf(this.node),
      rect: this.avatar.getBoundingClientRect(),
    });
  }

  private run(action: 'how' | 'offscreen'): void {
    const pos = this.getPos();
    if (pos === undefined || !this.view.editable) return;
    const command =
      action === 'how' ? toggleParenthetical(pos) : toggleExtension(pos, 'os');
    command(this.view.state, this.view.dispatch);
    this.view.focus();
  }
}
