import { TestBed } from '@angular/core/testing';

import { SetupService } from './setup.service';

describe('SetupService', () => {
  let service: SetupService;
  let mockLocalStorage: { [key: string]: string };

  const SETUP_STORAGE_KEY = 'inkweld-app-config';

  beforeEach(() => {
    // Mock localStorage
    mockLocalStorage = {};
    const localStorageMock = {
      getItem: jest.fn((key: string) => mockLocalStorage[key] || null),
      setItem: jest.fn((key: string, value: string) => {
        mockLocalStorage[key] = value;
      }),
      removeItem: jest.fn((key: string) => {
        delete mockLocalStorage[key];
      }),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    // Mock fetch for server health checks
    global.fetch = jest.fn();

    TestBed.configureTestingModule({});
    service = TestBed.inject(SetupService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with no configuration', () => {
    expect(service.isConfigured()).toBe(false);
    expect(service.appConfig()).toBe(null);
    expect(service.isLoading()).toBe(false);
  });

  describe('checkConfiguration', () => {
    it('should return false when no config is stored', () => {
      const result = service.checkConfiguration();
      expect(result).toBe(false);
      expect(service.isConfigured()).toBe(false);
    });

    it('should return true when valid config is stored', () => {
      const config = {
        mode: 'offline' as const,
        userProfile: { name: 'Test', username: 'test' },
      };
      mockLocalStorage[SETUP_STORAGE_KEY] = JSON.stringify(config);

      const result = service.checkConfiguration();
      expect(result).toBe(true);
      expect(service.isConfigured()).toBe(true);
      expect(service.appConfig()).toEqual(config);
    });

    it('should handle corrupted stored config gracefully', () => {
      mockLocalStorage[SETUP_STORAGE_KEY] = 'invalid-json';
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = service.checkConfiguration();
      expect(result).toBe(false);
      expect(service.isConfigured()).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to load stored config:',
        expect.any(Error)
      );
    });
  });

  describe('configureServerMode', () => {
    it('should configure server mode successfully', async () => {
      const serverUrl = 'https://api.example.com';
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
      });

      await service.configureServerMode(serverUrl);

      expect(service.isConfigured()).toBe(true);
      expect(service.appConfig()).toEqual({
        mode: 'server',
        serverUrl: serverUrl,
      });
      expect(service.isLoading()).toBe(false);
      expect(mockLocalStorage[SETUP_STORAGE_KEY]).toBeDefined();
    });

    it('should handle server connection failure', async () => {
      const serverUrl = 'https://unreachable.example.com';
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
      });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(service.configureServerMode(serverUrl)).rejects.toThrow(
        'Server is not reachable'
      );
      expect(service.isLoading()).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to configure server mode:',
        expect.any(Error)
      );
    });

    it('should handle fetch errors', async () => {
      const serverUrl = 'https://error.example.com';
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(service.configureServerMode(serverUrl)).rejects.toThrow(
        'Network error'
      );
      expect(service.isLoading()).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to configure server mode:',
        expect.any(Error)
      );
    });

    it('should set loading state correctly during operation', async () => {
      const serverUrl = 'https://api.example.com';
      (global.fetch as jest.Mock).mockImplementation(() => {
        expect(service.isLoading()).toBe(true);
        return Promise.resolve({ ok: true });
      });

      await service.configureServerMode(serverUrl);
      expect(service.isLoading()).toBe(false);
    });
  });

  describe('configureOfflineMode', () => {
    it('should configure offline mode successfully', () => {
      const userProfile = { name: 'Test User', username: 'testuser' };

      service.configureOfflineMode(userProfile);

      expect(service.isConfigured()).toBe(true);
      expect(service.appConfig()).toEqual({
        mode: 'offline',
        userProfile: userProfile,
      });
      expect(service.isLoading()).toBe(false);
      expect(mockLocalStorage[SETUP_STORAGE_KEY]).toBeDefined();
    });
  });

  describe('resetConfiguration', () => {
    it('should reset configuration completely', () => {
      // First set up a configuration
      const userProfile = { name: 'Test User', username: 'testuser' };
      service.configureOfflineMode(userProfile);
      expect(service.isConfigured()).toBe(true);

      // Reset it
      service.resetConfiguration();

      expect(service.isConfigured()).toBe(false);
      expect(service.appConfig()).toBe(null);
      expect(localStorage.removeItem).toHaveBeenCalledWith(SETUP_STORAGE_KEY);
    });
  });

  describe('getMode', () => {
    it('should return null when no config is set', () => {
      expect(service.getMode()).toBe(null);
    });

    it('should return server mode when configured', () => {
      const config = {
        mode: 'server' as const,
        serverUrl: 'https://api.example.com',
      };
      mockLocalStorage[SETUP_STORAGE_KEY] = JSON.stringify(config);
      service.checkConfiguration();

      expect(service.getMode()).toBe('server');
    });

    it('should return offline mode when configured', () => {
      const userProfile = { name: 'Test User', username: 'testuser' };
      service.configureOfflineMode(userProfile);

      expect(service.getMode()).toBe('offline');
    });
  });

  describe('getServerUrl', () => {
    it('should return null when no config is set', () => {
      expect(service.getServerUrl()).toBe(null);
    });

    it('should return null when in offline mode', () => {
      const userProfile = { name: 'Test User', username: 'testuser' };
      service.configureOfflineMode(userProfile);

      expect(service.getServerUrl()).toBe(null);
    });

    it('should return server URL when in server mode', async () => {
      const serverUrl = 'https://api.example.com';
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      await service.configureServerMode(serverUrl);

      expect(service.getServerUrl()).toBe(serverUrl);
    });

    it('should return null when server URL is not set in server mode', () => {
      const config = { mode: 'server' as const };
      mockLocalStorage[SETUP_STORAGE_KEY] = JSON.stringify(config);
      service.checkConfiguration();

      expect(service.getServerUrl()).toBe(null);
    });
  });

  describe('getWebSocketUrl', () => {
    it('should return null when no config is set', () => {
      expect(service.getWebSocketUrl()).toBe(null);
    });

    it('should return null in offline mode', () => {
      const userProfile = { name: 'Test User', username: 'testuser' };
      service.configureOfflineMode(userProfile);

      expect(service.getWebSocketUrl()).toBe(null);
    });

    it('should convert HTTP server URL to WebSocket URL', () => {
      const config = {
        mode: 'server' as const,
        serverUrl: 'http://localhost:8333',
      };
      mockLocalStorage[SETUP_STORAGE_KEY] = JSON.stringify(config);
      service.checkConfiguration();

      expect(service.getWebSocketUrl()).toBe('ws://localhost:8333');
    });

    it('should convert HTTPS server URL to secure WebSocket URL', () => {
      const config = {
        mode: 'server' as const,
        serverUrl: 'https://api.example.com',
      };
      mockLocalStorage[SETUP_STORAGE_KEY] = JSON.stringify(config);
      service.checkConfiguration();

      expect(service.getWebSocketUrl()).toBe('wss://api.example.com');
    });

    it('should handle server URL with port', () => {
      const config = {
        mode: 'server' as const,
        serverUrl: 'https://api.example.com:8080',
      };
      mockLocalStorage[SETUP_STORAGE_KEY] = JSON.stringify(config);
      service.checkConfiguration();

      expect(service.getWebSocketUrl()).toBe('wss://api.example.com:8080');
    });

    it('should handle server URL with path', () => {
      const config = {
        mode: 'server' as const,
        serverUrl: 'https://api.example.com/api/v1',
      };
      mockLocalStorage[SETUP_STORAGE_KEY] = JSON.stringify(config);
      service.checkConfiguration();

      expect(service.getWebSocketUrl()).toBe('wss://api.example.com');
    });

    it('should return null when server URL is invalid', () => {
      const config = {
        mode: 'server' as const,
        serverUrl: 'invalid-url',
      };
      mockLocalStorage[SETUP_STORAGE_KEY] = JSON.stringify(config);
      service.checkConfiguration();

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      expect(service.getWebSocketUrl()).toBe(null);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to parse server URL for WebSocket:',
        expect.anything()
      );
    });
  });

  describe('getOfflineUserProfile', () => {
    it('should return null when no config is set', () => {
      expect(service.getOfflineUserProfile()).toBe(null);
    });

    it('should return null when in server mode', async () => {
      const serverUrl = 'https://api.example.com';
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      await service.configureServerMode(serverUrl);

      expect(service.getOfflineUserProfile()).toBe(null);
    });

    it('should return user profile when in offline mode', () => {
      const userProfile = { name: 'Test User', username: 'testuser' };
      service.configureOfflineMode(userProfile);

      expect(service.getOfflineUserProfile()).toEqual(userProfile);
    });

    it('should return null when user profile is not set in offline mode', () => {
      const config = { mode: 'offline' as const };
      mockLocalStorage[SETUP_STORAGE_KEY] = JSON.stringify(config);
      service.checkConfiguration();

      expect(service.getOfflineUserProfile()).toBe(null);
    });
  });

  describe('localStorage error handling', () => {
    it('should handle localStorage save errors', () => {
      (localStorage.setItem as jest.Mock).mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const userProfile = { name: 'Test User', username: 'testuser' };
      expect(() => service.configureOfflineMode(userProfile)).toThrow(
        'Storage quota exceeded'
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to save config:',
        expect.any(Error)
      );
    });

    it('should handle localStorage read errors', () => {
      (localStorage.getItem as jest.Mock).mockImplementation(() => {
        throw new Error('Storage access denied');
      });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = service.checkConfiguration();
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to load stored config:',
        expect.any(Error)
      );
    });
  });
});
