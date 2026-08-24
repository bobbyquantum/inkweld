import { provideHttpClient, withXhr } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { TagService } from '@services/tag/tag.service';
import type { WorldbuildingIdentity } from '@services/worldbuilding/worldbuilding.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { type MockedObject, vi } from 'vitest';

import { translocoTestProvider } from '../../../../testing/transloco-test-provider';
import { IdentityPanelComponent } from './identity-panel.component';

describe('IdentityPanelComponent', () => {
  let component: IdentityPanelComponent;
  let fixture: ComponentFixture<IdentityPanelComponent>;
  let worldbuildingService: MockedObject<WorldbuildingService>;
  let localStorageService: MockedObject<LocalStorageService>;
  let dialogGatewayService: MockedObject<DialogGatewayService>;
  let _httpTestingController: HttpTestingController;

  beforeEach(async () => {
    worldbuildingService = {
      getIdentityData: vi.fn().mockResolvedValue({}),
      saveIdentityData: vi.fn().mockResolvedValue(undefined),
      observeIdentityChanges: vi.fn().mockResolvedValue(() => {}),
      getWorldbuildingData: vi.fn().mockResolvedValue(null),
    } as unknown as MockedObject<WorldbuildingService>;

    localStorageService = {
      getMediaUrl: vi.fn().mockResolvedValue(null),
      saveMedia: vi.fn().mockResolvedValue(undefined),
      revokeUrl: vi.fn(),
      deleteMedia: vi.fn().mockResolvedValue(undefined),
    } as unknown as MockedObject<LocalStorageService>;

    dialogGatewayService = {
      openImageViewerDialog: vi.fn(),
      openWorldbuildingImageDialog: vi.fn().mockResolvedValue(null),
    } as unknown as MockedObject<DialogGatewayService>;

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), IdentityPanelComponent],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: WorldbuildingService, useValue: worldbuildingService },
        { provide: LocalStorageService, useValue: localStorageService },
        { provide: DialogGatewayService, useValue: dialogGatewayService },
        {
          provide: TagService,
          useValue: {
            getResolvedTagsForElement: vi.fn().mockReturnValue([]),
            getAvailableTagsForElement: vi.fn().mockReturnValue([]),
            addTag: vi.fn().mockReturnValue(null),
            removeTag: vi.fn().mockReturnValue(false),
            createCustomTag: vi.fn().mockReturnValue(null),
            allTags: signal([]),
          },
        },
      ],
    }).compileComponents();

    _httpTestingController = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(IdentityPanelComponent);
    component = fixture.componentInstance;

    // Set required inputs
    fixture.componentRef.setInput('elementId', 'test-element-id');
    fixture.componentRef.setInput('elementName', 'Test Element');
    fixture.componentRef.setInput('username', 'testuser');
    fixture.componentRef.setInput('slug', 'test-project');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display the element name', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const nameElement = fixture.nativeElement.querySelector('.element-name');
    expect(nameElement?.textContent).toContain('Test Element');
  });

  it('should display the element icon next to the name', async () => {
    fixture.componentRef.setInput('elementIcon', 'person');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const icon = fixture.nativeElement.querySelector('.element-icon');
    expect(icon?.textContent).toContain('person');
  });

  it('should load identity data on init', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    expect(worldbuildingService.getIdentityData).toHaveBeenCalledWith(
      'test-element-id',
      'testuser',
      'test-project'
    );
  });

  it('should not load, sync, or save when read-only (preview mode)', async () => {
    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(worldbuildingService.getIdentityData).not.toHaveBeenCalled();
    expect(worldbuildingService.observeIdentityChanges).not.toHaveBeenCalled();
    expect(component.isIdentityLoading()).toBe(false);
  });

  it('should expose the appearance config from loaded identity data', async () => {
    worldbuildingService.getIdentityData.mockResolvedValue({
      appearance: {
        menu: { type: 'color', mode: 'auto', value: '#123456' },
      },
    });

    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.appearance()?.menu?.value).toBe('#123456');
  });

  it('should update appearance from realtime sync', async () => {
    let observer!: (data: WorldbuildingIdentity) => void;
    worldbuildingService.observeIdentityChanges.mockImplementation(
      (_id, cb) => {
        observer = cb;
        return Promise.resolve(() => {});
      }
    );

    fixture.detectChanges();
    await fixture.whenStable();

    observer({
      appearance: {
        content: { type: 'gradient', mode: 'manual', light: 'a', dark: 'b' },
      },
    });

    expect(component.appearance()?.content?.mode).toBe('manual');
  });

  it('should not let a late initial snapshot overwrite a newer realtime update', async () => {
    let observer!: (data: WorldbuildingIdentity) => void;
    worldbuildingService.observeIdentityChanges.mockImplementation(
      (_id, cb) => {
        observer = cb;
        return Promise.resolve(() => {});
      }
    );

    // Keep the initial getIdentityData pending.
    let resolveSnapshot!: (v: WorldbuildingIdentity) => void;
    worldbuildingService.getIdentityData.mockImplementation(
      () => new Promise<WorldbuildingIdentity>(res => (resolveSnapshot = res))
    );

    fixture.detectChanges();
    await fixture.whenStable();

    // A realtime update arrives before the initial snapshot resolves.
    observer({
      appearance: {
        content: { type: 'gradient', mode: 'manual', light: 'a', dark: 'b' },
      },
    });
    expect(component.appearance()?.content?.mode).toBe('manual');

    // The stale initial snapshot resolves afterwards and must not clobber it.
    resolveSnapshot({
      appearance: { menu: { type: 'color', mode: 'auto', value: '#000' } },
    });
    await Promise.resolve();

    expect(component.appearance()?.content?.mode).toBe('manual');
    expect(component.appearance()?.menu).toBeUndefined();
  });

  it('should emit renameRequested when rename button is clicked', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const renameSpy = vi.fn();
    component.renameRequested.subscribe(renameSpy);

    const renameButton = fixture.nativeElement.querySelector('.rename-button');
    renameButton?.click();

    expect(renameSpy).toHaveBeenCalled();
  });

  it('should toggle expanded state', () => {
    fixture.detectChanges();
    expect(component.isExpanded()).toBe(true);

    component.toggleExpanded();
    expect(component.isExpanded()).toBe(false);

    component.toggleExpanded();
    expect(component.isExpanded()).toBe(true);
  });

  it('should debounce description changes before saving', async () => {
    vi.useFakeTimers();
    fixture.detectChanges();

    component.onDescriptionChange('New description');
    expect(worldbuildingService.saveIdentityData).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600);

    expect(worldbuildingService.saveIdentityData).toHaveBeenCalledWith(
      'test-element-id',
      { description: 'New description' },
      'testuser',
      'test-project'
    );

    vi.useRealTimers();
  });

  describe('viewImage', () => {
    it('should open image viewer dialog when image URL is available', async () => {
      fixture.detectChanges();
      // Set a resolved image URL
      component.resolvedImageUrl.set('http://example.com/image.png');

      await component.viewImage();

      expect(dialogGatewayService.openImageViewerDialog).toHaveBeenCalledWith({
        imageUrl: 'http://example.com/image.png',
        fileName: 'Test Element',
        canEdit: true,
      });
    });

    it('should not open dialog when no image URL is available', async () => {
      fixture.detectChanges();
      component.resolvedImageUrl.set(null);

      await component.viewImage();

      expect(dialogGatewayService.openImageViewerDialog).not.toHaveBeenCalled();
    });
  });

  describe('onImageClick', () => {
    it('should open worldbuilding image dialog when username and slug are set', async () => {
      fixture.detectChanges();

      await component.onImageClick();

      expect(
        dialogGatewayService.openWorldbuildingImageDialog
      ).toHaveBeenCalledWith({
        elementName: 'Test Element',
        username: 'testuser',
        slug: 'test-project',
        currentImage: undefined,
        description: '',
        worldbuildingFields: undefined,
        elementId: 'test-element-id',
      });
    });

    it('should update identity when dialog returns image data', async () => {
      fixture.componentRef.setInput('username', 'testuser');
      fixture.componentRef.setInput('slug', 'testproject');
      fixture.detectChanges();

      dialogGatewayService.openWorldbuildingImageDialog.mockResolvedValue({
        imageData: 'data:image/png;base64,abc123',
      });

      await component.onImageClick();

      expect(worldbuildingService.saveIdentityData).toHaveBeenCalledWith(
        'test-element-id',
        { image: 'data:image/png;base64,abc123' },
        'testuser',
        'testproject'
      );
    });

    it('should remove image when dialog returns removed flag', async () => {
      fixture.componentRef.setInput('username', 'testuser');
      fixture.componentRef.setInput('slug', 'testproject');
      fixture.detectChanges();

      dialogGatewayService.openWorldbuildingImageDialog.mockResolvedValue({
        removed: true,
      });

      await component.onImageClick();

      expect(worldbuildingService.saveIdentityData).toHaveBeenCalledWith(
        'test-element-id',
        { image: undefined },
        'testuser',
        'testproject'
      );
    });
  });

  describe('resolveImageUrl URL scheme validation', () => {
    type IdentityPanelPrivateApi = {
      resolveImageUrl: (url: string) => Promise<void>;
    };
    const resolveImageUrl = (comp: IdentityPanelComponent, url: string) =>
      (comp as unknown as IdentityPanelPrivateApi).resolveImageUrl(url);

    it.each<[string]>([
      ['https://example.com/image.png'],
      ['http://example.com/image.png'],
      ['blob:http://localhost/abc123'],
      ['data:image/png;base64,abc123'],
    ])('should allow %s URLs', async url => {
      fixture.detectChanges();
      await resolveImageUrl(component, url);
      expect(component.resolvedImageUrl()).toBe(url);
    });

    it('should reject javascript: URLs', async () => {
      fixture.detectChanges();
      component.resolvedImageUrl.set(null);
      await resolveImageUrl(component, 'javascript:alert(1)');
      expect(component.resolvedImageUrl()).toBeNull();
    });

    it('should reject data:text/html URLs', async () => {
      fixture.detectChanges();
      component.resolvedImageUrl.set(null);
      await resolveImageUrl(
        component,
        'data:text/html,<script>alert(1)</script>'
      );
      expect(component.resolvedImageUrl()).toBeNull();
    });
  });

  describe('resolveImageUrl media:// handling', () => {
    type IdentityPanelPrivateApi = {
      resolveImageUrl: (url: string) => Promise<void>;
    };
    const resolveImageUrl = (comp: IdentityPanelComponent, url: string) =>
      (comp as unknown as IdentityPanelPrivateApi).resolveImageUrl(url);

    it('should not delete media when a cached blob URL fails to fetch', async () => {
      // A cached URL exists but fetch() rejects (e.g. transient failure).
      localStorageService.getMediaUrl
        .mockResolvedValueOnce('blob:stale')
        .mockResolvedValueOnce('blob:fresh');
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

      fixture.detectChanges();
      await resolveImageUrl(component, 'media://img-elara');

      // The media must NOT be deleted from the library.
      expect(localStorageService.deleteMedia).not.toHaveBeenCalled();
      // A fresh URL is re-created from the stored blob.
      expect(component.resolvedImageUrl()).toBe('blob:fresh');
      vi.unstubAllGlobals();
    });

    it('should not delete media when a cached blob URL returns a non-image', async () => {
      localStorageService.getMediaUrl
        .mockResolvedValueOnce('blob:stale')
        .mockResolvedValueOnce('blob:fresh');
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          headers: { get: () => 'text/html' },
        })
      );

      fixture.detectChanges();
      await resolveImageUrl(component, 'media://img-elara');

      expect(localStorageService.deleteMedia).not.toHaveBeenCalled();
      expect(component.resolvedImageUrl()).toBe('blob:fresh');
      vi.unstubAllGlobals();
    });
  });
});
