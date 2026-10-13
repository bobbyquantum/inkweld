import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { type SpeechExtension } from '@inkweld/prosemirror/schema';
import { TranslocoModule } from '@jsverse/transloco';
import { ConversationService } from '@services/project/conversation.service';

import { type Speaker, speakerKey } from '../conversation-commands';
import { speakerColor } from '../conversation-plugin';
import { initialsFor } from '../speech-node-view';

/** What the picker is for: adding a new line, or changing an existing one. */
export type SpeakerPickerMode = 'add' | 'change';

/** Line actions offered when changing an existing line. */
export type SpeakerPickerAction =
  'offscreen' | 'voiceover' | 'description' | 'delete';

interface PickerOption {
  kind: 'cast' | 'element' | 'new';
  speaker: Speaker;
  key: string;
  label: string;
  detail: string;
  initials: string;
  color: number;
  icon: string | null;
}

const PANEL_WIDTH = 300;
const PANEL_MAX_HEIGHT = 380;
const MARGIN = 8;

/**
 * Popover for choosing a speaker: people already in the conversation
 * first, then matching worldbuilding elements of any schema, then the
 * typed text as a new, unlinked speaker. When changing an existing line it
 * also offers off-screen / voice-over, turning it into a description, and
 * deleting it.
 */
@Component({
  selector: 'app-speaker-picker',
  templateUrl: './speaker-picker.component.html',
  styleUrl: './speaker-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, TranslocoModule],
  host: { '(document:mousedown)': 'onDocumentMouseDown($event)' },
})
export class SpeakerPickerComponent implements AfterViewInit {
  private readonly conversation = inject(ConversationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Anchor the picker below (or above) this rectangle. */
  readonly anchor = input.required<DOMRect>();
  readonly mode = input<SpeakerPickerMode>('add');
  /** People already speaking in this conversation. */
  readonly cast = input<Speaker[]>([]);
  /** The line's current speaker when changing a line. */
  readonly current = input<Speaker | null>(null);
  /** The line's current delivery when changing a line. */
  readonly extension = input<SpeechExtension | null>(null);

  readonly picked = output<Speaker>();
  readonly action = output<SpeakerPickerAction>();
  readonly closed = output<void>();

  private readonly searchInput =
    viewChild<ElementRef<HTMLInputElement>>('search');

  readonly query = signal('');
  readonly activeIndex = signal(0);

  readonly currentKey = computed(() => {
    const current = this.current();
    return current ? speakerKey(current) : null;
  });

  readonly options = computed<PickerOption[]>(() => {
    const query = this.query().trim();
    const folded = query.toLocaleLowerCase();
    const options: PickerOption[] = [];
    const seen = new Set<string>();

    for (const speaker of this.cast()) {
      const name = this.conversation.displayName(speaker);
      if (folded && !name.toLocaleLowerCase().includes(folded)) continue;
      const key = speakerKey(speaker);
      seen.add(key);
      options.push(this.option('cast', speaker, name, '', null));
    }

    const linkedIds = this.cast()
      .map(speaker => speaker.id)
      .filter((id): id is string => !!id);
    for (const result of this.conversation.searchSpeakers(
      query,
      8,
      linkedIds
    )) {
      const speaker = { id: result.element.id, name: result.element.name };
      const key = speakerKey(speaker);
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(
        this.option(
          'element',
          speaker,
          result.element.name,
          result.path,
          result.icon
        )
      );
    }

    const exact = options.some(
      o => o.label.trim().toLocaleLowerCase() === folded
    );
    if (query && !exact) {
      options.push(
        this.option('new', { id: null, name: query }, query, '', 'person_add')
      );
    }
    return options;
  });

  /** Fixed-position style keeping the panel inside the viewport. */
  readonly panelStyle = computed(() => {
    const rect = this.anchor();
    const width = Math.min(PANEL_WIDTH, globalThis.innerWidth - 2 * MARGIN);
    const left = Math.max(
      MARGIN,
      Math.min(rect.left, globalThis.innerWidth - width - MARGIN)
    );
    const below = rect.bottom + MARGIN;
    const fitsBelow = below + PANEL_MAX_HEIGHT <= globalThis.innerHeight;
    const style: Record<string, string> = {
      left: `${left}px`,
      width: `${width}px`,
      'max-height': `${PANEL_MAX_HEIGHT}px`,
    };
    if (fitsBelow) style['top'] = `${below}px`;
    else
      style['bottom'] =
        `${Math.max(MARGIN, globalThis.innerHeight - rect.top + MARGIN)}px`;
    return style;
  });

  ngAfterViewInit(): void {
    this.searchInput()?.nativeElement.focus();
  }

  onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(0);
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.options().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (count) this.activeIndex.update(i => (i + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count) this.activeIndex.update(i => (i - 1 + count) % count);
        break;
      case 'Enter': {
        event.preventDefault();
        const option = this.options()[this.activeIndex()];
        if (option) this.choose(option);
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.closed.emit();
        break;
    }
  }

  choose(option: PickerOption): void {
    this.picked.emit(option.speaker);
  }

  runAction(action: SpeakerPickerAction): void {
    this.action.emit(action);
  }

  /** Close when clicking anywhere outside the panel. */
  onDocumentMouseDown(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.closed.emit();
    }
  }

  private option(
    kind: PickerOption['kind'],
    speaker: Speaker,
    label: string,
    detail: string,
    icon: string | null
  ): PickerOption {
    return {
      kind,
      speaker,
      key: `${kind}:${speakerKey(speaker)}`,
      label,
      detail,
      initials: initialsFor(label),
      color: speakerColor(speaker),
      icon,
    };
  }
}
