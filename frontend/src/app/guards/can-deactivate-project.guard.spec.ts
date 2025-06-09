import { createServiceFactory, SpectatorService } from '@ngneat/spectator/vitest';

import { ProjectComponent } from '../pages/project/project.component';
import { CanDeactivateProjectGuard } from './can-deactivate-project.guard';

describe('CanDeactivateProjectGuard', () => {
  let spectator: SpectatorService<CanDeactivateProjectGuard>;
  let guard: CanDeactivateProjectGuard;
  let mockProjectComponent: vi.Mocked<ProjectComponent>;

  const createService = createServiceFactory({
    service: CanDeactivateProjectGuard,
  });

  beforeEach(() => {
    mockProjectComponent = {
      canDeactivate: vi.fn(),
    } as unknown as vi.Mocked<ProjectComponent>;

    spectator = createService();
    guard = spectator.service;
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
