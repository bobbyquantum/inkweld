import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { MockedObject, vi } from 'vitest';

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
      imports: [IdentityPanelComponent, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WorldbuildingService, useValue: worldbuildingService },
        { provide: LocalStorageService, useValue: localStorageService },
        { provide: DialogGatewayService, useValue: dialogGatewayService },
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

  it('should display the element name', () => {
    fixture.detectChanges();
    const nameElement = fixture.nativeElement.querySelector('.element-name');
    expect(nameElement?.textContent).toContain('Test Element');
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

  it('should emit renameRequested when rename button is clicked', () => {
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
    it('should open image viewer dialog when image URL is available', () => {
      fixture.detectChanges();
      // Set a resolved image URL
      component.resolvedImageUrl.set('http://example.com/image.png');

      component.viewImage();

      expect(dialogGatewayService.openImageViewerDialog).toHaveBeenCalledWith({
        imageUrl: 'http://example.com/image.png',
        fileName: 'Test Element',
      });
    });

    it('should not open dialog when no image URL is available', () => {
      fixture.detectChanges();
      component.resolvedImageUrl.set(null);

      component.viewImage();

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
});
