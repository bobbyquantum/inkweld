import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { MockedObject, vi } from 'vitest';

import { IdentityPanelComponent } from './identity-panel.component';

describe('IdentityPanelComponent', () => {
  let component: IdentityPanelComponent;
  let fixture: ComponentFixture<IdentityPanelComponent>;
  let worldbuildingService: MockedObject<WorldbuildingService>;

  beforeEach(async () => {
    worldbuildingService = {
      getIdentityData: vi.fn().mockResolvedValue({}),
      saveIdentityData: vi.fn().mockResolvedValue(undefined),
      observeIdentityChanges: vi.fn().mockResolvedValue(() => {}),
    } as unknown as MockedObject<WorldbuildingService>;

    await TestBed.configureTestingModule({
      imports: [IdentityPanelComponent, NoopAnimationsModule],
      providers: [
        { provide: WorldbuildingService, useValue: worldbuildingService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IdentityPanelComponent);
    component = fixture.componentInstance;

    // Set required inputs
    fixture.componentRef.setInput('elementId', 'test-element-id');
    fixture.componentRef.setInput('elementName', 'Test Element');
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
      undefined,
      undefined
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
      undefined,
      undefined
    );

    vi.useRealTimers();
  });
});
