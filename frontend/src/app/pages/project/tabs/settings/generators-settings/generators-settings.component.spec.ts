import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Generator } from '@models/generator';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { GeneratorLibraryService } from '@services/generator/generator-library.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../../../../testing/transloco-test-provider';
import { GeneratorsSettingsComponent } from './generators-settings.component';

function makeGenerator(overrides: Partial<Generator> = {}): Generator {
  return {
    id: 'gen-1',
    name: 'Character names',
    icon: 'casino',
    description: 'Names for people',
    category: 'names',
    template: '#first#',
    rules: [{ key: 'first', entries: [{ text: 'Aldric' }] }],
    ...overrides,
  };
}

async function createComponent(
  generators: Generator[] = [],
  dialogResult = true
) {
  const generatorsSignal = signal<Generator[]>(generators);
  const libraryMock = {
    generators: generatorsSignal.asReadonly(),
    hasGenerators: signal(generators.length > 0).asReadonly(),
    findGenerator: vi.fn((id: string) => generators.find(g => g.id === id)),
    addGenerator: vi.fn(),
    updateGenerator: vi.fn(),
    removeGenerator: vi.fn(),
    roll: vi.fn(() => []),
    rollOne: vi.fn(() => null),
  };
  const dialogsMock = {
    openConfirmationDialog: vi.fn().mockResolvedValue(dialogResult),
  };

  await TestBed.configureTestingModule({
    imports: [translocoTestProvider(), GeneratorsSettingsComponent],
    providers: [
      { provide: GeneratorLibraryService, useValue: libraryMock },
      { provide: DialogGatewayService, useValue: dialogsMock },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(GeneratorsSettingsComponent);
  fixture.detectChanges();
  return {
    fixture,
    generatorsSignal,
    libraryMock,
    dialogsMock,
    component: fixture.componentInstance,
  };
}

/** Reads a testid element from the rendered component. */
function query(fixture: { nativeElement: HTMLElement }, testId: string) {
  return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
}

describe('GeneratorsSettingsComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
  });

  it('shows the empty state when the project has no generators', async () => {
    const { fixture } = await createComponent([]);
    expect(query(fixture, 'generators-empty')).not.toBeNull();
    expect(query(fixture, 'generators-list')).toBeNull();
  });

  it('lists the generators with their category', async () => {
    const { fixture } = await createComponent([makeGenerator()]);
    expect(query(fixture, 'generators-list')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Character names');
    expect(fixture.nativeElement.textContent).toContain('names');
  });

  it('shows a sample roll for each generator', async () => {
    const { fixture } = await createComponent([makeGenerator()]);
    const row = query(fixture, 'generators-row-gen-1');
    expect(row?.textContent).toContain('Aldric');
  });

  it('keeps the sample stable across change detection runs', async () => {
    const { fixture } = await createComponent([
      makeGenerator({
        rules: [
          {
            key: 'first',
            entries: [{ text: 'Aldric' }, { text: 'Brynn' }, { text: 'Cera' }],
          },
        ],
      }),
    ]);
    const first = query(fixture, 'generators-row-gen-1')?.textContent;
    fixture.detectChanges();
    expect(query(fixture, 'generators-row-gen-1')?.textContent).toBe(first);
  });

  it('switches to the editor when creating', async () => {
    const { fixture, component } = await createComponent([]);
    (component as unknown as { onCreate: () => void }).onCreate();
    fixture.detectChanges();
    expect(query(fixture, 'generators-empty')).toBeNull();
    expect(query(fixture, 'generator-edit-back')).not.toBeNull();
  });

  it('removes a generator once the confirmation is accepted', async () => {
    const generator = makeGenerator();
    const { component, libraryMock, dialogsMock } = await createComponent([
      generator,
    ]);

    (component as unknown as { onRemove: (g: Generator) => void }).onRemove(
      generator
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(dialogsMock.openConfirmationDialog).toHaveBeenCalled();
    expect(libraryMock.removeGenerator).toHaveBeenCalledWith('gen-1');
  });

  it('keeps the generator when the confirmation is declined', async () => {
    const generator = makeGenerator();
    const { component, libraryMock } = await createComponent(
      [generator],
      false
    );

    (component as unknown as { onRemove: (g: Generator) => void }).onRemove(
      generator
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(libraryMock.removeGenerator).not.toHaveBeenCalled();
  });
});
