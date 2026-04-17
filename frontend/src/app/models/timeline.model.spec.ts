import {
  createDefaultTimelineConfig,
  createDefaultTrack,
  pickNextColor,
  TIMELINE_COLOR_PALETTE,
  TIMELINE_CONFIG_VERSION,
} from './timeline.model';

describe('timeline.model', () => {
  describe('pickNextColor', () => {
    it('cycles through the palette', () => {
      for (let i = 0; i < TIMELINE_COLOR_PALETTE.length * 2; i++) {
        expect(pickNextColor(i)).toBe(
          TIMELINE_COLOR_PALETTE[i % TIMELINE_COLOR_PALETTE.length]
        );
      }
    });
  });

  describe('createDefaultTrack', () => {
    it('assigns a nanoid and defaults color from the palette', () => {
      const track = createDefaultTrack('Main', 0);
      expect(track.id).toMatch(/^.+$/);
      expect(track.name).toBe('Main');
      expect(track.order).toBe(0);
      expect(track.visible).toBe(true);
      expect(track.color).toBe(TIMELINE_COLOR_PALETTE[0]);
    });

    it('respects an explicit color', () => {
      const track = createDefaultTrack('Main', 0, '#123456');
      expect(track.color).toBe('#123456');
    });
  });

  describe('createDefaultTimelineConfig', () => {
    it('builds a config with one track and no events/eras', () => {
      const config = createDefaultTimelineConfig('el-1');
      expect(config.version).toBe(TIMELINE_CONFIG_VERSION);
      expect(config.elementId).toBe('el-1');
      expect(config.timeSystemId).toBe('');
      expect(config.tracks).toHaveLength(1);
      expect(config.tracks[0].name).toBe('Main track');
      expect(config.events).toEqual([]);
      expect(config.eras).toEqual([]);
    });

    it('generates unique track IDs across invocations', () => {
      const a = createDefaultTimelineConfig('el-a');
      const b = createDefaultTimelineConfig('el-b');
      expect(a.tracks[0].id).not.toBe(b.tracks[0].id);
    });
  });
});
