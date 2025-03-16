import { FileSizePipe } from './file-size.pipe';

describe('FileSizePipe', () => {
  let pipe: FileSizePipe;

  beforeEach(() => {
    pipe = new FileSizePipe();
  });

  it('should create', () => {
    expect(pipe).toBeTruthy();
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
});
