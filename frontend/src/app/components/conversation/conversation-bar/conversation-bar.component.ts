import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@jsverse/transloco';
import { ConversationService } from '@services/project/conversation.service';
import { type Command } from 'prosemirror-state';
import { type EditorView } from 'prosemirror-view';

import {
  addDescription,
  addLine,
  addSceneBreak,
  castOf,
  nextSpeakerAt,
  type Speaker,
  speakerKey,
  speakerOf,
  speechAt,
} from '../conversation-commands';
import { speakerColor } from '../conversation-plugin';
import { initialsFor } from '../speech-node-view';

/** A speaker as shown on a chip. */
export interface CastMember {
  speaker: Speaker;
  key: string;
  name: string;
  initials: string;
  color: number;
}

/**
 * The bar under a conversation: one chip per speaker to add their next
 * line at the cursor, plus "Someone new", "Description" and "Scene break",
 * and the Chat / Script view switch.
 *
 * The chip of the speaker who would naturally talk next (or who is talking
 * in the line at the cursor) is highlighted, so Enter-and-type needs no
 * clicking at all.
 */
@Component({
  selector: 'app-conversation-bar',
  templateUrl: './conversation-bar.component.html',
  styleUrl: './conversation-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatTooltipModule, TranslocoModule],
})
export class ConversationBarComponent {
  private readonly conversation = inject(ConversationService);

  /** The editor view; `null` until the editor is ready. */
  readonly view = input<EditorView | null>(null);
  /** Bumped by the host on every editor update so the bar re-reads state. */
  readonly version = input(0);
  /** Read-only viewers see the cast but cannot add lines. */
  readonly disabled = input(false);
  /** Show the script (screenplay) layout instead of bubbles. */
  readonly scriptView = model(false);
  /** "Someone new" was pressed; the host opens the speaker picker here. */
  readonly addSomeone = output<DOMRect>();

  readonly cast = computed<CastMember[]>(() => {
    this.version();
    const view = this.view();
    if (!view) return [];
    return castOf(view.state.doc).map(speaker => {
      const name = this.conversation.displayName(speaker);
      return {
        speaker,
        key: speakerKey(speaker),
        name,
        initials: initialsFor(name),
        color: speakerColor(speaker),
      };
    });
  });

  /** Speaker of the line at the cursor, or whoever would answer next. */
  readonly activeKey = computed<string | null>(() => {
    this.version();
    const view = this.view();
    if (!view) return null;
    const { $from } = view.state.selection;
    const context = speechAt($from);
    const speaker = context
      ? speakerOf(context.node)
      : nextSpeakerAt(view.state.doc, $from.pos);
    return speaker ? speakerKey(speaker) : null;
  });

  /** Portraits by speaker key, filled in as they load. */
  readonly avatars = signal<Record<string, string>>({});

  constructor() {
    effect(() => {
      for (const member of this.cast()) {
        if (!member.speaker.id || member.key in this.avatars()) continue;
        void this.conversation.avatarUrl(member.speaker).then(url => {
          if (url) this.avatars.update(map => ({ ...map, [member.key]: url }));
        });
      }
    });
  }

  addLineFor(member: CastMember): void {
    this.run(addLine(member.speaker));
  }

  addDescription(): void {
    this.run(addDescription);
  }

  addSceneBreak(): void {
    this.run(addSceneBreak);
  }

  someoneNew(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement;
    this.addSomeone.emit(target.getBoundingClientRect());
  }

  private run(command: Command): void {
    const view = this.view();
    if (!view || this.disabled()) return;
    command(view.state, view.dispatch);
    view.focus();
  }
}
