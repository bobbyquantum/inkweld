import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ConversationService } from '@services/project/conversation.service';
import { type Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../../testing/transloco-test-provider';
import { extendedSchema as schema } from '../../element-ref/extended-schema';
import { speakerOf } from '../conversation-commands';
import { ConversationBarComponent } from './conversation-bar.component';

// jsdom has no layout: ProseMirror's scroll-into-view needs these.
function stubRangeRects(): void {
  const proto = Range.prototype as unknown as Record<string, unknown>;
  proto['getClientRects'] ??= () => [];
  proto['getBoundingClientRect'] ??= () => new DOMRect();
  const text = Text.prototype as unknown as Record<string, unknown>;
  text['getClientRects'] ??= () => [];
}

function line(name: string, id: string | null, text: string): PMNode {
  return schema.nodes['speech'].create(
    { speakerName: name, speakerId: id },
    schema.nodes['dialogue'].create(null, schema.text(text))
  );
}

function blocks(view: EditorView): string[] {
  const out: string[] = [];
  view.state.doc.forEach(node =>
    out.push(
      node.type.name === 'speech'
        ? speakerOf(node).name
        : node.type.name === 'horizontal_rule'
          ? '---'
          : 'p'
    )
  );
  return out;
}

describe('ConversationBarComponent', () => {
  let fixture: ComponentFixture<ConversationBarComponent>;
  let view: EditorView;
  let host: HTMLElement;
  const avatarUrl = vi.fn();

  beforeEach(async () => {
    stubRangeRects();
    avatarUrl.mockReset();
    avatarUrl.mockImplementation((s: { id: string | null }) =>
      Promise.resolve(s.id ? `blob:${s.id}` : null)
    );
    await TestBed.configureTestingModule({
      imports: [ConversationBarComponent, translocoTestProvider()],
      providers: [
        {
          provide: ConversationService,
          useValue: {
            displayName: (s: { name: string }) => s.name,
            avatarUrl,
          },
        },
      ],
    }).compileComponents();

    host = document.createElement('div');
    document.body.appendChild(host);
    const doc = schema.nodes['doc'].create(null, [
      line('Mara', 'el-mara', 'Hi'),
      line('Tomas', null, 'Yo'),
    ]);
    view = new EditorView(host, {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, doc.content.size - 2),
      }),
    });

    fixture = TestBed.createComponent(ConversationBarComponent);
    fixture.componentRef.setInput('view', view);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    view.destroy();
    host.remove();
  });

  const chips = (): HTMLButtonElement[] =>
    Array.from(
      (
        fixture.nativeElement as HTMLElement
      ).querySelectorAll<HTMLButtonElement>(
        '[data-testid="conversation-speaker-chip"]'
      )
    );
  const click = (testId: string) =>
    (
      fixture.nativeElement.querySelector(
        `[data-testid="${testId}"]`
      ) as HTMLButtonElement
    ).click();

  it('shows a chip per speaker, with a portrait when there is one', () => {
    expect(
      chips().map(c => c.textContent?.replaceAll(/\s+/g, ' ').trim())
    ).toEqual(['Mara', 'TO Tomas']);
    expect(chips()[0].querySelector('img')?.getAttribute('src')).toBe(
      'blob:el-mara'
    );
  });

  it('highlights the speaker of the line at the cursor', () => {
    expect(chips()[1].classList.contains('is-active')).toBe(true);
    expect(chips()[0].classList.contains('is-active')).toBe(false);
  });

  it('adds a line for a speaker, a description and a scene break', () => {
    chips()[0].click();
    expect(blocks(view)).toEqual(['Mara', 'Tomas', 'Mara']);
    click('conversation-add-description');
    expect(blocks(view)).toEqual(['Mara', 'Tomas', 'Mara', 'p']);
    click('conversation-add-break');
    expect(blocks(view)).toEqual(['Mara', 'Tomas', 'Mara', '---', 'p']);
  });

  it('asks the host for a new speaker', () => {
    const emitted: DOMRect[] = [];
    fixture.componentInstance.addSomeone.subscribe(rect => emitted.push(rect));
    click('conversation-someone-new');
    expect(emitted).toHaveLength(1);
  });

  it('switches between chat and script views', () => {
    click('conversation-view-script');
    expect(fixture.componentInstance.scriptView()).toBe(true);
    click('conversation-view-chat');
    expect(fixture.componentInstance.scriptView()).toBe(false);
  });

  it('does nothing when read-only, and hides the hint', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    fixture.componentInstance.addDescription();
    expect(blocks(view)).toEqual(['Mara', 'Tomas']);
    expect(
      fixture.nativeElement.querySelector('.conversation-bar__hint')
    ).toBeNull();
  });

  it('is empty without an editor', () => {
    fixture.componentRef.setInput('view', null);
    fixture.detectChanges();
    expect(chips()).toHaveLength(0);
    expect(fixture.componentInstance.activeKey()).toBeNull();
  });
});
