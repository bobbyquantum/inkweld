import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { GREGORIAN_SYSTEM, RELATIVE_YEARS_SYSTEM } from '@models/time-system';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  TimelineEraDialogComponent,
  type TimelineEraDialogData,
} from './timeline-era-dialog.component';

const baseData: TimelineEraDialogData = {
  era: null,
  system: GREGORIAN_SYSTEM,
  defaultColor: '#3f88c5',
  defaultStart: { systemId: 'gregorian', units: ['2000', '1', '1'] },
  defaultEnd: { systemId: 'gregorian', units: ['2000', '12', '30'] },
  username: 'alice',
  slug: 'my-novel',
};

const mockDialogGateway = {
  openMediaSelectorDialog: vi.fn(),
};

const mockLocalStorage = {
  getMediaUrl: vi.fn(),
};

async function createComponent(data: TimelineEraDialogData = baseData) {
  const closeSpy = vi.fn();
  await TestBed.configureTestingModule({
    imports: [translocoTestProvider(), TimelineEraDialogComponent],
    providers: [
      provideZonelessChangeDetection(),
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: { close: closeSpy } },
      { provide: DialogGatewayService, useValue: mockDialogGateway },
      { provide: LocalStorageService, useValue: mockLocalStorage },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(TimelineEraDialogComponent);
  fixture.detectChanges();
  return { fixture, closeSpy, component: fixture.componentInstance };
}

describe('TimelineEraDialogComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
    mockLocalStorage.getMediaUrl.mockResolvedValue(null);
  });

  it('renders for creating a new era', async () => {
    const { fixture } = await createComponent();
    expect(fixture.nativeElement).toBeTruthy();
  });

  it('renders for editing an existing era', async () => {
    const data: TimelineEraDialogData = {
      ...baseData,
      era: {
        id: 'era-1',
        name: 'The Dark Ages',
        color: '#333',
        start: { systemId: 'gregorian', units: ['500', '1', '1'] },
        end: { systemId: 'gregorian', units: ['1000', '12', '31'] },
      },
    };
    const { fixture } = await createComponent(data);
    expect(fixture.nativeElement).toBeTruthy();
  });

  it('seeds form values from the existing era', async () => {
    const data: TimelineEraDialogData = {
      ...baseData,
      era: {
        id: 'era-2',
        name: 'Renaissance',
        color: '#c9b458',
        start: { systemId: 'gregorian', units: ['1300', '1', '1'] },
        end: { systemId: 'gregorian', units: ['1600', '12', '31'] },
      },
    };
    const { component } = await createComponent(data);
    expect(component.form.name().value()).toBe('Renaissance');
    expect(component.form.color().value()).toBe('#c9b458');
  });

  it('isGregorian() returns true for gregorian system', async () => {
    const { component } = await createComponent();
    expect(
      (component as unknown as { isGregorian: () => boolean }).isGregorian()
    ).toBe(true);
  });

  it('isGregorian() returns false for relative years system', async () => {
    const data: TimelineEraDialogData = {
      ...baseData,
      system: RELATIVE_YEARS_SYSTEM,
    };
    const { component } = await createComponent(data);
    expect(
      (component as unknown as { isGregorian: () => boolean }).isGregorian()
    ).toBe(false);
  });

  describe('onCancel()', () => {
    it('closes the dialog without value', async () => {
      const { component, closeSpy } = await createComponent();
      (component as unknown as { onCancel: () => void }).onCancel();
      expect(closeSpy).toHaveBeenCalledWith();
    });
  });

  describe('onDelete()', () => {
    it('closes with delete result for an existing era', async () => {
      const data: TimelineEraDialogData = {
        ...baseData,
        era: {
          id: 'del-era',
          name: 'Deleted Era',
          color: '#fff',
          start: { systemId: 'gregorian', units: ['100', '1', '1'] },
          end: { systemId: 'gregorian', units: ['200', '12', '31'] },
        },
      };
      const { component, closeSpy } = await createComponent(data);
      (component as unknown as { onDelete: () => void }).onDelete();
      expect(closeSpy).toHaveBeenCalledWith({
        kind: 'delete',
        eraId: 'del-era',
      });
    });

    it('does nothing when there is no era (new mode)', async () => {
      const { component, closeSpy } = await createComponent();
      (component as unknown as { onDelete: () => void }).onDelete();
      expect(closeSpy).not.toHaveBeenCalled();
    });
  });

  describe('onSave()', () => {
    it('does not save when form is invalid (empty name)', async () => {
      const { component, closeSpy } = await createComponent();
      (component as unknown as { onSave: () => void }).onSave();
      expect(closeSpy).not.toHaveBeenCalled();
    });

    it('saves a valid era', async () => {
      const { component, closeSpy } = await createComponent();
      component.form.name().value.set('New Era');
      component.form.color().value.set('#aabbcc');
      component.model.update(m => ({
        ...m,
        startUnits: ['2000', '1', '1'],
        endUnits: ['2010', '12', '30'],
      }));
      (component as unknown as { onSave: () => void }).onSave();
      expect(closeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'save' })
      );
    });

    it('flags dates outside the time system as invalid', async () => {
      const { component, closeSpy } = await createComponent();
      component.form.name().value.set('Bad Era');
      component.form.color().value.set('#aabbcc');
      component.model.update(m => ({
        ...m,
        startUnits: ['2000', '1', '1'],
        // The Gregorian template uses uniform 30-day months; day 31 is
        // outside the system and used to fail silently on save.
        endUnits: ['2010', '12', '31'],
      }));
      await Promise.resolve();
      expect(
        component
          .form()
          .errors()
          .some(e => e.kind === 'invalidPoint')
      ).toBe(true);
      (component as unknown as { onSave: () => void }).onSave();
      expect(closeSpy).not.toHaveBeenCalled();
    });

    it('does not save when end is before start', async () => {
      const { component, closeSpy } = await createComponent();
      component.form.name().value.set('Reversed Era');
      component.form.color().value.set('#aabbcc');
      component.model.update(m => ({
        ...m,
        startUnits: ['2010', '1', '1'],
        endUnits: ['2000', '12', '30'],
      }));
      // Wait for the reactive tree validation to settle.
      await Promise.resolve();
      (component as unknown as { onSave: () => void }).onSave();
      expect(closeSpy).not.toHaveBeenCalled();
    });
  });

  // ─── Date change handlers ──────────────────────────────────────────────────

  it('onStartDateChange updates start units from Event', async () => {
    const { component } = await createComponent();
    const c = component as unknown as {
      onStartDateChange: (e: Event) => void;
    };
    const fakeEvent = { target: { value: '2023-04-15' } } as unknown as Event;
    c.onStartDateChange(fakeEvent);
    const values = component.model().startUnits;
    expect(values[0]).toBe('2023');
    expect(values[1]).toBe('4');
    expect(values[2]).toBe('15');
  });

  it('onEndDateChange updates end units from Event', async () => {
    const { component } = await createComponent();
    const c = component as unknown as {
      onEndDateChange: (e: Event) => void;
    };
    const fakeEvent = { target: { value: '2024-11-20' } } as unknown as Event;
    c.onEndDateChange(fakeEvent);
    const values = component.model().endUnits;
    expect(values[0]).toBe('2024');
    expect(values[1]).toBe('11');
    expect(values[2]).toBe('20');
  });

  it('ignores invalid ISO date strings', async () => {
    const { component } = await createComponent();
    const c = component as unknown as {
      onStartDateChange: (e: Event) => void;
    };
    const before = component.model().startUnits;
    const fakeEvent = { target: { value: 'invalid' } } as unknown as Event;
    c.onStartDateChange(fakeEvent);
    const after = component.model().startUnits;
    expect(after).toEqual(before);
  });

  // ─── Dropdown input mode ───────────────────────────────────────────────────

  it('inputModeFor returns the unit mode from the system', async () => {
    const { component } = await createComponent();
    const mode = (
      component as unknown as {
        inputModeFor: (i: number) => 'numeric' | 'dropdown';
      }
    ).inputModeFor(0);
    expect(mode).toBe('numeric');
  });

  it('optionsFor returns dropdown options for month unit', async () => {
    const { component } = await createComponent();
    const opts = (
      component as unknown as {
        optionsFor: (i: number) => readonly { value: string; label: string }[];
      }
    ).optionsFor(1);
    expect(opts).toHaveLength(12);
  });

  // ─── Seed fallback for different system ────────────────────────────────────

  it('seeds units with per-unit minimums when era system differs from dialog system', async () => {
    const data: TimelineEraDialogData = {
      ...baseData,
      era: {
        id: 'era-diff',
        name: 'Different',
        color: '#000',
        start: { systemId: 'other-system', units: ['100', '200', '300'] },
        end: { systemId: 'other-system', units: ['400', '500', '600'] },
      },
    };
    const { component } = await createComponent(data);
    const startVals = component.model().startUnits;
    expect(startVals).toEqual(['1', '1', '1']);
  });

  // ─── Start / end units accessors ──────────────────────────────────────────

  it('startUnits returns the form start units array', async () => {
    const { component } = await createComponent();
    const startUnits = component.model().startUnits;
    expect(startUnits).toHaveLength(3);
    expect(startUnits[0]).toBe('2000');
  });

  it('endUnits returns the form end units array', async () => {
    const { component } = await createComponent();
    const endUnits = component.model().endUnits;
    expect(endUnits).toHaveLength(3);
    expect(endUnits[0]).toBe('2000');
  });

  // ─── Non-Gregorian rendering ────────────────────────────────────────────────

  it('renders unit fields for non-Gregorian system', async () => {
    const data: TimelineEraDialogData = {
      ...baseData,
      system: RELATIVE_YEARS_SYSTEM,
      defaultStart: { systemId: RELATIVE_YEARS_SYSTEM.id, units: ['0'] },
      defaultEnd: { systemId: RELATIVE_YEARS_SYSTEM.id, units: ['100'] },
    };
    const { fixture } = await createComponent(data);
    const unitFields = fixture.nativeElement.querySelectorAll(
      '[data-testid^="timeline-era-start-unit-"]'
    );
    expect(unitFields.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Background image ──────────────────────────────────────────────────────

  describe('background image', () => {
    it('seeds imageUrl from an existing era', async () => {
      const data: TimelineEraDialogData = {
        ...baseData,
        era: {
          id: 'era-img',
          name: 'Illustrated Era',
          color: '#123456',
          start: { systemId: 'gregorian', units: ['100', '1', '1'] },
          end: { systemId: 'gregorian', units: ['200', '12', '31'] },
          imageUrl: 'media:img-hero',
        },
      };
      const { component } = await createComponent(data);
      expect(component.model().imageUrl).toBe('media:img-hero');
    });

    it('resolves the preview of an existing era image from local media', async () => {
      mockLocalStorage.getMediaUrl.mockResolvedValue('blob:existing');
      const data: TimelineEraDialogData = {
        ...baseData,
        era: {
          id: 'era-img',
          name: 'Illustrated Era',
          color: '#123456',
          start: { systemId: 'gregorian', units: ['100', '1', '1'] },
          end: { systemId: 'gregorian', units: ['200', '12', '31'] },
          imageUrl: 'media:img-hero',
        },
      };
      const { component } = await createComponent(data);
      await vi.waitFor(() => {
        expect(component['imagePreview']()).not.toBeNull();
      });
      expect(mockLocalStorage.getMediaUrl).toHaveBeenCalledWith(
        'alice/my-novel',
        'img-hero'
      );
    });

    it('opens the media selector and stores the picked image as media: URL', async () => {
      mockDialogGateway.openMediaSelectorDialog.mockResolvedValue({
        selected: { mediaId: 'img-new', mimeType: 'image/png', size: 1 },
        blob: new Blob(['x'], { type: 'image/png' }),
      });
      const { component } = await createComponent();
      await (
        component as unknown as { onChooseImage: () => Promise<void> }
      ).onChooseImage();
      expect(mockDialogGateway.openMediaSelectorDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'alice',
          slug: 'my-novel',
          filterType: 'image',
        })
      );
      expect(component.model().imageUrl).toBe('media:img-new');
      expect(component['imagePreview']()).not.toBeNull();
    });

    it('does nothing when the media selector is dismissed', async () => {
      mockDialogGateway.openMediaSelectorDialog.mockResolvedValue(undefined);
      const { component } = await createComponent();
      await (
        component as unknown as { onChooseImage: () => Promise<void> }
      ).onChooseImage();
      expect(component.model().imageUrl).toBe('');
      expect(component['imagePreview']()).toBeNull();
    });

    it('does not open the media selector without project context', async () => {
      const data: TimelineEraDialogData = {
        era: null,
        system: GREGORIAN_SYSTEM,
        defaultStart: { systemId: 'gregorian', units: ['2000', '1', '1'] },
        defaultEnd: { systemId: 'gregorian', units: ['2000', '12', '30'] },
      };
      const { component } = await createComponent(data);
      await (
        component as unknown as { onChooseImage: () => Promise<void> }
      ).onChooseImage();
      expect(mockDialogGateway.openMediaSelectorDialog).not.toHaveBeenCalled();
    });

    it('removes a selected image', async () => {
      mockDialogGateway.openMediaSelectorDialog.mockResolvedValue({
        selected: { mediaId: 'img-new', mimeType: 'image/png', size: 1 },
        blob: new Blob(['x'], { type: 'image/png' }),
      });
      const { component } = await createComponent();
      const c = component as unknown as {
        onChooseImage: () => Promise<void>;
        onRemoveImage: () => void;
      };
      await c.onChooseImage();
      expect(component.model().imageUrl).toBe('media:img-new');
      c.onRemoveImage();
      expect(component.model().imageUrl).toBe('');
      expect(component['imagePreview']()).toBeNull();
    });

    it('includes imageUrl in the saved era', async () => {
      const { component, closeSpy } = await createComponent();
      component.form.name().value.set('New Era');
      component.form.color().value.set('#aabbcc');
      component.model.update(m => ({
        ...m,
        startUnits: ['2000', '1', '1'],
        endUnits: ['2010', '12', '30'],
        imageUrl: 'media:img-hero',
      }));
      (component as unknown as { onSave: () => void }).onSave();
      expect(closeSpy).toHaveBeenCalledWith({
        kind: 'save',
        era: expect.objectContaining({ imageUrl: 'media:img-hero' }),
      });
    });

    it('omits imageUrl from the saved era when empty', async () => {
      const { component, closeSpy } = await createComponent();
      component.form.name().value.set('New Era');
      component.form.color().value.set('#aabbcc');
      component.model.update(m => ({
        ...m,
        startUnits: ['2000', '1', '1'],
        endUnits: ['2010', '12', '30'],
      }));
      (component as unknown as { onSave: () => void }).onSave();
      const result = closeSpy.mock.calls[0]?.[0] as {
        era: { imageUrl?: string };
      };
      expect(result.era.imageUrl).toBeUndefined();
    });
  });
});
