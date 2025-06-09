import { createPipeFactory } from '@ngneat/spectator/vitest';

import { FileSizePipe } from './file-size.pipe';

describe('FileSizePipe', () => {
  // Create a direct instance for more efficient testing of transform method
  let pipe: FileSizePipe;

  // Setup for the template-based testing using Spectator
  const createPipe = createPipeFactory({
    pipe: FileSizePipe,
  });

  beforeEach(() => {
    pipe = new FileSizePipe();
  });

  it('should create', () => {
    const spectator = createPipe(`{{ 0 | fileSize }}`);
    expect(spectator.element).toBeTruthy();
  });

  it('should handle zero bytes', () => {
    expect(pipe.transform(0)).toBe('0 Bytes');
  });

  it('should format bytes correctly', () => {
    expect(pipe.transform(1024)).toBe('1 KB');
    expect(pipe.transform(1234)).toBe('1.21 KB');
    expect(pipe.transform(1048576)).toBe('1 MB');
    expect(pipe.transform(1073741824)).toBe('1 GB');
    expect(pipe.transform(1099511627776)).toBe('1 TB');
  });

  it('should handle decimal places correctly', () => {
    expect(pipe.transform(1500)).toBe('1.46 KB');
    expect(pipe.transform(1500000)).toBe('1.43 MB');
  });

  // Additional test using Spectator's template-based testing
  it('should format values in template correctly', () => {
    const spectator = createPipe(`{{ value | fileSize }}`, {
      hostProps: { value: 1024 },
    });
    expect(spectator.element).toHaveText('1 KB');
  });
});
