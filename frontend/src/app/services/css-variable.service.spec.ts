import { TestBed } from '@angular/core/testing';

import { CssVariableService } from './css-variable.service';

describe('CssVariableService', () => {
  let service: CssVariableService;
  let mockDocumentElement: HTMLElement;
  let styleMap: Map<string, string>;

  beforeEach(() => {
    styleMap = new Map();
    mockDocumentElement = {
      style: {
        setProperty: (name: string, value: string) => styleMap.set(name, value),
        removeProperty: (name: string) => styleMap.delete(name),
        getPropertyValue: (name: string) => styleMap.get(name) || '',
      },
      // Add minimum required properties to satisfy HTMLElement type
      tagName: 'HTML',
      nodeType: 1,
      ownerDocument: document,
    } as unknown as HTMLElement;

    TestBed.configureTestingModule({});
    service = TestBed.inject(CssVariableService);
    Object.defineProperty(service, 'documentElement', {
      get: () => mockDocumentElement,
    });
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('setVariable', () => {
    it('should set a CSS variable', () => {
      service.setVariable('--test-var', 'value');
      expect(styleMap.get('--test-var')).toBe('value');
    });

    it('should overwrite existing variable', () => {
      service.setVariable('--test-var', 'value1');
      service.setVariable('--test-var', 'value2');
      expect(styleMap.get('--test-var')).toBe('value2');
    });
  });

  describe('removeVariable', () => {
    it('should remove an existing variable', () => {
      service.setVariable('--test-var', 'value');
      service.removeVariable('--test-var');
      expect(styleMap.has('--test-var')).toBe(false);
    });

    it('should handle removing non-existent variable', () => {
      expect(() => service.removeVariable('--non-existent')).not.toThrow();
    });
  });

  describe('setPageDimensions', () => {
    it('should set page dimension variables', () => {
      service.setPageDimensions({
        pageWidth: '800px',
        leftMargin: '20px',
        rightMargin: '20px',
      });

      expect(styleMap.get('--page-width')).toBe('800px');
      expect(styleMap.get('--margin-left')).toBe('20px');
      expect(styleMap.get('--margin-right')).toBe('20px');
      expect(styleMap.has('--editor-max-width')).toBe(false);
    });
  });

  describe('setFitWidthMode', () => {
    it('should remove page dimensions and set editor max width', () => {
      service.setPageDimensions({
        pageWidth: '800px',
        leftMargin: '20px',
        rightMargin: '20px',
      });
      service.setFitWidthMode();

      expect(styleMap.has('--page-width')).toBe(false);
      expect(styleMap.has('--margin-left')).toBe(false);
      expect(styleMap.has('--margin-right')).toBe(false);
      expect(styleMap.get('--editor-max-width')).toBe('100%');
    });
  });

  describe('setZoomLevel', () => {
    it('should set zoom level as a decimal', () => {
      service.setZoomLevel(120);
      expect(styleMap.get('--editor-zoom')).toBe('1.2');
    });

    it('should handle zero zoom level', () => {
      service.setZoomLevel(0);
      expect(styleMap.get('--editor-zoom')).toBe('0');
    });
  });
});
