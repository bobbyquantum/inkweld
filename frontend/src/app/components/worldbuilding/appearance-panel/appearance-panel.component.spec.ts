import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ElementAppearance } from '@models/element-appearance';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { type MockedObject, vi } from 'vitest';

import { translocoTestProvider } from '../../../../testing/transloco-test-provider';
import { AppearancePanelComponent } from './appearance-panel.component';

describe('AppearancePanelComponent', () => {
  let component: AppearancePanelComponent;
  let fixture: ComponentFixture<AppearancePanelComponent>;
  let worldbuildingService: MockedObject<WorldbuildingService>;
  let dialogGateway: MockedObject<DialogGatewayService>;

  beforeEach(async () => {
    worldbuildingService = {
      getIdentityData: vi.fn().mockResolvedValue({}),
      saveIdentityData: vi.fn().mockResolvedValue(undefined),
      observeIdentityChanges: vi.fn().mockResolvedValue(() => {}),
    } as unknown as MockedObject<WorldbuildingService>;

    dialogGateway = {
      openMediaSelectorDialog: vi.fn().mockResolvedValue(undefined),
    } as unknown as MockedObject<DialogGatewayService>;

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), AppearancePanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: WorldbuildingService, useValue: worldbuildingService },
        { provide: DialogGatewayService, useValue: dialogGateway },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppearancePanelComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('elementId', 'el-1');
    fixture.componentRef.setInput('username', 'user');
    fixture.componentRef.setInput('slug', 'project');
    fixture.componentRef.setInput('canWrite', true);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load appearance from identity data', async () => {
    const appearance: ElementAppearance = {
      menu: { type: 'color', mode: 'auto', value: '#123456' },
    };
    worldbuildingService.getIdentityData.mockResolvedValue({
      appearance,
    });

    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.appearance()).toEqual(appearance);
  });

  it('should apply an edit and persist it on debounced save', async () => {
    vi.useFakeTimers();
    fixture.detectChanges();
    component['onAppearanceEdited']({
      menu: { type: 'color', mode: 'auto', value: '#abcdef' },
    });

    expect(component.appearance().menu?.value).toBe('#abcdef');
    await vi.advanceTimersByTimeAsync(500);
    expect(worldbuildingService.saveIdentityData).toHaveBeenCalledWith(
      'el-1',
      {
        appearance: {
          menu: { type: 'color', mode: 'auto', value: '#abcdef' },
        },
      },
      'user',
      'project'
    );
    vi.useRealTimers();
  });

  it('should emit the appearance live for preview', () => {
    fixture.detectChanges();
    const emit = vi.fn();
    component.appearanceChange.subscribe(emit);
    component['onAppearanceEdited']({
      menu: { type: 'color', mode: 'auto', value: '#123456' },
    });
    fixture.detectChanges();
    expect(emit).toHaveBeenCalledWith({
      menu: { type: 'color', mode: 'auto', value: '#123456' },
    });
  });

  it('should open the media selector and set a picked background image', async () => {
    fixture.detectChanges();
    dialogGateway.openMediaSelectorDialog.mockResolvedValue({
      selected: {
        mediaId: 'bg',
        mimeType: 'image/png',
        size: 1024,
        createdAt: new Date().toISOString(),
        filename: 'bg.png',
      },
      blob: new Blob(),
    });
    const emit = vi.fn();
    component.appearanceChange.subscribe(emit);

    await component['onImagePicker']('menu', 'value');
    fixture.detectChanges();

    expect(dialogGateway.openMediaSelectorDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'user',
        slug: 'project',
        filterType: 'image',
      })
    );
    expect(component.appearance()).toEqual({
      menu: { type: 'image', mode: 'auto', value: 'media://bg.png' },
    });
    expect(emit).toHaveBeenCalledWith({
      menu: { type: 'image', mode: 'auto', value: 'media://bg.png' },
    });
  });

  it('should not change appearance when the media picker is dismissed', async () => {
    fixture.detectChanges();
    dialogGateway.openMediaSelectorDialog.mockResolvedValue(undefined);
    await component['onImagePicker']('content', 'value');
    expect(component.appearance()).toEqual({});
  });

  it('should fold deletion markers into the persisted payload', async () => {
    vi.useFakeTimers();
    fixture.detectChanges();
    component['onAppearanceEdited']({
      menu: { type: 'color', mode: 'auto', value: '#123456' },
    });
    component['onDeletes']({ menu: true });

    await vi.advanceTimersByTimeAsync(500);

    const calls = worldbuildingService.saveIdentityData.mock.calls;
    const lastCall = calls[calls.length - 1];
    const payload = lastCall[1] as { appearance: Record<string, unknown> };
    expect(payload.appearance['menu']).toBe(
      '\u0000__appearance_delete__\u0000'
    );
    vi.useRealTimers();
  });

  it('should write a queued save to the element it was created for', async () => {
    vi.useFakeTimers();
    fixture.detectChanges();
    // Edit element 1, then switch to element 2 before the debounce fires.
    component['onAppearanceEdited']({
      content: { type: 'color', mode: 'auto', value: '#abcdef' },
    });
    fixture.componentRef.setInput('elementId', 'el-2');
    fixture.detectChanges();

    await vi.advanceTimersByTimeAsync(500);

    // The queued save must target el-1 (where the edit was made), not el-2.
    expect(worldbuildingService.saveIdentityData).toHaveBeenCalledWith(
      'el-1',
      expect.objectContaining({
        appearance: {
          content: { type: 'color', mode: 'auto', value: '#abcdef' },
        },
      }),
      'user',
      'project'
    );
    vi.useRealTimers();
  });

  it('should retain deletion markers when persistence fails', async () => {
    vi.useFakeTimers();
    worldbuildingService.saveIdentityData.mockRejectedValueOnce(
      new Error('boom')
    );
    fixture.detectChanges();

    component['onAppearanceEdited']({
      menu: { type: 'color', mode: 'auto', value: '#123456' },
    });
    component['onDeletes']({ menu: true });
    await vi.advanceTimersByTimeAsync(500);

    // First save failed; a subsequent save must still send APPEARANCE_DELETE.
    component['onAppearanceEdited']({
      content: { type: 'color', mode: 'auto', value: '#123456' },
    });
    await vi.advanceTimersByTimeAsync(500);

    const calls = worldbuildingService.saveIdentityData.mock.calls;
    const lastCall = calls[calls.length - 1];
    const payload = lastCall[1] as { appearance: Record<string, unknown> };
    expect(payload.appearance['menu']).toBe(
      '\u0000__appearance_delete__\u0000'
    );
    vi.useRealTimers();
  });

  describe('observe', () => {
    it('should apply remote appearance when it arrives', async () => {
      const remoteAppearance: ElementAppearance = {
        content: { type: 'color', mode: 'auto', value: '#00ff00' },
      };
      let observer!: (data: { appearance?: ElementAppearance }) => void;
      worldbuildingService.observeIdentityChanges.mockImplementation(
        (_id, cb) => {
          observer = cb;
          return Promise.resolve(() => {});
        }
      );

      fixture.detectChanges();
      await fixture.whenStable();

      observer({ appearance: remoteAppearance });
      expect(component.appearance()).toEqual(remoteAppearance);
    });

    it('should ignore remote updates while the user has local edits', async () => {
      let observer!: (data: { appearance?: ElementAppearance }) => void;
      worldbuildingService.observeIdentityChanges.mockImplementation(
        (_id, cb) => {
          observer = cb;
          return Promise.resolve(() => {});
        }
      );

      fixture.detectChanges();
      await fixture.whenStable();

      component['onAppearanceEdited']({
        menu: { type: 'color', mode: 'auto', value: '#123456' },
      });
      observer({
        appearance: { menu: { type: 'image', mode: 'auto', value: 'x' } },
      });
      // Local edit is preserved.
      expect(component.appearance().menu?.type).toBe('color');
    });

    it('should re-allow remote updates after the debounced save persists', async () => {
      vi.useFakeTimers();
      let observer!: (data: { appearance?: ElementAppearance }) => void;
      worldbuildingService.observeIdentityChanges.mockImplementation(
        (_id, cb) => {
          observer = cb;
          return Promise.resolve(() => {});
        }
      );

      fixture.detectChanges();
      await fixture.whenStable();

      component['onAppearanceEdited']({
        menu: { type: 'color', mode: 'auto', value: '#123456' },
      });
      // Flush the debounced save (400ms) so hasLocalEdit is reset.
      await vi.advanceTimersByTimeAsync(500);
      // Remote updates should now be applied again.
      const remoteAppearance: ElementAppearance = {
        content: { type: 'color', mode: 'auto', value: '#00ff00' },
      };
      observer({ appearance: remoteAppearance });
      expect(component.appearance()).toEqual(remoteAppearance);
      vi.useRealTimers();
    });

    it('should scope local-edit state to the active element', async () => {
      let observer!: (data: { appearance?: ElementAppearance }) => void;
      worldbuildingService.observeIdentityChanges.mockImplementation(
        (_id, cb) => {
          observer = cb;
          return Promise.resolve(() => {});
        }
      );

      fixture.detectChanges();
      await fixture.whenStable();

      // Edit element 1.
      component['onAppearanceEdited']({
        menu: { type: 'color', mode: 'auto', value: '#123456' },
      });

      // Switch to a different element.
      fixture.componentRef.setInput('elementId', 'el-2');
      fixture.detectChanges();
      await fixture.whenStable();

      // Remote updates for the new element are no longer blocked.
      const remoteAppearance: ElementAppearance = {
        content: { type: 'color', mode: 'auto', value: '#00ff00' },
      };
      observer({ appearance: remoteAppearance });
      expect(component.appearance()).toEqual(remoteAppearance);
    });

    it('should unsubscribe the identity observer on destroy', async () => {
      const unsubscribe = vi.fn();
      worldbuildingService.observeIdentityChanges.mockResolvedValue(
        unsubscribe
      );

      fixture.detectChanges();
      await fixture.whenStable();

      fixture.destroy();

      expect(unsubscribe).toHaveBeenCalled();
    });
  });
});
