import { TestBed } from '@angular/core/testing';

import { ProjectComponent } from '../pages/project/project.component';
import { CanDeactivateProjectGuard } from './can-deactivate-project.guard';

describe('CanDeactivateProjectGuard', () => {
  let guard: CanDeactivateProjectGuard;
  let mockProjectComponent: jest.Mocked<ProjectComponent>;

  beforeEach(() => {
    mockProjectComponent = {
      canDeactivate: jest.fn(),
    } as unknown as jest.Mocked<ProjectComponent>;

    TestBed.configureTestingModule({
      providers: [CanDeactivateProjectGuard],
    });
    guard = TestBed.inject(CanDeactivateProjectGuard);
  });

  it('should be created', () => {
    expect(guard).toBeTruthy();
  });

  it('should call canDeactivate on the component', async () => {
    mockProjectComponent.canDeactivate.mockResolvedValue(true);
    const result = await guard.canDeactivate(mockProjectComponent);
    expect(mockProjectComponent.canDeactivate).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('should return false when component canDeactivate returns false', async () => {
    mockProjectComponent.canDeactivate.mockResolvedValue(false);
    const result = await guard.canDeactivate(mockProjectComponent);
    expect(result).toBe(false);
  });
});
