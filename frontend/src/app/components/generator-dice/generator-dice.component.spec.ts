import { computed, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { type Generator } from '@models/generator';
import { GeneratorLibraryService } from '@services/generator/generator-library.service';
import { rollGenerator, type RollOptions } from '@utils/generator-engine';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { GeneratorDiceComponent } from './generator-dice.component';

function makeGenerator(overrides: Partial<Generator> = {}): Generator {
  return {
    id: 'gen-1',
    name: 'Character names',
    icon: 'casino',
    description: '',
    category: 'names',
    template: '#first#',
    rules: [
      {
        key: 'first',
        entries: [{ text: 'Aldric' }, { text: 'Brynn' }, { text: 'Cera' }],
      },
    ],
    ...overrides,
  };
}

/** The component's protected surface, as the tests drive it. */
interface DiceApi {
  visible: () => boolean;
  suggestions: () => { text: string; seed: number }[];
  onMenuOpened: () => void;
  rollFor: (generator: Generator) => void;
  onReroll: (event: Event) => void;
  onPick: (text: string) => void;
}

async function createComponent(
  generators: Generator[],
  generatorId?: string,
  exclude: readonly string[] = []
) {
  const generatorsSignal = signal<Generator[]>(generators);
  const libraryMock = {
    generators: generatorsSignal.asReadonly(),
    hasGenerators: computed(() => generatorsSignal().length > 0),
    findGenerator: vi.fn((id: string | undefined) =>
      generatorsSignal().find(g => g.id === id)
    ),
    roll: vi.fn((id: string | undefined, options: RollOptions = {}) => {
      const generator = generatorsSignal().find(g => g.id === id);
      return generator ? rollGenerator(generator, options) : [];
    }),
  };

  await TestBed.configureTestingModule({
    imports: [translocoTestProvider(), GeneratorDiceComponent],
    providers: [{ provide: GeneratorLibraryService, useValue: libraryMock }],
  }).compileComponents();

  const fixture: ComponentFixture<GeneratorDiceComponent> =
    TestBed.createComponent(GeneratorDiceComponent);
  fixture.componentRef.setInput('generatorId', generatorId);
  fixture.componentRef.setInput('exclude', exclude);
  fixture.detectChanges();

  return {
    fixture,
    libraryMock,
    api: fixture.componentInstance as unknown as DiceApi,
  };
}

describe('GeneratorDiceComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
  });

  describe('visibility', () => {
    it('renders nothing when the project has no generators', async () => {
      const { fixture, api } = await createComponent([]);
      expect(api.visible()).toBe(false);
      expect(
        fixture.nativeElement.querySelector('[data-testid="generator-dice"]')
      ).toBeNull();
    });

    it('renders when a bound generator exists', async () => {
      const { fixture, api } = await createComponent(
        [makeGenerator()],
        'gen-1'
      );
      expect(api.visible()).toBe(true);
      expect(
        fixture.nativeElement.querySelector('[data-testid="generator-dice"]')
      ).not.toBeNull();
    });

    it('hides when the bound generator has been deleted', async () => {
      // Falling back to the picker would offer generators the schema never
      // chose for this field, which is worse than offering none.
      const { fixture, api } = await createComponent(
        [makeGenerator()],
        'deleted-id'
      );
      expect(api.visible()).toBe(false);
      expect(
        fixture.nativeElement.querySelector('[data-testid="generator-dice"]')
      ).toBeNull();
    });

    it('renders the picker for an unbound field', async () => {
      const { api } = await createComponent([makeGenerator()], undefined);
      expect(api.visible()).toBe(true);
    });

    it('uses a custom test id when given', async () => {
      const { fixture } = await createComponent([makeGenerator()], 'gen-1');
      fixture.componentRef.setInput('testId', 'field-dice-alias');
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector('[data-testid="field-dice-alias"]')
      ).not.toBeNull();
    });
  });

  describe('rolling', () => {
    it('rolls distinct candidates when the menu opens', async () => {
      const { api } = await createComponent([makeGenerator()], 'gen-1');
      api.onMenuOpened();

      const texts = api.suggestions().map(result => result.text);
      expect(texts.length).toBeGreaterThan(0);
      expect(new Set(texts).size).toBe(texts.length);
      for (const text of texts) {
        expect(['Aldric', 'Brynn', 'Cera']).toContain(text);
      }
    });

    it('does not roll when the binding resolves to nothing', async () => {
      const { api, libraryMock } = await createComponent(
        [makeGenerator()],
        'deleted-id'
      );
      api.onMenuOpened();
      expect(libraryMock.roll).not.toHaveBeenCalled();
      expect(api.suggestions()).toEqual([]);
    });

    it('excludes names already in use', async () => {
      const { api } = await createComponent([makeGenerator()], 'gen-1', [
        'aldric',
        ' Brynn ',
      ]);
      api.onMenuOpened();
      expect(api.suggestions().map(result => result.text)).toEqual(['Cera']);
    });

    it('re-rolls in place without bubbling the click to the menu', async () => {
      const { api } = await createComponent(
        [
          makeGenerator({
            rules: [
              {
                key: 'first',
                entries: Array.from({ length: 40 }, (_, i) => ({
                  text: `Name${i}`,
                })),
              },
            ],
          }),
        ],
        'gen-1'
      );
      api.onMenuOpened();
      const before = api.suggestions().map(result => result.text);

      const event = new MouseEvent('click');
      const stopPropagation = vi.spyOn(event, 'stopPropagation');
      api.onReroll(event);

      expect(stopPropagation).toHaveBeenCalled();
      expect(api.suggestions().map(result => result.text)).not.toEqual(before);
    });

    it('rolls a specific generator from the picker', async () => {
      const other = makeGenerator({
        id: 'gen-2',
        name: 'Places',
        template: '#town#',
        rules: [{ key: 'town', entries: [{ text: 'Riverwyn' }] }],
      });
      const { api } = await createComponent([makeGenerator(), other]);

      api.rollFor(other);
      expect(api.suggestions().map(result => result.text)).toEqual([
        'Riverwyn',
      ]);
    });
  });

  it('emits the picked candidate', async () => {
    const { fixture, api } = await createComponent([makeGenerator()], 'gen-1');
    const picked = vi.fn();
    fixture.componentInstance.picked.subscribe(picked);

    api.onPick('Aldric');

    expect(picked).toHaveBeenCalledWith('Aldric');
  });
});
