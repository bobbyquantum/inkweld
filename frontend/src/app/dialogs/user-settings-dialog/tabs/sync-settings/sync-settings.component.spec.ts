import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SetupService } from '@services/setup.service';
import { MockedObject, vi } from 'vitest';

import { SyncSettingsComponent } from './sync-settings.component';

describe('SyncSettingsComponent', () => {
  let component: SyncSettingsComponent;
  let fixture: ComponentFixture<SyncSettingsComponent>;
  let setupService: MockedObject<SetupService>;

  beforeEach(async () => {
    setupService = {
      getMode: vi.fn().mockReturnValue('server'),
      getServerUrl: vi.fn().mockReturnValue('http://localhost:8333'),
    } as unknown as MockedObject<SetupService>;

    await TestBed.configureTestingModule({
      imports: [SyncSettingsComponent, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: SetupService, useValue: setupService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SyncSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display server mode', () => {
    expect(component['currentMode']).toBe('server');
  });

  it('should toggle auto sync', () => {
    const initialState = component['autoSyncEnabled']();
    component.toggleAutoSync();
    expect(component['autoSyncEnabled']()).toBe(!initialState);
  });

  it('should update sync interval', () => {
    component.updateSyncInterval(15);
    expect(component['syncInterval']()).toBe(15);
  });

  it('should format last sync time', () => {
    const result = component.getLastSyncTime();
    expect(result).toBe('Never');
  });
});
