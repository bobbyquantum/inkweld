import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ViewportService } from './viewport.service';

describe('ViewportService', () => {
  let service: ViewportService;

  // Mock visualViewport API
  let mockVisualViewport: {
    height: number;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };

  // Helper to get resize callback from mock
  const getResizeCallback = (): (() => void) | undefined => {
    const calls = mockVisualViewport.addEventListener.mock.calls as Array<
      [string, () => void]
    >;
    return calls.find(call => call[0] === 'resize')?.[1];
  };

  beforeEach(() => {
    // Setup mock visualViewport
    mockVisualViewport = {
      height: 800,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    // Mock window properties
    Object.defineProperty(window, 'visualViewport', {
      value: mockVisualViewport,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, 'innerHeight', {
      value: 900,
      writable: true,
      configurable: true,
    });

    TestBed.configureTestingModule({
      providers: [
        ViewportService,
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });

    service = TestBed.inject(ViewportService);
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  describe('initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should register event listeners on visualViewport', () => {
      expect(mockVisualViewport.addEventListener).toHaveBeenCalledWith(
        'resize',
        expect.any(Function)
      );
      expect(mockVisualViewport.addEventListener).toHaveBeenCalledWith(
        'scroll',
        expect.any(Function)
      );
    });

    it('should set initial viewport height', () => {
      expect(service.availableHeight()).toBe(800);
    });
  });

  describe('keyboard detection', () => {
    it('should detect keyboard as open when visual height is significantly smaller than layout height', () => {
      // Initial state - keyboard closed (800 visual, 900 layout = 100px difference, threshold)
      expect(service.isKeyboardOpen()).toBe(false);

      // Simulate keyboard opening by updating visualViewport height
      mockVisualViewport.height = 500;

      // Trigger resize event
      const resizeCallback = getResizeCallback();
      resizeCallback?.();

      expect(service.isKeyboardOpen()).toBe(true);
    });

    it('should calculate keyboard height correctly', () => {
      // Simulate keyboard opening
      mockVisualViewport.height = 500;
      Object.defineProperty(window, 'innerHeight', { value: 900 });

      const resizeCallback = getResizeCallback();
      resizeCallback?.();

      expect(service.keyboardHeight()).toBe(400);
    });

    it('should return 0 keyboard height when keyboard is closed', () => {
      expect(service.keyboardHeight()).toBe(0);
    });
  });

  describe('CSS variable updates', () => {
    it('should set --visual-viewport-height CSS variable', () => {
      const root = document.documentElement;
      expect(root.style.getPropertyValue('--visual-viewport-height')).toBe(
        '800px'
      );
    });

    it('should set --keyboard-open CSS variable to 0 when keyboard is closed', () => {
      const root = document.documentElement;
      expect(root.style.getPropertyValue('--keyboard-open')).toBe('0');
    });

    it('should set --keyboard-open CSS variable to 1 when keyboard is open', () => {
      mockVisualViewport.height = 400;

      const resizeCallback = getResizeCallback();
      resizeCallback?.();

      const root = document.documentElement;
      expect(root.style.getPropertyValue('--keyboard-open')).toBe('1');
    });

    it('should update offset variants when viewport changes', () => {
      mockVisualViewport.height = 600;

      const resizeCallback = getResizeCallback();
      resizeCallback?.();

      const root = document.documentElement;
      expect(root.style.getPropertyValue('--visual-viewport-height-48')).toBe(
        '552px'
      );
      expect(root.style.getPropertyValue('--visual-viewport-height-50')).toBe(
        '550px'
      );
    });
  });

  describe('cleanup', () => {
    it('should remove event listeners on destroy', () => {
      service.ngOnDestroy();

      expect(mockVisualViewport.removeEventListener).toHaveBeenCalledWith(
        'resize',
        expect.any(Function)
      );
    });
  });

  describe('server-side rendering', () => {
    it('should not initialize on server platform', () => {
      // Create a new service with server platform
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          ViewportService,
          { provide: PLATFORM_ID, useValue: 'server' },
        ],
      });

      const serverService = TestBed.inject(ViewportService);
      expect(serverService.availableHeight()).toBe(0);
    });
  });
});
