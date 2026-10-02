import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  type SceneOverviewHarness,
  sceneOverviewHarness,
} from '../../../testing/scene-overview-testing';
import { SceneOverviewService } from './scene-overview.service';

describe('SceneOverviewService', () => {
  let service: SceneOverviewService;
  let h: SceneOverviewHarness;

  const ids = (folderId = 'book') =>
    h
      .elements()
      .filter(e => e.parentId === folderId)
      .map(e => e.id);

  beforeEach(() => {
    h = sceneOverviewHarness();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), ...h.providers],
    });
    service = TestBed.inject(SceneOverviewService);
  });

  describe('rows', () => {
    it('lists only direct children by default', () => {
      const rows = service.rows('book');
      expect(rows.map(r => r.element.id)).toEqual([
        'opening',
        'chapter',
        'loose',
        'map',
      ]);
      expect(rows.map(r => r.kind)).toEqual([
        'scene',
        'folder',
        'document',
        'other',
      ]);
      expect(rows.every(r => r.depth === 0)).toBe(true);
    });

    it('lists every descendant with its depth when deep', () => {
      const rows = service.rows('book', { deep: true, proseOnly: true });
      expect(rows.map(r => [r.element.id, r.depth, r.kind])).toEqual([
        ['opening', 0, 'scene'],
        ['chapter', 0, 'folder'],
        ['storm', 1, 'scene'],
        ['research', 1, 'note'],
        ['loose', 0, 'document'],
      ]);
    });

    it('numbers scenes in reading order and skips everything else', () => {
      const rows = service.rows('book', { deep: true });
      expect(rows.map(r => r.sceneNumber)).toEqual([
        1,
        null,
        2,
        null,
        null,
        null,
      ]);
    });

    it('decodes scene metadata, links and the story date', () => {
      const [opening] = service.rows('book');
      expect(opening.scene.status).toBe('draft');
      expect(opening.scene.synopsis).toBe('Mira arrives.');
      expect(opening.pov.map(e => e.id)).toEqual(['mira']);
      expect(opening.location.map(e => e.id)).toEqual(['harbour']);
      expect(opening.storyDateLabel).toBeTruthy();
    });

    it('falls back to raw units when the calendar is not installed', () => {
      h.elements.update(list =>
        list.map(e =>
          e.id === 'opening'
            ? {
                ...e,
                metadata: {
                  ...e.metadata,
                  storyDate: JSON.stringify({
                    systemId: 'gone',
                    units: ['4', '2'],
                  }),
                },
              }
            : e
        )
      );
      expect(service.rows('book')[0].storyDateLabel).toBe('4-2');
    });

    it('reports words against the scene target', () => {
      const [opening] = service.rows('book');
      expect(opening.words).toBe(250);
      expect(opening.wordTarget).toBe(1000);
      expect(opening.progress).toBe(25);
      expect(opening.wordsState).toBe('ready');
    });

    it('rolls a folder up over its prose documents', () => {
      const chapter = service.rows('book')[1];
      expect(chapter.sceneCount).toBe(1);
      expect(chapter.words).toBe(640);
      expect(chapter.wordTarget).toBe(500);
      expect(chapter.progress).toBe(100);
      expect(chapter.wordsState).toBe('ready');
    });

    it('marks uncounted and unsynced documents', () => {
      h.wordCounts.set(
        new Map([
          ['storm', { status: 'unavailable' }],
          ['research', { status: 'ready', words: 40 }],
        ])
      );
      const [opening, chapter, , map] = service.rows('book');
      expect(opening.wordsState).toBe('loading');
      expect(chapter.wordsState).toBe('unavailable');
      expect(chapter.words).toBe(40);
      expect(map.wordsState).toBe('none');
    });

    it('returns nothing for an unknown folder', () => {
      expect(service.rows('nope')).toEqual([]);
    });
  });

  describe('totals', () => {
    it('sums scenes at any depth and groups them by status', () => {
      const totals = service.totals('book');
      expect(totals.scenes).toBe(2);
      expect(totals.words).toBe(850);
      expect(totals.wordTarget).toBe(1500);
      expect(totals.wordsState).toBe('ready');
      expect(totals.byStatus).toEqual({
        idea: 0,
        draft: 1,
        revised: 0,
        final: 1,
        none: 0,
      });
    });

    it('is empty for a folder without scenes', () => {
      h.elements.update(list => list.filter(e => e.id !== 'storm'));
      const totals = service.totals('chapter');
      expect(totals.scenes).toBe(0);
      expect(totals.wordsState).toBe('none');
      expect(service.hasScenes('chapter')).toBe(false);
      expect(service.hasScenes('book')).toBe(true);
    });
  });

  describe('editing', () => {
    it('sets and clears the status', () => {
      service.setStatus('opening', 'final');
      expect(h.projectState.updateElementMetadata).toHaveBeenCalledWith(
        'opening',
        { status: 'final' }
      );
      service.setStatus('opening', null);
      expect(h.projectState.updateElementMetadata).toHaveBeenLastCalledWith(
        'opening',
        { status: '' }
      );
    });

    it('saves a trimmed synopsis only when it changed', () => {
      service.setSynopsis('opening', '  Mira arrives.  ');
      service.setSynopsis('missing', 'x');
      expect(h.projectState.updateElementMetadata).not.toHaveBeenCalled();

      service.setSynopsis('opening', ' Mira leaves. ');
      expect(h.projectState.updateElementMetadata).toHaveBeenCalledWith(
        'opening',
        { synopsis: 'Mira leaves.' }
      );
    });

    it('converts a document to a scene', () => {
      service.makeScene('loose');
      expect(h.projectState.setDocumentRole).toHaveBeenCalledWith(
        'loose',
        'scene'
      );
    });

    it('applies the patch returned by the details dialog', async () => {
      const opening = h.elements()[1];
      h.dialogGateway.openSceneDetailsDialog.mockResolvedValueOnce(undefined);
      await service.openDetails(opening);
      expect(h.projectState.updateElementMetadata).not.toHaveBeenCalled();

      h.dialogGateway.openSceneDetailsDialog.mockResolvedValueOnce({
        patch: { wordTarget: '2000' },
      });
      await service.openDetails(opening);
      expect(h.projectState.updateElementMetadata).toHaveBeenCalledWith(
        'opening',
        { wordTarget: '2000' }
      );
    });

    it('does nothing for a read-only collaborator', async () => {
      h.canWrite.set(false);
      service.setStatus('opening', 'final');
      service.setSynopsis('opening', 'changed');
      service.makeScene('loose');
      service.moveChild('book', 0, 1);
      await service.openDetails(h.elements()[1]);
      expect(h.projectState.updateElementMetadata).not.toHaveBeenCalled();
      expect(h.projectState.setDocumentRole).not.toHaveBeenCalled();
      expect(h.projectState.moveElement).not.toHaveBeenCalled();
      expect(h.dialogGateway.openSceneDetailsDialog).not.toHaveBeenCalled();
    });

    it('opens elements and reads link icons', () => {
      const mira = h.elements().find(e => e.id === 'mira')!;
      service.open(mira);
      expect(h.projectState.openDocument).toHaveBeenCalledWith(mira);
      expect(service.linkIcon(mira)).toBe('person');
      expect(service.linkIcon({ ...mira, metadata: { icon: 'star' } })).toBe(
        'star'
      );
    });
  });

  describe('moveChild', () => {
    it('moves a card later, past a sub-folder and its contents', () => {
      service.moveChild('book', 0, 1);
      expect(ids()).toEqual(['chapter', 'opening', 'loose', 'map']);
      // The chapter's own children travelled with it.
      expect(ids('chapter')).toEqual(['storm', 'research']);
    });

    it('moves a card earlier', () => {
      service.moveChild('book', 2, 0);
      expect(ids()).toEqual(['loose', 'opening', 'chapter', 'map']);
    });

    it('moves a card to the end of the folder', () => {
      service.moveChild('book', 0, 3);
      expect(ids()).toEqual(['chapter', 'loose', 'map', 'opening']);
      // Still inside the folder, not after the worldbuilding elements.
      const order = h.elements().map(e => e.id);
      expect(order.indexOf('opening')).toBeLessThan(order.indexOf('mira'));
    });

    it('moves a sub-folder with its subtree', () => {
      service.moveChild('book', 1, 3);
      expect(ids()).toEqual(['opening', 'loose', 'map', 'chapter']);
      expect(ids('chapter')).toEqual(['storm', 'research']);
      expect(h.elements().find(e => e.id === 'storm')?.level).toBe(2);
    });

    it('ignores no-op and out-of-range moves', () => {
      service.moveChild('book', 1, 1);
      service.moveChild('book', 9, 0);
      service.moveChild('nope', 0, 1);
      expect(h.projectState.moveElement).not.toHaveBeenCalled();
    });
  });

  describe('word counts', () => {
    it('counts new documents and recounts on request', () => {
      service.ensureWordCounts('book');
      expect(h.stats.ensureCounted).toHaveBeenCalledWith(['book']);
      expect(h.stats.recount).not.toHaveBeenCalled();

      service.refreshWordCounts('book');
      expect(h.stats.recount).toHaveBeenCalledWith(['book']);
    });
  });
});
