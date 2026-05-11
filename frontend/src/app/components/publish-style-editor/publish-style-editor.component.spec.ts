import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createDefaultPublishStyles,
  type PublishStyles,
} from '../../models/publish-style';
import { PublishStyleEditorComponent } from './publish-style-editor.component';

/**
 * Helper to capture the most recent emission from `stylesChange`.
 */
function setupComponent(initial?: PublishStyles): {
  component: PublishStyleEditorComponent;
  fixture: ComponentFixture<PublishStyleEditorComponent>;
  emissions: PublishStyles[];
} {
  const fixture = TestBed.createComponent(PublishStyleEditorComponent);
  const component = fixture.componentInstance;
  component.styles = initial ?? createDefaultPublishStyles();
  const emissions: PublishStyles[] = [];
  component.stylesChange.subscribe(s => emissions.push(s));
  fixture.detectChanges();
  return { component, fixture, emissions };
}

describe('PublishStyleEditorComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublishStyleEditorComponent, NoopAnimationsModule],
    }).compileComponents();
  });

  it('creates with default styles', () => {
    const { component } = setupComponent();
    expect(component).toBeTruthy();
    expect(component.styles).toBeTruthy();
  });

  describe('preset handling', () => {
    it('selectPreset replaces styles with preset and stamps preset id', () => {
      const { component, emissions } = setupComponent();

      component.selectPreset('manuscript');

      expect(emissions).toHaveLength(1);
      expect(emissions[0].preset).toBe('manuscript');
    });

    it('selectPreset is a no-op for unknown ids', () => {
      const { component, emissions } = setupComponent();

      component.selectPreset('does-not-exist');

      expect(emissions).toHaveLength(0);
    });

    it('currentPresetLabel reflects the active preset', () => {
      const styles = createDefaultPublishStyles();
      styles.preset = 'manuscript';
      const { component } = setupComponent(styles);

      expect(component['currentPresetLabel']()).toBe('Manuscript');
    });

    it('currentPresetLabel returns "Custom" when preset is unset', () => {
      const styles = createDefaultPublishStyles();
      styles.preset = undefined;
      const { component } = setupComponent(styles);
      expect(component['currentPresetLabel']()).toBe('Custom');
    });

    it('resetToDefaults emits a fresh default styles object', () => {
      const styles = createDefaultPublishStyles();
      styles.preset = 'manuscript';
      const { component, emissions } = setupComponent(styles);

      component.resetToDefaults();

      expect(emissions).toHaveLength(1);
      // Default styles ship with the 'paperback' preset selected.
      expect(emissions[0].preset).toBe('paperback');
    });
  });

  describe('updates clear preset and patch the right slice', () => {
    it('updatePage merges into page and clears preset', () => {
      const styles = createDefaultPublishStyles();
      styles.preset = 'manuscript';
      const { component, emissions } = setupComponent(styles);

      component.updatePage('size', 'a4');

      expect(emissions[0].preset).toBeUndefined();
      expect(emissions[0].page.size).toBe('a4');
      // Other page fields preserved.
      expect(emissions[0].page.marginTop).toBe(styles.page.marginTop);
    });

    it('updateBaseText merges into baseText and clears preset', () => {
      const styles = createDefaultPublishStyles();
      styles.preset = 'manuscript';
      const { component, emissions } = setupComponent(styles);

      component.updateBaseText('fontSize', 13);

      expect(emissions[0].preset).toBeUndefined();
      expect(emissions[0].baseText.fontSize).toBe(13);
    });

    it('updateNodeText creates the per-node entry and merges text', () => {
      const { component, emissions } = setupComponent();

      component.updateNodeText('heading2', 'fontSize', 22);

      expect(emissions[0].nodes.heading2?.text?.fontSize).toBe(22);
    });

    it('makeNodeUpdater returns a bound updater for the given node', () => {
      const { component, emissions } = setupComponent();

      const update = component.makeNodeUpdater('heading1');
      update('weight', 'bold');

      expect(emissions[0].nodes.heading1?.text?.weight).toBe('bold');
    });

    it('updateChapterText patches structure.chapterTitle.text', () => {
      const { component, emissions } = setupComponent();

      component.updateChapterText('align', 'center');

      expect(emissions[0].structure.chapterTitle.text.align).toBe('center');
    });

    it('updateChapterPageBreak toggles structure.chapterTitle.pageBreakBefore', () => {
      const { component, emissions } = setupComponent();

      component.updateChapterPageBreak(true);

      expect(emissions[0].structure.chapterTitle.pageBreakBefore).toBe(true);
    });

    it('updateSceneBreakText patches structure.sceneBreak.text', () => {
      const { component, emissions } = setupComponent();

      component.updateSceneBreakText('align', 'center');

      expect(emissions[0].structure.sceneBreak.text.align).toBe('center');
    });

    it('updateWorldbuildingLayout patches worldbuilding.defaultLayout', () => {
      const { component, emissions } = setupComponent();

      component.updateWorldbuildingLayout('compact');

      expect(emissions[0].worldbuilding.defaultLayout).toBe('compact');
    });

    it('updateWorldbuildingEntryTitle patches worldbuilding.entryTitle', () => {
      const { component, emissions } = setupComponent();

      component.updateWorldbuildingEntryTitle('weight', 'semibold');

      expect(emissions[0].worldbuilding.entryTitle.weight).toBe('semibold');
    });
  });

  describe('input parsers', () => {
    it('parseNumber returns finite numbers and undefined for blank or NaN', () => {
      const { component } = setupComponent();

      const make = (value: string): Event =>
        ({
          target: { value } as unknown as HTMLInputElement,
        }) as unknown as Event;

      expect(component.parseNumber(make('42'))).toBe(42);
      expect(component.parseNumber(make(''))).toBeUndefined();
      expect(component.parseNumber(make('abc'))).toBeUndefined();
    });

    it('parseColor returns trimmed string or undefined for blank', () => {
      const { component } = setupComponent();

      const make = (value: string): Event =>
        ({
          target: { value } as unknown as HTMLInputElement,
        }) as unknown as Event;

      expect(component.parseColor(make('  #abcdef  '))).toBe('#abcdef');
      expect(component.parseColor(make('   '))).toBeUndefined();
    });
  });

  describe('immutability', () => {
    it('does not mutate the input styles object on update', () => {
      const styles = createDefaultPublishStyles();
      const before = JSON.stringify(styles);
      const { component } = setupComponent(styles);

      component.updateBaseText('fontSize', 99);
      component.updateNodeText('heading1', 'weight', 'bold');
      component.updatePage('size', 'a5');

      expect(JSON.stringify(styles)).toBe(before);
    });
  });

  describe('bound callbacks (used by ngTemplateOutlet)', () => {
    it('updateBaseTextBound delegates to updateBaseText with this preserved', () => {
      const { component, emissions } = setupComponent();
      const fn = component['updateBaseTextBound'];
      fn('fontSize', 17);
      expect(emissions[0].baseText.fontSize).toBe(17);
    });

    it('updateChapterTextBound delegates to updateChapterText', () => {
      const { component, emissions } = setupComponent();
      const fn = component['updateChapterTextBound'];
      fn('weight', 'bold');
      expect(emissions[0].structure.chapterTitle.text.weight).toBe('bold');
    });

    it('updateSceneBreakTextBound delegates to updateSceneBreakText', () => {
      const { component, emissions } = setupComponent();
      const fn = component['updateSceneBreakTextBound'];
      fn('color', '#abcdef');
      expect(emissions[0].structure.sceneBreak.text.color).toBe('#abcdef');
    });

    it('updateWorldbuildingEntryTitleBound delegates to updateWorldbuildingEntryTitle', () => {
      const { component, emissions } = setupComponent();
      const fn = component['updateWorldbuildingEntryTitleBound'];
      fn('fontSize', 19);
      expect(emissions[0].worldbuilding.entryTitle.fontSize).toBe(19);
    });
  });

  describe('getNodeText', () => {
    it('returns the existing text style for a node when set', () => {
      const styles = createDefaultPublishStyles();
      styles.nodes.heading1 = { text: { fontSize: 33 } };
      const { component } = setupComponent(styles);
      expect(component.getNodeText('heading1').fontSize).toBe(33);
    });

    it('returns an empty object for a node with no text slice in defaults', () => {
      const { component } = setupComponent();
      // `image` ships with only a box style; .text should be empty.
      expect(component.getNodeText('image')).toEqual({});
    });

    it('returns an empty object when node entry is removed entirely', () => {
      const styles = createDefaultPublishStyles();
      delete styles.nodes.heading2;
      const { component } = setupComponent(styles);
      expect(component.getNodeText('heading2')).toEqual({});
    });
  });

  describe('updateNodeText edge cases', () => {
    it('creates a brand-new node entry when none exists', () => {
      const styles = createDefaultPublishStyles();
      delete styles.nodes.heading4;
      const { component, emissions } = setupComponent(styles);

      component.updateNodeText('heading4', 'fontSize', 14);

      expect(emissions[0].nodes.heading4?.text?.fontSize).toBe(14);
    });
  });
});
