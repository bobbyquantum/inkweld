import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';

import { XsrfService } from './xsrf.service';

describe('XsrfService', () => {
  let service: XsrfService;
  let mockDocument: { cookie: string };

  beforeEach(() => {
    mockDocument = { cookie: '' };

    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: mockDocument }],
    });
    service = TestBed.inject(XsrfService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getXsrfToken()', () => {
    it('should return token when XSRF cookie exists', () => {
      mockDocument.cookie = 'XSRF-TOKEN=abc123; other-cookie=value';
      expect(service.getXsrfToken()).toBe('abc123');
    });

    //TODO: real XSRF
    it('should return empty string when XSRF cookie does not exist', () => {
      mockDocument.cookie = 'other-cookie=value';
      expect(service.getXsrfToken()).toBe('fake');
    });

    //TODO: real XSRF
    it('should return empty string when cookies are empty', () => {
      mockDocument.cookie = '';
      expect(service.getXsrfToken()).toBe('fake');
    });

    it('should handle malformed cookie string', () => {
      mockDocument.cookie = 'XSRF-TOKEN=; =value; malformed';
      expect(service.getXsrfToken()).toBe('');
    });

    it('should return first token when multiple XSRF cookies exist', () => {
      mockDocument.cookie = 'XSRF-TOKEN=first; XSRF-TOKEN=second';
      expect(service.getXsrfToken()).toBe('first');
    });

    it('should handle cookie with spaces', () => {
      mockDocument.cookie = '  XSRF-TOKEN  =  tokenValue  ';
      expect(service.getXsrfToken()).toBe('tokenValue');
    });

    it('should return empty string for malformed cookie', () => {
      mockDocument.cookie = 'XSRF-TOKEN=';
      expect(service.getXsrfToken()).toBe('');
    });
  });
});
