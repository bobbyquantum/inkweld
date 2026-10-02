import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  type SceneOverviewHarness,
  sceneOverviewHarness,
} from '../../../testing/scene-overview-testing';
import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { SceneOutlineComponent } from './scene-outline.component';

describe('SceneOutlineComponent', () => {
  let fixture: ComponentFixture<SceneOutlineComponent>;
  let component: SceneOutlineComponent;
  let h: SceneOverviewHarness;

  const el = (testId: string): HTMLElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector(
      `[data-testid="${testId}"]`
    );

  beforeEach(async () => {
    h = sceneOverviewHarness();
    await TestBed.configureTestingModule({
      imports: [SceneOutlineComponent, translocoTestProvider()],
      providers: [provideZonelessChangeDetection(), ...h.providers],
    }).compileComponents();

    fixture = TestBed.createComponent(SceneOutlineComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('folderId', 'book');
    fixture.detectChanges();
  });

  it('lists folders and prose documents at every depth', () => {
    expect(component.rows().map(r => r.element.id)).toEqual([
      'opening',
      'chapter',
      'storm',
      'research',
      'loose',
    ]);
    expect(el('outline-row-storm')).toBeTruthy();
    expect(el('outline-row-map')).toBeNull();
  });

  it('recounts the folder once when it opens', () => {
    expect(h.stats.recount).toHaveBeenCalledTimes(1);
    expect(h.stats.recount).toHaveBeenCalledWith(['book']);
    expect(h.stats.ensureCounted).toHaveBeenCalledWith(['book']);

    h.elements.update(list => [...list]);
    fixture.detectChanges();
    expect(h.stats.recount).toHaveBeenCalledTimes(1);
  });

  it('shows scene columns', () => {
    const row = el('outline-row-opening')!;
    expect((el('outline-synopsis-opening') as HTMLInputElement).value).toBe(
      'Mira arrives.'
    );
    expect(el('outline-status-opening')!.textContent).toContain('Draft');
    expect(row.textContent).toContain('mira');
    expect(row.textContent).toContain('harbour');
    expect(el('outline-words-opening')!.textContent).toContain('250');
  });

  it('labels notes and counts the scenes of a folder', () => {
    expect(el('outline-row-research')!.textContent).toContain('Note');
    expect(el('outline-row-loose')!.textContent).toContain('Document');
    expect(el('outline-row-chapter')!.textContent).toContain('1 scene');
    expect(el('outline-synopsis-research')).toBeNull();
    expect(el('outline-details-research')).toBeNull();
  });

  it('totals the scenes', () => {
    const totals = el('outline-totals')!;
    expect(totals.textContent).toContain('2 scenes');
    expect(totals.textContent).toContain('850');
    expect(totals.textContent).toContain('1,500');
    expect(totals.textContent).toContain('Draft');
    expect(totals.textContent).toContain('Final');
  });

  it('saves an edited synopsis', () => {
    const input = el('outline-synopsis-storm') as HTMLInputElement;
    input.value = 'The mast breaks.';
    input.dispatchEvent(new Event('change'));
    expect(h.projectState.updateElementMetadata).toHaveBeenCalledWith('storm', {
      synopsis: 'The mast breaks.',
    });
  });

  it('opens a row and its links', () => {
    el('outline-open-storm')!.click();
    expect(h.projectState.openDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'storm' })
    );
    el('outline-row-opening')!
      .querySelector<HTMLButtonElement>('.link-button')!
      .click();
    expect(h.projectState.openDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'mira' })
    );
  });

  it('opens the details dialog for a scene', async () => {
    h.dialogGateway.openSceneDetailsDialog.mockResolvedValue(undefined);
    el('outline-details-opening')!.click();
    await fixture.whenStable();
    expect(h.dialogGateway.openSceneDetailsDialog).toHaveBeenCalledWith(
      expect.objectContaining({ elementName: 'opening' })
    );
  });

  it('shows an empty message and no totals without prose', () => {
    h.elements.update(list => list.filter(e => e.id === 'book'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'No scenes or notes in this folder yet.'
    );
    expect(el('outline-totals')).toBeNull();
  });

  it('is read-only for viewers', () => {
    h.canWrite.set(false);
    fixture.detectChanges();
    expect((el('outline-synopsis-opening') as HTMLInputElement).readOnly).toBe(
      true
    );
    expect((el('outline-status-opening') as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(el('outline-details-opening')).toBeNull();
  });
});
