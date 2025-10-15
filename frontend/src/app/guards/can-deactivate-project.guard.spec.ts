import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockedObject } from 'vitest';
import { ProjectComponent } from '../pages/project/project.component';
import { CanDeactivateProjectGuard } from './can-deactivate-project.guard';

describe('CanDeactivateProjectGuard', () => {
  let guard: CanDeactivateProjectGuard;
  let mockProjectComponent: MockedObject<ProjectComponent>;

  beforeEach(() => {
    mockProjectComponent = {
      canDeactivate: vi.fn(),
    } as unknown as MockedObject<ProjectComponent>;

    guard = new CanDeactivateProjectGuard();
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
