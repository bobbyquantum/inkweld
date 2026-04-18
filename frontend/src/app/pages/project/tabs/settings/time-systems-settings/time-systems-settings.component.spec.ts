import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { GREGORIAN_SYSTEM, type TimeSystem } from '@models/time-system';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { TimeSystemLibraryService } from '@services/timeline/time-system-library.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TimeSystemsSettingsComponent } from './time-systems-settings.component';

function makeSystem(overrides: Partial<TimeSystem> = {}): TimeSystem {
  return {
    ...GREGORIAN_SYSTEM,
    id: 'test-system',
    name: 'My Calendar',
    isBuiltIn: false,
    ...overrides,
  };
}

async function createComponent(
  systems: TimeSystem[] = [],
  dialogResult = true
) {
  const systemsSignal = signal<TimeSystem[]>(systems);
  const libraryMock = {
    systems: systemsSignal.asReadonly(),
    templates: [],
    installTemplate: vi.fn(),
    removeSystem: vi.fn(),
    findSystem: vi.fn((id: string) => systems.find(s => s.id === id)),
    addCustomSystem: vi.fn(),
    updateSystem: vi.fn(),
  };
  const dialogsMock = {
    openConfirmationDialog: vi.fn().mockResolvedValue(dialogResult),
  };

  await TestBed.configureTestingModule({
    imports: [TimeSystemsSettingsComponent, NoopAnimationsModule],
    providers: [
      { provide: TimeSystemLibraryService, useValue: libraryMock },
      { provide: DialogGatewayService, useValue: dialogsMock },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(TimeSystemsSettingsComponent);
  fixture.detectChanges();
  return {
    fixture,
    systemsSignal,
    libraryMock,
    dialogsMock,
    component: fixture.componentInstance,
  };
}

describe('TimeSystemsSettingsComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
  });

  it('renders without errors', async () => {
    const { fixture } = await createComponent();
    expect(fixture.nativeElement).toBeTruthy();
  });

  it('shows empty state when no systems installed', async () => {
    const { fixture } = await createComponent([]);
    fixture.detectChanges();
    const empty = fixture.nativeElement.querySelector(
      '[data-testid="time-systems-empty"]'
    );
    expect(empty).not.toBeNull();
  });

  it('shows list when systems are installed', async () => {
    const { fixture } = await createComponent([makeSystem()]);
    fixture.detectChanges();
    const list = fixture.nativeElement.querySelector(
      '[data-testid="time-systems-list"]'
    );
    expect(list).not.toBeNull();
  });

  it('shows system name in the list', async () => {
    const { fixture } = await createComponent([
      makeSystem({ name: 'My Calendar' }),
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('My Calendar');
  });

  it('shows all available template items in list', async () => {
    const systemsSignal = signal<TimeSystem[]>([]);
    const libraryMock = {
      systems: systemsSignal.asReadonly(),
      templates: [
        makeSystem({ id: 'tpl-1', name: 'Gregorian' }),
        makeSystem({ id: 'tpl-2', name: 'Stardate' }),
      ],
      installTemplate: vi.fn(),
      removeSystem: vi.fn(),
    };
    const dialogsMock = {
      openConfirmationDialog: vi.fn().mockResolvedValue(true),
    };
    await TestBed.configureTestingModule({
      imports: [TimeSystemsSettingsComponent, NoopAnimationsModule],
      providers: [
        { provide: TimeSystemLibraryService, useValue: libraryMock },
        { provide: DialogGatewayService, useValue: dialogsMock },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(TimeSystemsSettingsComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement).toBeTruthy();
  });

  describe('describeSystem()', () => {
    it('returns unit labels joined by /', async () => {
      const { component } = await createComponent();
      const sys = makeSystem({ unitLabels: ['Year', 'Month', 'Day'] });
      const description = (
        component as unknown as {
          describeSystem: (s: TimeSystem) => string;
        }
      ).describeSystem(sys);
      expect(description).toContain('Year / Month / Day');
    });
  });

  describe('onInstallTemplate()', () => {
    it('calls library.installTemplate with the template id', async () => {
      const { component, libraryMock } = await createComponent();
      (
        component as unknown as { onInstallTemplate: (id: string) => void }
      ).onInstallTemplate('gregorian');
      expect(libraryMock.installTemplate).toHaveBeenCalledWith('gregorian');
    });
  });

  describe('onDesignNew()', () => {
    it('switches to edit mode with null systemId', async () => {
      const { component, fixture } = await createComponent();
      (component as unknown as { onDesignNew: () => void }).onDesignNew();
      fixture.detectChanges();
      const state = (
        component as unknown as {
          editingState: () => { mode: string; systemId?: string | null };
        }
      ).editingState();
      expect(state.mode).toBe('edit');
      expect((state as { mode: string; systemId: null }).systemId).toBeNull();
    });
  });

  describe('onEdit()', () => {
    it('switches to edit mode with system id', async () => {
      const sys = makeSystem({ id: 'sys-edit' });
      const { component, fixture } = await createComponent([sys]);
      (component as unknown as { onEdit: (s: TimeSystem) => void }).onEdit(sys);
      fixture.detectChanges();
      const state = (
        component as unknown as {
          editingState: () => { mode: string; systemId?: string | null };
        }
      ).editingState();
      expect(state.mode).toBe('edit');
      expect((state as { mode: string; systemId: string }).systemId).toBe(
        'sys-edit'
      );
    });
  });

  describe('onEditorDone()', () => {
    it('returns to list mode after editing', async () => {
      const { component, fixture } = await createComponent();
      (component as unknown as { onDesignNew: () => void }).onDesignNew();
      fixture.detectChanges();
      (component as unknown as { onEditorDone: () => void }).onEditorDone();
      fixture.detectChanges();
      const state = (
        component as unknown as { editingState: () => { mode: string } }
      ).editingState();
      expect(state.mode).toBe('list');
    });
  });

  describe('onRemove()', () => {
    it('calls removeSystem when user confirms', async () => {
      const sys = makeSystem({ id: 'remove-me' });
      const { component, libraryMock, dialogsMock } = await createComponent(
        [sys],
        true
      );
      (component as unknown as { onRemove: (s: TimeSystem) => void }).onRemove(
        sys
      );
      // Wait for async confirmation
      await vi.waitFor(() =>
        expect(dialogsMock.openConfirmationDialog).toHaveBeenCalled()
      );
      await vi.waitFor(() =>
        expect(libraryMock.removeSystem).toHaveBeenCalledWith('remove-me')
      );
    });

    it('does not call removeSystem when user cancels', async () => {
      const sys = makeSystem({ id: 'keep-me' });
      const { component, libraryMock, dialogsMock } = await createComponent(
        [sys],
        false
      );
      (component as unknown as { onRemove: (s: TimeSystem) => void }).onRemove(
        sys
      );
      await vi.waitFor(() =>
        expect(dialogsMock.openConfirmationDialog).toHaveBeenCalled()
      );
      expect(libraryMock.removeSystem).not.toHaveBeenCalled();
    });
  });
});
