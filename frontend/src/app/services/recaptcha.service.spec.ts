import { Renderer2, RendererFactory2 } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { RecaptchaService } from './recaptcha.service';

// Mock the global grecaptcha object
interface MockReCaptcha {
  render: jest.Mock;
  execute: jest.Mock;
  getResponse: jest.Mock;
  reset: jest.Mock;
}

describe('RecaptchaService', () => {
  let service: RecaptchaService;
  let mockRenderer: jest.Mocked<Renderer2>;
  let mockRendererFactory: jest.Mocked<RendererFactory2>;
  let mockGrecaptcha: MockReCaptcha;

  beforeEach(() => {
    // Clear any existing grecaptcha
    delete (window as any).grecaptcha;

    // Mock console methods to reduce test noise
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    // Create mock renderer
    mockRenderer = {
      createElement: jest.fn(),
      appendChild: jest.fn(),
    } as unknown as jest.Mocked<Renderer2>;

    // Create mock renderer factory
    mockRendererFactory = {
      createRenderer: jest.fn().mockReturnValue(mockRenderer),
    } as unknown as jest.Mocked<RendererFactory2>;

    // Create mock grecaptcha
    mockGrecaptcha = {
      render: jest.fn(),
      execute: jest.fn(),
      getResponse: jest.fn(),
      reset: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        RecaptchaService,
        { provide: RendererFactory2, useValue: mockRendererFactory },
      ],
    });

    service = TestBed.inject(RecaptchaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (window as any).grecaptcha;
  });

  describe('Initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should create renderer on construction', () => {
      expect(mockRendererFactory.createRenderer).toHaveBeenCalledWith(
        null,
        null
      );
    });
  });

  describe('loadRecaptcha', () => {
    let mockScript: HTMLScriptElement;
    let mockHead: HTMLElement;

    beforeEach(() => {
      mockScript = {
        src: '',
        async: false,
        defer: false,
        onload: null,
        onerror: null,
      } as HTMLScriptElement;

      mockHead = document.createElement('head');

      mockRenderer.createElement.mockReturnValue(mockScript);
      jest
        .spyOn(document, 'getElementsByTagName')
        .mockReturnValue([mockHead] as unknown as HTMLCollectionOf<Element>);
    });

    it('should load recaptcha script successfully', async () => {
      const loadPromise = service.loadRecaptcha();

      // Simulate script loading
      setTimeout(() => {
        if (mockScript.onload) {
          mockScript.onload({} as Event);
        }
      }, 0);

      await loadPromise;

      expect(mockRenderer.createElement).toHaveBeenCalledWith('script');
      expect(mockScript.src).toBe('https://www.google.com/recaptcha/api.js');
      expect(mockScript.async).toBe(true);
      expect(mockScript.defer).toBe(true);
      expect(mockRenderer.appendChild).toHaveBeenCalledWith(
        mockHead,
        mockScript
      );
    });

    it('should return immediately if already loaded', async () => {
      // First load
      const firstLoadPromise = service.loadRecaptcha();
      setTimeout(() => {
        if (mockScript.onload) {
          mockScript.onload({} as Event);
        }
      }, 0);
      await firstLoadPromise;

      // Reset mocks
      mockRenderer.createElement.mockClear();
      mockRenderer.appendChild.mockClear();

      // Second load should not create new script
      const secondLoadPromise = service.loadRecaptcha();
      await secondLoadPromise;

      expect(mockRenderer.createElement).not.toHaveBeenCalled();
      expect(mockRenderer.appendChild).not.toHaveBeenCalled();
    });

    it('should return existing promise if load is in progress', async () => {
      const firstLoadPromise = service.loadRecaptcha();
      const secondLoadPromise = service.loadRecaptcha();

      expect(firstLoadPromise).toBe(secondLoadPromise);

      // Complete the load
      setTimeout(() => {
        if (mockScript.onload) {
          mockScript.onload({} as Event);
        }
      }, 0);

      await firstLoadPromise;
    });

    it('should resolve immediately if window.grecaptcha already exists', async () => {
      (window as any).grecaptcha = mockGrecaptcha;

      await service.loadRecaptcha();

      expect(mockRenderer.createElement).not.toHaveBeenCalled();
      expect(mockRenderer.appendChild).not.toHaveBeenCalled();
    });

    it('should reject on script load error', async () => {
      const loadPromise = service.loadRecaptcha();

      // Simulate script error
      setTimeout(() => {
        if (mockScript.onerror) {
          mockScript.onerror({} as Event);
        }
      }, 0);

      await expect(loadPromise).rejects.toThrow(
        'Failed to load reCAPTCHA script'
      );
    });
  });

  describe('render', () => {
    let mockElement: HTMLElement;

    beforeEach(() => {
      mockElement = document.createElement('div');
      (window as any).grecaptcha = mockGrecaptcha;
      mockGrecaptcha.render.mockReturnValue(123); // Mock widget ID
    });

    it('should render recaptcha widget successfully', async () => {
      // Mock successful script loading
      jest.spyOn(service, 'loadRecaptcha').mockResolvedValue();

      const widgetId = await service.render(mockElement, 'test-site-key');

      expect(service.loadRecaptcha).toHaveBeenCalled();
      expect(mockGrecaptcha.render).toHaveBeenCalledWith(mockElement, {
        sitekey: 'test-site-key',
        callback: undefined,
      });
      expect(widgetId).toBe(123);
    });

    it('should render recaptcha widget with callback', async () => {
      jest.spyOn(service, 'loadRecaptcha').mockResolvedValue();
      const mockCallback = jest.fn();

      const widgetId = await service.render(
        mockElement,
        'test-site-key',
        mockCallback
      );

      expect(mockGrecaptcha.render).toHaveBeenCalledWith(mockElement, {
        sitekey: 'test-site-key',
        callback: mockCallback,
      });
      expect(widgetId).toBe(123);
    });

    it('should throw error if grecaptcha not available after loading', async () => {
      jest.spyOn(service, 'loadRecaptcha').mockResolvedValue();
      delete (window as any).grecaptcha;

      await expect(
        service.render(mockElement, 'test-site-key')
      ).rejects.toThrow('reCAPTCHA not loaded');
    });

    it('should wait for grecaptcha.render to be available', async () => {
      jest.spyOn(service, 'loadRecaptcha').mockResolvedValue();

      // Initially grecaptcha exists but render is not a function
      (window as any).grecaptcha = { render: undefined };

      const renderPromise = service.render(mockElement, 'test-site-key');

      // Simulate grecaptcha.render becoming available after a delay
      setTimeout(() => {
        (window as any).grecaptcha = mockGrecaptcha;
      }, 150);

      const widgetId = await renderPromise;
      expect(widgetId).toBe(123);
    });

    it('should timeout if grecaptcha.render never becomes available', async () => {
      jest.spyOn(service, 'loadRecaptcha').mockResolvedValue();

      // grecaptcha exists but render never becomes a function
      (window as any).grecaptcha = { render: undefined };

      await expect(
        service.render(mockElement, 'test-site-key')
      ).rejects.toThrow('Timeout waiting for grecaptcha.render');
    }, 10000); // Increase timeout for this test
  });

  describe('execute', () => {
    beforeEach(() => {
      (window as any).grecaptcha = mockGrecaptcha;
    });

    it('should execute recaptcha without widget ID', async () => {
      mockGrecaptcha.execute.mockResolvedValue(undefined);

      await service.execute();

      expect(mockGrecaptcha.execute).toHaveBeenCalledWith(undefined);
    });

    it('should execute recaptcha with widget ID', async () => {
      mockGrecaptcha.execute.mockResolvedValue(undefined);

      await service.execute(123);

      expect(mockGrecaptcha.execute).toHaveBeenCalledWith(123);
    });

    it('should throw error if grecaptcha not loaded', async () => {
      delete (window as any).grecaptcha;

      await expect(service.execute()).rejects.toThrow('reCAPTCHA not loaded');
    });
  });

  describe('getResponse', () => {
    beforeEach(() => {
      (window as any).grecaptcha = mockGrecaptcha;
    });

    it('should get response without widget ID', () => {
      mockGrecaptcha.getResponse.mockReturnValue('test-token');

      const response = service.getResponse();

      expect(mockGrecaptcha.getResponse).toHaveBeenCalledWith(undefined);
      expect(response).toBe('test-token');
    });

    it('should get response with widget ID', () => {
      mockGrecaptcha.getResponse.mockReturnValue('test-token-123');

      const response = service.getResponse(123);

      expect(mockGrecaptcha.getResponse).toHaveBeenCalledWith(123);
      expect(response).toBe('test-token-123');
    });

    it('should return empty string if grecaptcha not loaded', () => {
      delete (window as any).grecaptcha;

      const response = service.getResponse();

      expect(response).toBe('');
    });
  });

  describe('reset', () => {
    beforeEach(() => {
      (window as any).grecaptcha = mockGrecaptcha;
    });

    it('should reset recaptcha without widget ID', () => {
      service.reset();

      expect(mockGrecaptcha.reset).toHaveBeenCalledWith(undefined);
    });

    it('should reset recaptcha with widget ID', () => {
      service.reset(123);

      expect(mockGrecaptcha.reset).toHaveBeenCalledWith(123);
    });

    it('should do nothing if grecaptcha not loaded', () => {
      delete (window as any).grecaptcha;

      service.reset();

      expect(mockGrecaptcha.reset).not.toHaveBeenCalled();
    });
  });
});
