import { describe, expect, it } from 'vitest';

import {
  CONVERSATION_ICON,
  DOCUMENT_ROLE_ICONS,
  documentIcon,
  formatMetadata,
  getDocumentFormat,
  getDocumentRole,
  getSceneStatus,
  getSceneStoryDate,
  getSceneWordTarget,
  isConversation,
  isNote,
  isPublishableByDefault,
  isScene,
  readSceneMetadata,
  roleMetadata,
  SCENE_STATUSES,
  sceneMetadataPatch,
} from './scene-metadata';
import type { TimePoint } from './time-system';

describe('scene-metadata model', () => {
  describe('getDocumentRole', () => {
    it('returns undefined for missing metadata', () => {
      expect(getDocumentRole(undefined)).toBeUndefined();
      expect(getDocumentRole({})).toBeUndefined();
    });

    it('returns known roles', () => {
      expect(getDocumentRole({ role: 'scene' })).toBe('scene');
      expect(getDocumentRole({ role: 'note' })).toBe('note');
    });

    it('ignores unknown roles', () => {
      expect(getDocumentRole({ role: 'chapter' })).toBeUndefined();
      expect(getDocumentRole({ role: '' })).toBeUndefined();
    });
  });

  describe('role predicates', () => {
    it('isScene is true only for explicit scenes', () => {
      expect(isScene({ role: 'scene' })).toBe(true);
      expect(isScene({ role: 'note' })).toBe(false);
      expect(isScene({})).toBe(false);
    });

    it('isNote is true only for explicit notes', () => {
      expect(isNote({ role: 'note' })).toBe(true);
      expect(isNote({ role: 'scene' })).toBe(false);
      expect(isNote(undefined)).toBe(false);
    });

    it('legacy role-less documents remain publishable', () => {
      expect(isPublishableByDefault({})).toBe(true);
      expect(isPublishableByDefault({ role: 'scene' })).toBe(true);
      expect(isPublishableByDefault({ role: 'note' })).toBe(false);
    });
  });

  describe('getSceneStatus', () => {
    it('accepts every status in the vocabulary', () => {
      for (const status of SCENE_STATUSES) {
        expect(getSceneStatus({ status })).toBe(status);
      }
    });

    it('rejects unknown values', () => {
      expect(getSceneStatus({ status: 'done' })).toBeUndefined();
      expect(getSceneStatus({})).toBeUndefined();
    });
  });

  describe('getSceneWordTarget', () => {
    it('parses positive integers', () => {
      expect(getSceneWordTarget({ wordTarget: '2500' })).toBe(2500);
    });

    it('floors fractional values', () => {
      expect(getSceneWordTarget({ wordTarget: '2500.7' })).toBe(2500);
    });

    it('treats empty, zero, negative and garbage as unset', () => {
      expect(getSceneWordTarget({ wordTarget: '' })).toBeUndefined();
      expect(getSceneWordTarget({ wordTarget: '  ' })).toBeUndefined();
      expect(getSceneWordTarget({ wordTarget: '0' })).toBeUndefined();
      expect(getSceneWordTarget({ wordTarget: '-10' })).toBeUndefined();
      expect(getSceneWordTarget({ wordTarget: 'lots' })).toBeUndefined();
      expect(getSceneWordTarget({})).toBeUndefined();
    });
  });

  describe('getSceneStoryDate', () => {
    const point: TimePoint = {
      systemId: 'gregorian',
      units: ['1999', '1', '3'],
      label: 'Founding Day',
    };

    it('round-trips a TimePoint through JSON', () => {
      const metadata = sceneMetadataPatch({ storyDate: point });
      expect(getSceneStoryDate(metadata)).toEqual(point);
    });

    it('rejects malformed JSON', () => {
      expect(getSceneStoryDate({ storyDate: '{not json' })).toBeUndefined();
    });

    it('rejects JSON that is not a TimePoint', () => {
      expect(getSceneStoryDate({ storyDate: '"1999"' })).toBeUndefined();
      expect(
        getSceneStoryDate({ storyDate: '{"units":["1"]}' })
      ).toBeUndefined();
      expect(
        getSceneStoryDate({ storyDate: '{"systemId":"g","units":[1,2]}' })
      ).toBeUndefined();
    });

    it('treats empty as unset', () => {
      expect(getSceneStoryDate({ storyDate: '' })).toBeUndefined();
      expect(getSceneStoryDate({})).toBeUndefined();
    });
  });

  describe('readSceneMetadata', () => {
    it('decodes all fields together', () => {
      const result = readSceneMetadata({
        role: 'scene',
        synopsis: 'Mira arrives at the gate.',
        status: 'draft',
        wordTarget: '1200',
        storyDate: JSON.stringify({ systemId: 'g', units: ['1'] }),
      });
      expect(result).toEqual({
        role: 'scene',
        synopsis: 'Mira arrives at the gate.',
        status: 'draft',
        wordTarget: 1200,
        storyDate: { systemId: 'g', units: ['1'] },
      });
    });

    it('produces safe defaults for an empty map', () => {
      expect(readSceneMetadata(undefined)).toEqual({
        role: undefined,
        synopsis: '',
        status: undefined,
        wordTarget: undefined,
        storyDate: undefined,
      });
    });
  });

  describe('roleMetadata', () => {
    it('sets role and matching tree icon', () => {
      expect(roleMetadata('scene')).toEqual({
        role: 'scene',
        icon: DOCUMENT_ROLE_ICONS.scene,
      });
      expect(roleMetadata('note')).toEqual({
        role: 'note',
        icon: DOCUMENT_ROLE_ICONS.note,
      });
    });

    it('keeps the conversation icon for a conversation', () => {
      expect(roleMetadata('note', 'conversation')).toEqual({
        role: 'note',
        icon: CONVERSATION_ICON,
      });
    });
  });

  describe('document format', () => {
    it('treats anything but "conversation" as prose', () => {
      expect(getDocumentFormat(undefined)).toBe('prose');
      expect(getDocumentFormat({ format: '' })).toBe('prose');
      expect(getDocumentFormat({ format: 'screenplay' })).toBe('prose');
      expect(getDocumentFormat({ format: 'conversation' })).toBe(
        'conversation'
      );
      expect(isConversation({ format: 'conversation' })).toBe(true);
      expect(isConversation({})).toBe(false);
    });

    it('writes the flag and the icon, clearing both for prose', () => {
      expect(formatMetadata('conversation', 'scene')).toEqual({
        format: 'conversation',
        icon: CONVERSATION_ICON,
      });
      expect(formatMetadata('prose', 'note')).toEqual({
        format: '',
        icon: DOCUMENT_ROLE_ICONS.note,
      });
      expect(formatMetadata('prose', undefined)).toEqual({
        format: '',
        icon: '',
      });
    });

    it('prefers the conversation icon over the role icon', () => {
      expect(documentIcon('scene', 'conversation')).toBe(CONVERSATION_ICON);
      expect(documentIcon('scene', 'prose')).toBe(DOCUMENT_ROLE_ICONS.scene);
      expect(documentIcon(undefined, 'prose')).toBe('');
    });
  });

  describe('sceneMetadataPatch', () => {
    it('skips undefined fields', () => {
      expect(sceneMetadataPatch({})).toEqual({});
      expect(sceneMetadataPatch({ status: 'final' })).toEqual({
        status: 'final',
      });
    });

    it('clears fields passed as null', () => {
      expect(
        sceneMetadataPatch({
          synopsis: null,
          status: null,
          wordTarget: null,
          storyDate: null,
        })
      ).toEqual({ synopsis: '', status: '', wordTarget: '', storyDate: '' });
    });

    it('encodes word targets as floored integers and drops non-positive', () => {
      expect(sceneMetadataPatch({ wordTarget: 1500.9 })).toEqual({
        wordTarget: '1500',
      });
      expect(sceneMetadataPatch({ wordTarget: 0 })).toEqual({ wordTarget: '' });
    });
  });
});
