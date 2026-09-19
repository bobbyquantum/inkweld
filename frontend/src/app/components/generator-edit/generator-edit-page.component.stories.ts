import { signal } from '@angular/core';
import { type Generator } from '@models/generator';
import { GeneratorLibraryService } from '@services/generator/generator-library.service';
import { type Meta, moduleMetadata, type StoryObj } from '@storybook/angular';

import { GeneratorEditPageComponent } from './generator-edit-page.component';

/* ────────────────────────────────────────────────────────────────────────────
 * Fixtures
 *
 * The editor reads and writes one service, so the stories stub just that —
 * no Yjs, no IndexedDB, no project shell. The preview panel rolls for real,
 * against the same engine the app uses, so these stories show genuine output
 * rather than canned strings.
 * ──────────────────────────────────────────────────────────────────────────── */

/** The character-names generator shipped with the worldbuilding templates. */
const CHARACTER_NAMES: Generator = {
  id: 'gen-character-names',
  name: 'Character names',
  icon: 'person',
  description: 'Given name plus a compound surname or a byname.',
  category: 'names',
  template: '#given# #surname#',
  rules: [
    {
      key: 'given',
      entries: [
        'Aldric',
        'Brynn',
        'Cera',
        'Dara',
        'Edric',
        'Kesta',
        'Lorrin',
        'Mira',
        'Rhosyn',
        'Talin',
      ].map(text => ({ text })),
    },
    {
      key: 'surname',
      entries: [
        { text: '#surnameStem##surnameTail#', weight: 3 },
        { text: '#byname#' },
      ],
    },
    {
      key: 'surnameStem',
      entries: [
        'Stone',
        'Ash',
        'Thorn',
        'Harrow',
        'Ember',
        'Frost',
        'Crow',
      ].map(text => ({ text })),
    },
    {
      key: 'surnameTail',
      entries: ['helm', 'ridge', 'water', 'wood', 'mere', 'bourne', 'gate'].map(
        text => ({ text })
      ),
    },
    {
      key: 'byname',
      entries: ['the Quiet', 'the Unbroken', 'of the Ash Road', 'Saltborn'].map(
        text => ({ text })
      ),
    },
  ],
};

/** A generator whose template references a rule that does not exist. */
const BROKEN: Generator = {
  ...CHARACTER_NAMES,
  id: 'gen-broken',
  name: 'Half-written generator',
  template: '#given# #missing#',
  rules: [
    CHARACTER_NAMES.rules[0],
    { key: 'unused', entries: [{ text: '#unused#' }] },
  ],
};

function stubProviders(generators: Generator[]) {
  const library = {
    generators: signal(generators),
    hasGenerators: signal(generators.length > 0),
    findGenerator: (id: string | undefined) =>
      generators.find(generator => generator.id === id),
    addGenerator: (input: Omit<Generator, 'id'>) => ({ ...input, id: 'new' }),
    updateGenerator: () => undefined,
    removeGenerator: () => undefined,
  };
  return [{ provide: GeneratorLibraryService, useValue: library }];
}

/** The editor is a settings section, so give it the same breathing room. */
const shell = `
  <div style="max-width: 900px; margin: 0 auto; padding: 16px;">
    <app-generator-edit-page [generatorId]="generatorId"></app-generator-edit-page>
  </div>
`;

const meta: Meta<GeneratorEditPageComponent> = {
  title: 'Project/Generator Editor',
  component: GeneratorEditPageComponent,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<GeneratorEditPageComponent>;

/** Editing a generator that already has rules — the common case. */
export const Editing: Story = {
  decorators: [moduleMetadata({ providers: stubProviders([CHARACTER_NAMES]) })],
  render: () => ({
    props: { generatorId: CHARACTER_NAMES.id },
    template: shell,
  }),
};

/** Creating from scratch: a suggested template and two empty rules. */
export const Creating: Story = {
  decorators: [moduleMetadata({ providers: stubProviders([]) })],
  render: () => ({ props: { generatorId: null }, template: shell }),
};

/**
 * Validation in the two ways it bites: a reference that matches no rule, and
 * a rule that only ever refers back to itself. Saving stays disabled until
 * both are resolved.
 */
export const WithValidationErrors: Story = {
  name: 'Validation errors',
  decorators: [moduleMetadata({ providers: stubProviders([BROKEN]) })],
  render: () => ({ props: { generatorId: BROKEN.id }, template: shell }),
};

/** A generator id that no longer resolves — deleted while the editor was open. */
export const NotFound: Story = {
  name: 'Generator not found',
  decorators: [moduleMetadata({ providers: stubProviders([]) })],
  render: () => ({ props: { generatorId: 'gone' }, template: shell }),
};
