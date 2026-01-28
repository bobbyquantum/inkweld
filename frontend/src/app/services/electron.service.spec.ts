import { TestBed } from '@angular/core/testing';

import { ElectronService } from './electron.service';

describe('ElectronService', () => {
  let service: ElectronService;

  beforeEach(() => {
    // Reset window.electronAPI before each test
    delete (window as { electronAPI?: unknown }).electronAPI;

    TestBed.configureTestingModule({
      providers: [ElectronService],
    });
    service = TestBed.inject(ElectronService);
  });

  afterEach(() => {
    delete (window as { electronAPI?: unknown }).electronAPI;
  });

  describe('when not running in Electron', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should return false for isElectron', () => {
      expect(service.isElectron).toBe(false);
    });

    it('should return null for getAppVersion', async () => {
      const version = await service.getAppVersion();
      expect(version).toBeNull();
    });

    it('should return null for getPlatform', async () => {
      const platform = await service.getPlatform();
      expect(platform).toBeNull();
    });

    it('should return null for showSaveDialog', async () => {
      const result = await service.showSaveDialog({ title: 'Save' });
      expect(result).toBeNull();
    });

    it('should return null for showOpenDialog', async () => {
      const result = await service.showOpenDialog({ title: 'Open' });
      expect(result).toBeNull();
    });

    it('should return false for writeFile', async () => {
      const result = await service.writeFile('/path/to/file', 'content');
      expect(result).toBe(false);
    });

    it('should return null for readFile', async () => {
      const result = await service.readFile('/path/to/file');
      expect(result).toBeNull();
    });

    it('should do nothing for windowMinimize', async () => {
      await service.windowMinimize();
      // No error should be thrown
    });

    it('should return false for windowMaximize', async () => {
      const result = await service.windowMaximize();
      expect(result).toBe(false);
    });

    it('should do nothing for windowClose', async () => {
      await service.windowClose();
      // No error should be thrown
    });

    it('should return false for windowIsMaximized', async () => {
      const result = await service.windowIsMaximized();
      expect(result).toBe(false);
    });

    it('should return { saved: false } for saveFileWithDialog', async () => {
      const result = await service.saveFileWithDialog('content', {
        title: 'Save',
      });
      expect(result).toEqual({ saved: false });
    });
  });

  describe('when running in Electron', () => {
    const mockElectronAPI = {
      isElectron: true,
      getAppVersion: vi.fn().mockResolvedValue('1.0.0'),
      getPlatform: vi.fn().mockResolvedValue('win32'),
      showSaveDialog: vi.fn(),
      showOpenDialog: vi.fn(),
      writeFile: vi.fn(),
      readFile: vi.fn(),
      onMenuAction: vi.fn().mockReturnValue(() => {}),
      windowMinimize: vi.fn().mockResolvedValue(undefined),
      windowMaximize: vi.fn().mockResolvedValue(true),
      windowClose: vi.fn().mockResolvedValue(undefined),
      windowIsMaximized: vi.fn().mockResolvedValue(true),
    };

    beforeEach(() => {
      // Reset all mocks before each test
      vi.clearAllMocks();
      (window as { electronAPI?: unknown }).electronAPI = mockElectronAPI;
      // Recreate service to pick up the mock
      service = TestBed.inject(ElectronService);
    });

    it('should return true for isElectron', () => {
      expect(service.isElectron).toBe(true);
    });

    it('should call windowMinimize on Electron API', async () => {
      await service.windowMinimize();
      expect(mockElectronAPI.windowMinimize).toHaveBeenCalled();
    });

    it('should call windowMaximize on Electron API and return result', async () => {
      const result = await service.windowMaximize();
      expect(mockElectronAPI.windowMaximize).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should call windowClose on Electron API', async () => {
      await service.windowClose();
      expect(mockElectronAPI.windowClose).toHaveBeenCalled();
    });

    it('should call windowIsMaximized on Electron API and return result', async () => {
      const result = await service.windowIsMaximized();
      expect(mockElectronAPI.windowIsMaximized).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return version from Electron API', async () => {
      const version = await service.getAppVersion();
      expect(version).toBe('1.0.0');
      expect(mockElectronAPI.getAppVersion).toHaveBeenCalled();
    });

    it('should return platform from Electron API', async () => {
      const platform = await service.getPlatform();
      expect(platform).toBe('win32');
      expect(mockElectronAPI.getPlatform).toHaveBeenCalled();
    });

    it('should call showSaveDialog on Electron API', async () => {
      const options = { title: 'Save', defaultPath: '/test' };
      mockElectronAPI.showSaveDialog.mockResolvedValue({
        canceled: false,
        filePath: '/test/file.txt',
      });

      const result = await service.showSaveDialog(options);

      expect(mockElectronAPI.showSaveDialog).toHaveBeenCalledWith(options);
      expect(result).toEqual({ canceled: false, filePath: '/test/file.txt' });
    });

    it('should call showOpenDialog on Electron API', async () => {
      const options = {
        title: 'Open',
        properties: ['openFile'] as (
          | 'openFile'
          | 'openDirectory'
          | 'multiSelections'
        )[],
      };
      mockElectronAPI.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/test/file.txt'],
      });

      const result = await service.showOpenDialog(options);

      expect(mockElectronAPI.showOpenDialog).toHaveBeenCalledWith(options);
      expect(result).toEqual({
        canceled: false,
        filePaths: ['/test/file.txt'],
      });
    });

    it('should call writeFile on Electron API', async () => {
      mockElectronAPI.writeFile.mockResolvedValue({ success: true });

      const result = await service.writeFile('/test/file.txt', 'content');

      expect(mockElectronAPI.writeFile).toHaveBeenCalledWith(
        '/test/file.txt',
        'content'
      );
      expect(result).toBe(true);
    });

    it('should call readFile on Electron API', async () => {
      const mockData = new ArrayBuffer(8);
      mockElectronAPI.readFile.mockResolvedValue({
        success: true,
        data: mockData,
      });

      const result = await service.readFile('/test/file.txt');

      expect(mockElectronAPI.readFile).toHaveBeenCalledWith('/test/file.txt');
      expect(result).toBe(mockData);
    });

    it('should return null for readFile on failure', async () => {
      mockElectronAPI.readFile.mockResolvedValue({
        success: false,
        error: 'File not found',
      });

      const result = await service.readFile('/test/file.txt');

      expect(result).toBeNull();
    });

    describe('saveFileWithDialog', () => {
      it('should return saved: false when dialog is canceled', async () => {
        mockElectronAPI.showSaveDialog.mockResolvedValue({ canceled: true });

        const result = await service.saveFileWithDialog('content', {
          title: 'Save',
        });

        expect(result).toEqual({ saved: false });
        expect(mockElectronAPI.writeFile).not.toHaveBeenCalled();
      });

      it('should write file and return saved: true on success', async () => {
        mockElectronAPI.showSaveDialog.mockResolvedValue({
          canceled: false,
          filePath: '/test/file.txt',
        });
        mockElectronAPI.writeFile.mockResolvedValue({ success: true });

        const result = await service.saveFileWithDialog('content', {
          title: 'Save',
        });

        expect(mockElectronAPI.writeFile).toHaveBeenCalledWith(
          '/test/file.txt',
          'content'
        );
        expect(result).toEqual({ saved: true, filePath: '/test/file.txt' });
      });

      it('should return saved: false when write fails', async () => {
        mockElectronAPI.showSaveDialog.mockResolvedValue({
          canceled: false,
          filePath: '/test/file.txt',
        });
        mockElectronAPI.writeFile.mockResolvedValue({
          success: false,
          error: 'Write error',
        });

        const result = await service.saveFileWithDialog('content', {
          title: 'Save',
        });

        expect(result).toEqual({ saved: false, filePath: undefined });
      });
    });
  });
});
