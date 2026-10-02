import { type CdkDragDrop } from '@angular/cdk/drag-drop';
import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  type SceneOverviewHarness,
  sceneOverviewHarness,
} from '../../../testing/scene-overview-testing';
import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { SceneCorkboardComponent } from './scene-corkboard.component';

describe('SceneCorkboardComponent', () => {
  let fixture: ComponentFixture<SceneCorkboardComponent>;
  let component: SceneCorkboardComponent;
  let h: SceneOverviewHarness;

  const el = (testId: string): HTMLElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector(
      `[data-testid="${testId}"]`
    );

  beforeEach(async () => {
    h = sceneOverviewHarness();
    await TestBed.configureTestingModule({
      imports: [SceneCorkboardComponent, translocoTestProvider()],
      providers: [provideZonelessChangeDetection(), ...h.providers],
    }).compileComponents();

    fixture = TestBed.createComponent(SceneCorkboardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('folderId', 'book');
    fixture.detectChanges();
  });

  it('shows one card per direct child', () => {
    expect(component.cards().map(c => c.element.id)).toEqual([
      'opening',
      'chapter',
      'loose',
      'map',
    ]);
    expect(el('corkboard-card-opening')).toBeTruthy();
    expect(el('corkboard-card-storm')).toBeNull();
  });

  it('recounts the folder once when it opens', () => {
    expect(h.stats.recount).toHaveBeenCalledTimes(1);
    expect(h.stats.recount).toHaveBeenCalledWith(['book']);
    expect(h.stats.ensureCounted).toHaveBeenCalledWith(['book']);

    h.elements.update(list => [...list]);
    fixture.detectChanges();
    expect(h.stats.recount).toHaveBeenCalledTimes(1);
  });

  it('shows the synopsis, links and words on a scene card', () => {
    const card = el('corkboard-card-opening')!;
    expect(card.classList).toContain('status-draft');
    expect(
      (el('corkboard-synopsis-opening') as HTMLTextAreaElement).value
    ).toBe('Mira arrives.');
    expect(card.textContent).toContain('mira');
    expect(card.textContent).toContain('harbour');
    expect(el('corkboard-words-opening')!.textContent).toContain('250');
    expect(el('corkboard-words-opening')!.textContent).toContain('1,000');
  });

  it('shows a sub-folder as a chapter card with its scene count', () => {
    const card = el('corkboard-card-chapter')!;
    expect(card.textContent).toContain('1 scene');
    expect(el('corkboard-words-chapter')!.textContent).toContain('640');
    expect(
      (el('corkboard-synopsis-chapter') as HTMLTextAreaElement).value
    ).toBe('At sea.');
    expect(el('corkboard-status-chapter')).toBeNull();
  });

  it('saves an edited synopsis', () => {
    const textarea = el('corkboard-synopsis-opening') as HTMLTextAreaElement;
    textarea.value = 'Mira leaves.';
    textarea.dispatchEvent(new Event('change'));
    expect(h.projectState.updateElementMetadata).toHaveBeenCalledWith(
      'opening',
      { synopsis: 'Mira leaves.' }
    );
  });

  it('opens the element from the card title', () => {
    el('corkboard-open-opening')!.click();
    expect(h.projectState.openDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'opening' })
    );
  });

  it('offers to turn a plain document into a scene', () => {
    expect(el('corkboard-synopsis-loose')).toBeNull();
    el('corkboard-make-scene-loose')!.click();
    expect(h.projectState.setDocumentRole).toHaveBeenCalledWith(
      'loose',
      'scene'
    );
  });

  it('reorders the folder when a card is dropped', () => {
    component.onDrop({
      previousIndex: 0,
      currentIndex: 2,
    } as CdkDragDrop<unknown>);
    fixture.detectChanges();
    expect(component.cards().map(c => c.element.id)).toEqual([
      'chapter',
      'loose',
      'opening',
      'map',
    ]);
  });

  it('shows placeholders while counting and for unsynced documents', () => {
    h.wordCounts.set(new Map([['loose', { status: 'unavailable' }]]));
    fixture.detectChanges();
    expect(el('corkboard-words-opening')!.textContent).toContain('…');
    expect(el('corkboard-words-loose')!.textContent).toContain('—');
  });

  it('is read-only for viewers', () => {
    h.canWrite.set(false);
    fixture.detectChanges();
    expect(
      (el('corkboard-synopsis-opening') as HTMLTextAreaElement).readOnly
    ).toBe(true);
    expect(
      (el('corkboard-details-opening') as HTMLButtonElement).disabled
    ).toBe(true);
    expect(el('corkboard-make-scene-loose')).toBeNull();
  });
});
