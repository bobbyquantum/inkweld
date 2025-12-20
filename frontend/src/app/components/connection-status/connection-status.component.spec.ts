import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { vi } from 'vitest';

import { DocumentSyncState } from '../../models/document-sync-state';
import { MediaSyncState } from '../../services/offline/media-sync.service';
import { ConnectionStatusComponent } from './connection-status.component';

describe('ConnectionStatusComponent', () => {
  let component: ConnectionStatusComponent;
  let fixture: ComponentFixture<ConnectionStatusComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConnectionStatusComponent, NoopAnimationsModule],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(ConnectionStatusComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('syncState', DocumentSyncState.Synced);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('sync state display', () => {
    it('should display synced state correctly', async () => {
      fixture.componentRef.setInput('syncState', DocumentSyncState.Synced);
      await fixture.whenStable();

      const statusText = fixture.nativeElement.querySelector('.status-text');
      expect(statusText?.textContent?.trim()).toBe('Connected');

      const icon = fixture.nativeElement.querySelector('.status-icon');
      expect(icon?.textContent?.trim()).toBe('cloud_done');
    });

    it('should display syncing state with spinner', async () => {
      fixture.componentRef.setInput('syncState', DocumentSyncState.Syncing);
      await fixture.whenStable();

      const statusText = fixture.nativeElement.querySelector('.status-text');
      expect(statusText?.textContent?.trim()).toBe('Connecting...');

      const spinner = fixture.nativeElement.querySelector('mat-spinner');
      expect(spinner).toBeTruthy();
    });

    it('should display offline state correctly', async () => {
      fixture.componentRef.setInput('syncState', DocumentSyncState.Offline);
      await fixture.whenStable();

      const statusText = fixture.nativeElement.querySelector('.status-text');
      expect(statusText?.textContent?.trim()).toBe('Offline Mode');

      const icon = fixture.nativeElement.querySelector('.status-icon');
      expect(icon?.textContent?.trim()).toBe('cloud_off');
    });

    it('should display unavailable state correctly', async () => {
      fixture.componentRef.setInput('syncState', DocumentSyncState.Unavailable);
      await fixture.whenStable();

      const statusText = fixture.nativeElement.querySelector('.status-text');
      expect(statusText?.textContent?.trim()).toBe('Connection Failed');

      const icon = fixture.nativeElement.querySelector('.status-icon');
      expect(icon?.textContent?.trim()).toBe('error_outline');
    });

    it('should show retry button when offline', async () => {
      fixture.componentRef.setInput('syncState', DocumentSyncState.Offline);
      await fixture.whenStable();

      const retryButton = fixture.nativeElement.querySelector(
        '[data-testid="retry-sync-button"]'
      );
      expect(retryButton).toBeTruthy();
    });

    it('should show retry button when unavailable', async () => {
      fixture.componentRef.setInput('syncState', DocumentSyncState.Unavailable);
      await fixture.whenStable();

      const retryButton = fixture.nativeElement.querySelector(
        '[data-testid="retry-sync-button"]'
      );
      expect(retryButton).toBeTruthy();
    });

    it('should not show retry button when synced', async () => {
      fixture.componentRef.setInput('syncState', DocumentSyncState.Synced);
      await fixture.whenStable();

      const retryButton = fixture.nativeElement.querySelector(
        '[data-testid="retry-sync-button"]'
      );
      expect(retryButton).toBeFalsy();
    });

    it('should emit syncRequested when retry button clicked', async () => {
      fixture.componentRef.setInput('syncState', DocumentSyncState.Offline);
      await fixture.whenStable();

      const emitSpy = vi.spyOn(component.syncRequested, 'emit');
      const retryButton = fixture.nativeElement.querySelector(
        '[data-testid="retry-sync-button"]'
      );
      retryButton?.click();

      expect(emitSpy).toHaveBeenCalled();
    });
  });

  describe('media sync status', () => {
    it('should not show media status by default', async () => {
      await fixture.whenStable();

      const mediaStatus = fixture.nativeElement.querySelector(
        '[data-testid="media-sync-status"]'
      );
      expect(mediaStatus).toBeFalsy();
    });

    it('should show media status when enabled with state', async () => {
      const mediaState: MediaSyncState = {
        isSyncing: false,
        lastChecked: new Date().toISOString(),
        needsDownload: 0,
        needsUpload: 0,
        items: [],
        downloadProgress: 0,
      };

      fixture.componentRef.setInput('showMediaStatus', true);
      fixture.componentRef.setInput('mediaSyncState', mediaState);
      await fixture.whenStable();

      const mediaStatus = fixture.nativeElement.querySelector(
        '[data-testid="media-sync-status"]'
      );
      expect(mediaStatus).toBeTruthy();
    });

    it('should show syncing spinner when media is syncing', async () => {
      const mediaState: MediaSyncState = {
        isSyncing: true,
        lastChecked: null,
        needsDownload: 5,
        needsUpload: 0,
        items: [],
        downloadProgress: 50,
      };

      fixture.componentRef.setInput('showMediaStatus', true);
      fixture.componentRef.setInput('mediaSyncState', mediaState);
      await fixture.whenStable();

      const mediaRow = fixture.nativeElement.querySelector('.media-row');
      const spinner = mediaRow?.querySelector('mat-spinner');
      expect(spinner).toBeTruthy();
    });

    it('should show pending count when media needs sync', async () => {
      const mediaState: MediaSyncState = {
        isSyncing: false,
        lastChecked: new Date().toISOString(),
        needsDownload: 3,
        needsUpload: 2,
        items: [],
        downloadProgress: 0,
      };

      fixture.componentRef.setInput('showMediaStatus', true);
      fixture.componentRef.setInput('mediaSyncState', mediaState);
      await fixture.whenStable();

      const mediaText = fixture.nativeElement.querySelector('.media-text');
      expect(mediaText?.textContent?.trim()).toBe('5 media pending');
    });

    it('should show synced status when media is fully synced', async () => {
      const mediaState: MediaSyncState = {
        isSyncing: false,
        lastChecked: new Date().toISOString(),
        needsDownload: 0,
        needsUpload: 0,
        items: [],
        downloadProgress: 0,
      };

      fixture.componentRef.setInput('showMediaStatus', true);
      fixture.componentRef.setInput('mediaSyncState', mediaState);
      await fixture.whenStable();

      const mediaText = fixture.nativeElement.querySelector('.media-text');
      expect(mediaText?.textContent?.trim()).toBe('Media synced');
    });
  });
});
