import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ElementType } from '@inkweld/index';
import { ConversationService } from '@services/project/conversation.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../../testing/transloco-test-provider';
import { type Speaker } from '../conversation-commands';
import {
  type SpeakerPickerAction,
  SpeakerPickerComponent,
} from './speaker-picker.component';

const MARA: Speaker = { id: 'el-mara', name: 'Mara' };
const ANA: Speaker = { id: null, name: 'Ana' };

describe('SpeakerPickerComponent', () => {
  let fixture: ComponentFixture<SpeakerPickerComponent>;
  const searchSpeakers = vi.fn();
  let picked: Speaker[];
  let actions: SpeakerPickerAction[];
  let closed: number;

  beforeEach(async () => {
    searchSpeakers.mockReset();
    searchSpeakers.mockReturnValue([
      {
        element: {
          id: 'el-mara',
          name: 'Mara',
          type: ElementType.Worldbuilding,
        },
        icon: 'person',
        path: 'Characters / Mara',
        score: 0,
      },
      {
        element: {
          id: 'el-port',
          name: 'Port Ellis',
          type: ElementType.Worldbuilding,
        },
        icon: 'place',
        path: 'Locations / Port Ellis',
        score: 0,
      },
    ]);
    await TestBed.configureTestingModule({
      imports: [SpeakerPickerComponent, translocoTestProvider()],
      providers: [
        {
          provide: ConversationService,
          useValue: {
            displayName: (s: Speaker) => s.name,
            searchSpeakers,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SpeakerPickerComponent);
    fixture.componentRef.setInput('anchor', new DOMRect(40, 40, 20, 20));
    fixture.componentRef.setInput('cast', [MARA, ANA]);
    picked = [];
    actions = [];
    closed = 0;
    fixture.componentInstance.picked.subscribe(s => picked.push(s));
    fixture.componentInstance.action.subscribe(a => actions.push(a));
    fixture.componentInstance.closed.subscribe(() => closed++);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  const labels = () =>
    fixture.componentInstance.options().map(o => `${o.kind}:${o.label}`);
  const search = () =>
    fixture.nativeElement.querySelector(
      '[data-testid="speaker-picker-search"]'
    ) as HTMLInputElement;
  const type = (value: string) => {
    search().value = value;
    search().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const press = (key: string) =>
    search().dispatchEvent(new KeyboardEvent('keydown', { key }));

  it('lists the cast first, then other elements, without duplicates', () => {
    expect(labels()).toEqual(['cast:Mara', 'cast:Ana', 'element:Port Ellis']);
    expect(searchSpeakers).toHaveBeenCalledWith('', 8, ['el-mara']);
  });

  it('offers the typed text as someone new', () => {
    searchSpeakers.mockReturnValue([]);
    type('Guard');
    expect(labels()).toEqual(['new:Guard']);
    type('ana');
    expect(labels()).toEqual(['cast:Ana']);
  });

  it('picks with the keyboard', () => {
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowUp');
    press('Enter');
    expect(picked).toEqual([ANA]);
  });

  it('ignores Enter while an input method is composing', () => {
    search().dispatchEvent(new CompositionEvent('compositionstart'));
    press('Enter');
    search().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', isComposing: true })
    );
    search().dispatchEvent(new CompositionEvent('compositionend'));
    // Safari: the confirming Enter arrives just after compositionend.
    press('Enter');
    expect(picked).toEqual([]);
  });

  it('wraps around and picks with the mouse', () => {
    press('ArrowUp');
    expect(fixture.componentInstance.activeIndex()).toBe(2);
    const options = fixture.nativeElement.querySelectorAll(
      '[data-testid="speaker-picker-option"]'
    );
    (options[2] as HTMLElement).click();
    expect(picked).toEqual([{ id: 'el-port', name: 'Port Ellis' }]);
  });

  it('closes on Escape and on a click outside', () => {
    press('Escape');
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(closed).toBe(2);
    search().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(closed).toBe(2);
  });

  it('shows line actions only when changing a line', () => {
    const action = (id: string) =>
      fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
    expect(action('speaker-picker-offscreen')).toBeNull();

    fixture.componentRef.setInput('mode', 'change');
    fixture.componentRef.setInput('current', MARA);
    fixture.componentRef.setInput('extension', 'os');
    fixture.detectChanges();
    expect(action('speaker-picker-offscreen').classList).toContain('is-on');
    for (const id of [
      'offscreen',
      'voiceover',
      'description',
      'delete',
    ] as const) {
      action(`speaker-picker-${id}`).click();
    }
    expect(actions).toEqual([
      'offscreen',
      'voiceover',
      'description',
      'delete',
    ]);
    expect(
      fixture.nativeElement.querySelector('.speaker-picker__check')
    ).not.toBeNull();
  });

  it('opens above the anchor when there is no room below', () => {
    fixture.componentRef.setInput(
      'anchor',
      new DOMRect(10, globalThis.innerHeight - 20, 20, 10)
    );
    const style = fixture.componentInstance.panelStyle();
    expect(style['bottom']).toBeDefined();
    expect(style['top']).toBeUndefined();
  });

  it('shows a prompt when nothing matches', () => {
    searchSpeakers.mockReturnValue([]);
    fixture.componentRef.setInput('cast', []);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.speaker-picker__empty')
    ).not.toBeNull();
    press('Enter');
    press('ArrowDown');
    expect(picked).toEqual([]);
  });
});
