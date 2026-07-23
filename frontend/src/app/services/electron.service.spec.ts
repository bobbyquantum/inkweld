import { TestBed } from '@angular/core/testing';

import { translocoTestProvider } from '../../testing/transloco-test-provider';
import { ElectronService } from './electron.service';

describe('ElectronService', () => {
  let service: ElectronService;

  beforeEach(() => {
    // Reset window.electronAPI before each test
    delete (window as { electronAPI?: unknown }).electronAPI;

    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
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

    it('should return { saved: false } for saveFileWithDialog', async () => {
      const result = await service.saveFileWithDialog('content', {
        title: 'Save',
      });
      expect(result).toEqual({ saved: false });
    });

    it('should return { data: null } for openAndReadFile', async () => {
      const result = await service.openAndReadFile({ title: 'Open' });
      expect(result).toEqual({ data: null });
    });
  });

  describe('when running in Electron', () => {
    const mockElectronAPI = {
      isElectron: true,
      getAppVersion: vi.fn().mockResolvedValue('1.0.0'),
      getPlatform: vi.fn().mockResolvedValue('win32'),
      showSaveDialog: vi.fn(),
      showOpenDialog: vi.fn(),
      saveFileWithDialog: vi.fn(),
      openAndReadFile: vi.fn(),
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
          'openFile' | 'openDirectory' | 'multiSelections'
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

    it('should call saveFileWithDialog on Electron API', async () => {
      mockElectronAPI.saveFileWithDialog.mockResolvedValue({
        saved: true,
        filePath: '/test/file.txt',
      });

      const result = await service.saveFileWithDialog('content', {
        title: 'Save',
      });

      expect(mockElectronAPI.saveFileWithDialog).toHaveBeenCalledWith(
        'content',
        { title: 'Save' }
      );
      expect(result).toEqual({ saved: true, filePath: '/test/file.txt' });
    });

    it('should return saved: false when saveFileWithDialog fails', async () => {
      mockElectronAPI.saveFileWithDialog.mockResolvedValue({ saved: false });

      const result = await service.saveFileWithDialog('content', {
        title: 'Save',
      });

      expect(result).toEqual({ saved: false, filePath: undefined });
    });

    it('should call openAndReadFile on Electron API', async () => {
      const mockData = new ArrayBuffer(8);
      mockElectronAPI.openAndReadFile.mockResolvedValue({
        success: true,
        data: mockData,
        filePath: '/test/file.txt',
      });

      const result = await service.openAndReadFile({ title: 'Open' });

      expect(mockElectronAPI.openAndReadFile).toHaveBeenCalledWith({
        title: 'Open',
      });
      expect(result).toEqual({ data: mockData, filePath: '/test/file.txt' });
    });

    it('should return null data for openAndReadFile on failure', async () => {
      mockElectronAPI.openAndReadFile.mockResolvedValue({
        success: false,
        error: 'File not found',
      });

      const result = await service.openAndReadFile({ title: 'Open' });

      expect(result).toEqual({ data: null });
    });
  });
});
