import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { type Generator } from '@models/generator';
import { GeneratorLibraryService } from '@services/generator/generator-library.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { GeneratorEditPageComponent } from './generator-edit-page.component';

function makeGenerator(overrides: Partial<Generator> = {}): Generator {
  return {
    id: 'gen-1',
    name: 'Character names',
    icon: 'casino',
    description: 'Names for people',
    category: 'names',
    template: '#first# #last#',
    rules: [
      { key: 'first', entries: [{ text: 'Aldric' }, { text: 'Brynn' }] },
      { key: 'last', entries: [{ text: 'Stonehelm', weight: 3 }] },
    ],
    createdAt: '2020-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** The component's protected surface, as the tests drive it. */
interface EditorApi {
  name: ReturnType<typeof signal<string>>;
  template: ReturnType<typeof signal<string>>;
  rules: ReturnType<
    typeof signal<{ _id: number; key: string; entriesText: string }[]>
  >;
  canSave: () => boolean;
  errors: () => { code: string }[];
  preview: () => { text: string }[];
  onAddRule: () => void;
  onRemoveRule: (id: number) => void;
  onRuleKeyChange: (id: number, key: string) => void;
  onRuleEntriesChange: (id: number, text: string) => void;
  onReroll: () => void;
  onSave: () => void;
  onCancel: () => void;
  entryCount: (rule: { entriesText: string }) => number;
}

async function createComponent(
  generatorId: string | null,
  generators: Generator[] = []
) {
  const libraryMock = {
    generators: signal<Generator[]>(generators).asReadonly(),
    findGenerator: vi.fn((id: string) => generators.find(g => g.id === id)),
    addGenerator: vi.fn(),
    updateGenerator: vi.fn(),
    removeGenerator: vi.fn(),
  };

  await TestBed.configureTestingModule({
    imports: [translocoTestProvider(), GeneratorEditPageComponent],
    providers: [{ provide: GeneratorLibraryService, useValue: libraryMock }],
  }).compileComponents();

  const fixture: ComponentFixture<GeneratorEditPageComponent> =
    TestBed.createComponent(GeneratorEditPageComponent);
  fixture.componentRef.setInput('generatorId', generatorId);
  fixture.detectChanges();

  return {
    fixture,
    libraryMock,
    api: fixture.componentInstance as unknown as EditorApi,
  };
}

describe('GeneratorEditPageComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
  });

  describe('create mode', () => {
    it('starts from a blank draft with a suggested template', async () => {
      const { api } = await createComponent(null);
      expect(api.name()).toBe('');
      expect(api.template()).toBe('#first# #last#');
      expect(api.rules().map(rule => rule.key)).toEqual(['first', 'last']);
    });

    it('cannot save without a name', async () => {
      const { api } = await createComponent(null);
      api.rules.set([{ _id: 1, key: 'first', entriesText: 'Aldric' }]);
      api.template.set('#first#');
      expect(api.canSave()).toBe(false);
    });

    it('adds the generator through the library on save', async () => {
      const { api, libraryMock } = await createComponent(null);
      api.name.set('  Places  ');
      api.template.set('#town#');
      api.rules.set([
        { _id: 1, key: 'town', entriesText: 'Riverwyn\nAshford | 2' },
      ]);

      expect(api.canSave()).toBe(true);
      api.onSave();

      expect(libraryMock.addGenerator).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Places',
          template: '#town#',
          rules: [
            {
              key: 'town',
              entries: [{ text: 'Riverwyn' }, { text: 'Ashford', weight: 2 }],
            },
          ],
        })
      );
    });
  });

  describe('edit mode', () => {
    it('loads the generator into the draft, weights included', async () => {
      const { api } = await createComponent('gen-1', [makeGenerator()]);
      expect(api.name()).toBe('Character names');
      expect(api.rules()[1].entriesText).toBe('Stonehelm | 3');
    });

    it('updates through the library on save', async () => {
      const { api, libraryMock } = await createComponent('gen-1', [
        makeGenerator(),
      ]);
      api.name.set('Renamed');
      api.onSave();

      expect(libraryMock.updateGenerator).toHaveBeenCalledWith(
        'gen-1',
        expect.objectContaining({ name: 'Renamed' })
      );
    });

    it('reports a generator that has since been deleted', async () => {
      const { fixture } = await createComponent('missing', []);
      const error = fixture.nativeElement.querySelector(
        '[data-testid="generator-edit-error"]'
      );
      expect(error).not.toBeNull();
    });
  });

  describe('validation', () => {
    it('blocks saving while a reference resolves to nothing', async () => {
      const { api, libraryMock } = await createComponent(null);
      api.name.set('Broken');
      api.template.set('#missing#');
      api.rules.set([]);

      expect(api.errors().map(issue => issue.code)).toContain(
        'unknown-reference'
      );
      expect(api.canSave()).toBe(false);

      api.onSave();
      expect(libraryMock.addGenerator).not.toHaveBeenCalled();
    });

    it('blocks saving a rule that can never finish expanding', async () => {
      const { api } = await createComponent(null);
      api.name.set('Looping');
      api.template.set('#a#');
      api.rules.set([{ _id: 1, key: 'a', entriesText: '#a#' }]);

      expect(api.errors().map(issue => issue.code)).toContain(
        'non-terminating'
      );
      expect(api.canSave()).toBe(false);
    });
  });

  describe('preview', () => {
    it('shows candidates for the current draft', async () => {
      const { api } = await createComponent('gen-1', [makeGenerator()]);
      const texts = api.preview().map(result => result.text);
      expect(texts.length).toBeGreaterThan(0);
      for (const text of texts) {
        expect(text).toMatch(/^(Aldric|Brynn) Stonehelm$/);
      }
    });

    it('changes the candidates when re-rolled', async () => {
      const { api } = await createComponent('gen-1', [
        makeGenerator({
          template: '#first#',
          rules: [
            {
              key: 'first',
              entries: Array.from({ length: 40 }, (_, i) => ({
                text: `Name${i}`,
              })),
            },
          ],
        }),
      ]);
      const before = api.preview().map(result => result.text);
      api.onReroll();
      expect(api.preview().map(result => result.text)).not.toEqual(before);
    });

    it('tracks draft edits', async () => {
      const { api } = await createComponent(null);
      api.template.set('#word#');
      api.rules.set([{ _id: 1, key: 'word', entriesText: 'Only' }]);
      expect(api.preview().map(result => result.text)).toEqual(['Only']);
    });
  });

  describe('rule list', () => {
    it('adds, edits and removes rules', async () => {
      const { api } = await createComponent(null);
      api.rules.set([]);
      api.onAddRule();

      const [rule] = api.rules();
      api.onRuleKeyChange(rule._id, 'town');
      api.onRuleEntriesChange(rule._id, 'Riverwyn\n\nAshford');

      expect(api.rules()[0]).toMatchObject({
        key: 'town',
        entriesText: 'Riverwyn\n\nAshford',
      });
      expect(api.entryCount(api.rules()[0])).toBe(2);

      api.onRemoveRule(rule._id);
      expect(api.rules()).toEqual([]);
    });
  });

  it('emits done on cancel without saving', async () => {
    const { fixture, api, libraryMock } = await createComponent(null);
    const done = vi.fn();
    fixture.componentInstance.done.subscribe(done);

    api.onCancel();

    expect(done).toHaveBeenCalled();
    expect(libraryMock.addGenerator).not.toHaveBeenCalled();
  });
});
