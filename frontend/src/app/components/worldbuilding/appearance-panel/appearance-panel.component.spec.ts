import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ElementAppearance } from '@models/element-appearance';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { type MockedObject, vi } from 'vitest';

import { translocoTestProvider } from '../../../../testing/transloco-test-provider';
import { AppearancePanelComponent } from './appearance-panel.component';

describe('AppearancePanelComponent', () => {
  let component: AppearancePanelComponent;
  let fixture: ComponentFixture<AppearancePanelComponent>;
  let worldbuildingService: MockedObject<WorldbuildingService>;
  let dialogGateway: MockedObject<DialogGatewayService>;
  let localStorage: MockedObject<LocalStorageService>;

  beforeEach(async () => {
    worldbuildingService = {
      getIdentityData: vi.fn().mockResolvedValue({}),
      saveIdentityData: vi.fn().mockResolvedValue(undefined),
      observeIdentityChanges: vi.fn().mockResolvedValue(() => {}),
    } as unknown as MockedObject<WorldbuildingService>;

    dialogGateway = {
      openMediaSelectorDialog: vi.fn().mockResolvedValue(null),
    } as unknown as MockedObject<DialogGatewayService>;

    localStorage = {
      saveMedia: vi.fn().mockResolvedValue(undefined),
    } as unknown as MockedObject<LocalStorageService>;

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), AppearancePanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: WorldbuildingService, useValue: worldbuildingService },
        { provide: DialogGatewayService, useValue: dialogGateway },
        { provide: LocalStorageService, useValue: localStorage },
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

  it('should default to color/auto when no stored setting', () => {
    const setting = component.getSetting('menu');
    expect(setting).toEqual({ type: 'color', mode: 'auto' });
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

  it('should update setting and persist on setType', async () => {
    vi.useFakeTimers();
    fixture.detectChanges();
    component.setType('menu', 'gradient');

    expect(component.getSetting('menu').type).toBe('gradient');
    await vi.advanceTimersByTimeAsync(500);
    expect(worldbuildingService.saveIdentityData).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should set manual light/dark values', () => {
    fixture.detectChanges();
    component.setMode('menu', 'manual');
    component.setValue('menu', 'light', '#ffffff');
    component.setValue('menu', 'dark', '#000000');

    expect(component.getSetting('menu').mode).toBe('manual');
    expect(component.getSetting('menu').light).toBe('#ffffff');
    expect(component.getSetting('menu').dark).toBe('#000000');
  });

  it('should set the auto intensity', () => {
    fixture.detectChanges();
    component.setIntensity('menu', 60);
    expect(component.getSetting('menu').intensity).toBe(60);
  });

  it('should remove a region when disabled', async () => {
    vi.useFakeTimers();
    fixture.detectChanges();
    component.setEnabled('menu', true);
    expect(component.appearance().menu).toBeDefined();

    component.setEnabled('menu', false);
    expect(component.appearance().menu).toBeUndefined();
    await vi.advanceTimersByTimeAsync(500);
    expect(worldbuildingService.saveIdentityData).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should report isEnabled only for configured regions', () => {
    fixture.detectChanges();
    expect(component.isEnabled('menu')).toBe(false);
    expect(component.isEnabled('content')).toBe(false);

    component.setEnabled('menu', true);
    expect(component.isEnabled('menu')).toBe(true);
    expect(component.isEnabled('content')).toBe(false);

    component.setEnabled('menu', false);
    expect(component.isEnabled('menu')).toBe(false);
  });

  it('should persist the trimmed appearance on debounced save', async () => {
    vi.useFakeTimers();
    fixture.detectChanges();
    component.setValue('content', 'value', '#abcdef');

    await vi.advanceTimersByTimeAsync(500);

    expect(worldbuildingService.saveIdentityData).toHaveBeenCalledWith(
      'el-1',
      {
        appearance: {
          content: { type: 'color', mode: 'auto', value: '#abcdef' },
        },
      },
      'user',
      'project'
    );
    vi.useRealTimers();
  });

  it('should write a queued save to the element it was created for', async () => {
    vi.useFakeTimers();
    fixture.detectChanges();
    // Edit element 1, then switch to element 2 before the debounce fires.
    component.setValue('content', 'value', '#abcdef');
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

    // Disable the menu region (records a deletion marker).
    component.setEnabled('menu', true);
    component.setEnabled('menu', false);
    await vi.advanceTimersByTimeAsync(500);

    // First save failed; a subsequent save must still send APPEARANCE_DELETE.
    component.setValue('content', 'value', '#123456');
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

      component.setType('menu', 'gradient');
      observer({
        appearance: { menu: { type: 'image', mode: 'auto', value: 'x' } },
      });
      // Local edit is preserved.
      expect(component.getSetting('menu').type).toBe('gradient');
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

      component.setType('menu', 'gradient');
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
      component.setType('menu', 'gradient');

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

  describe('image picking', () => {
    it('should set a media reference and cache the blob when an image is picked', async () => {
      const blob = new Blob(['x'], { type: 'image/png' });
      dialogGateway.openMediaSelectorDialog.mockResolvedValue({
        selected: { filename: 'bg.png' },
        blob,
      } as never);

      await component.pickImage('menu', 'value');

      expect(component.getSetting('menu').value).toBe('media://bg.png');
      expect(localStorage.saveMedia).toHaveBeenCalledWith(
        'user/project',
        'bg',
        blob,
        'media://bg.png'
      );
    });

    it('should not change the setting when the dialog is cancelled', async () => {
      dialogGateway.openMediaSelectorDialog.mockResolvedValue(null as never);
      await component.pickImage('menu', 'value');
      expect(component.getSetting('menu').value).toBeUndefined();
    });
  });

  describe('getRegionLabel', () => {
    it('should return menu/content labels', () => {
      expect(component.getRegionLabel('menu')).toBe('menu');
      expect(component.getRegionLabel('content')).toBe('content');
    });
  });
});
