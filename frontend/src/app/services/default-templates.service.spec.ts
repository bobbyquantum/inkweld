import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ElementTypeSchema } from '../models/schema-types';
import { DefaultTemplatesService } from './default-templates.service';

describe('DefaultTemplatesService', () => {
  let service: DefaultTemplatesService;
  let httpMock: HttpTestingController;

  const mockTemplateIndex = {
    templates: [
      {
        id: 'character',
        type: 'CHARACTER',
        name: 'Character',
        file: 'character.json',
      },
      {
        id: 'location',
        type: 'LOCATION',
        name: 'Location',
        file: 'location.json',
      },
    ],
  };

  const mockCharacterTemplate: ElementTypeSchema = {
    id: 'character',
    type: 'CHARACTER',
    name: 'Character',
    description: 'A character template',
    icon: 'person',
    version: 1,
    isBuiltIn: true,
    tabs: [],
  };

  const mockLocationTemplate: ElementTypeSchema = {
    id: 'location',
    type: 'LOCATION',
    name: 'Location',
    description: 'A location template',
    icon: 'place',
    version: 1,
    isBuiltIn: true,
    tabs: [],
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [provideZonelessChangeDetection(), DefaultTemplatesService],
    });

    service = TestBed.inject(DefaultTemplatesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadDefaultTemplates', () => {
    it('should load and cache templates', async () => {
      const promise = service.loadDefaultTemplates();

      // Expect index request
      const indexReq = httpMock.expectOne(
        '/assets/default-templates/index.json'
      );
      expect(indexReq.request.method).toBe('GET');
      indexReq.flush(mockTemplateIndex);

      // Need to wait a microtask for the service to process the index
      await Promise.resolve();

      // Expect template requests
      const charReq = httpMock.expectOne(
        '/assets/default-templates/character.json'
      );
      charReq.flush(mockCharacterTemplate);

      // Need to wait another microtask
      await Promise.resolve();

      const locReq = httpMock.expectOne(
        '/assets/default-templates/location.json'
      );
      locReq.flush(mockLocationTemplate);

      const result = await promise;

      expect(result).toEqual({
        CHARACTER: mockCharacterTemplate,
        LOCATION: mockLocationTemplate,
      });
    });

    it('should return cached templates on subsequent calls', async () => {
      // First call - load from HTTP
      const promise1 = service.loadDefaultTemplates();

      const indexReq = httpMock.expectOne(
        '/assets/default-templates/index.json'
      );
      indexReq.flush(mockTemplateIndex);

      await Promise.resolve();

      const charReq = httpMock.expectOne(
        '/assets/default-templates/character.json'
      );
      charReq.flush(mockCharacterTemplate);

      await Promise.resolve();

      const locReq = httpMock.expectOne(
        '/assets/default-templates/location.json'
      );
      locReq.flush(mockLocationTemplate);

      await promise1;

      // Second call - should use cache, no HTTP requests
      const result = await service.loadDefaultTemplates();

      expect(result).toEqual({
        CHARACTER: mockCharacterTemplate,
        LOCATION: mockLocationTemplate,
      });

      // No additional HTTP verification needed - verify() in afterEach will catch unexpected requests
    });

    it('should handle HTTP errors', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const promise = service.loadDefaultTemplates();

      const indexReq = httpMock.expectOne(
        '/assets/default-templates/index.json'
      );
      indexReq.error(new ProgressEvent('error'));

      await expect(promise).rejects.toThrow();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('getDefaultTemplate', () => {
    it('should get a specific template by type', async () => {
      const promise = service.getDefaultTemplate('CHARACTER');

      const indexReq = httpMock.expectOne(
        '/assets/default-templates/index.json'
      );
      indexReq.flush(mockTemplateIndex);

      await Promise.resolve();

      const charReq = httpMock.expectOne(
        '/assets/default-templates/character.json'
      );
      charReq.flush(mockCharacterTemplate);

      await Promise.resolve();

      const locReq = httpMock.expectOne(
        '/assets/default-templates/location.json'
      );
      locReq.flush(mockLocationTemplate);

      const result = await promise;

      expect(result).toEqual(mockCharacterTemplate);
    });

    it('should return undefined for non-existent template', async () => {
      const promise = service.getDefaultTemplate('NON_EXISTENT');

      const indexReq = httpMock.expectOne(
        '/assets/default-templates/index.json'
      );
      indexReq.flush(mockTemplateIndex);

      await Promise.resolve();

      const charReq = httpMock.expectOne(
        '/assets/default-templates/character.json'
      );
      charReq.flush(mockCharacterTemplate);

      await Promise.resolve();

      const locReq = httpMock.expectOne(
        '/assets/default-templates/location.json'
      );
      locReq.flush(mockLocationTemplate);

      const result = await promise;

      expect(result).toBeUndefined();
    });
  });

  describe('getDefaultTemplateTypes', () => {
    it('should return all template types', async () => {
      const promise = service.getDefaultTemplateTypes();

      const indexReq = httpMock.expectOne(
        '/assets/default-templates/index.json'
      );
      indexReq.flush(mockTemplateIndex);

      await Promise.resolve();

      const charReq = httpMock.expectOne(
        '/assets/default-templates/character.json'
      );
      charReq.flush(mockCharacterTemplate);

      await Promise.resolve();

      const locReq = httpMock.expectOne(
        '/assets/default-templates/location.json'
      );
      locReq.flush(mockLocationTemplate);

      const result = await promise;

      expect(result).toEqual(['CHARACTER', 'LOCATION']);
    });
  });

  describe('clearCache', () => {
    it('should clear cached templates', async () => {
      // Load templates
      const promise1 = service.loadDefaultTemplates();

      const indexReq1 = httpMock.expectOne(
        '/assets/default-templates/index.json'
      );
      indexReq1.flush(mockTemplateIndex);

      await Promise.resolve();

      const charReq1 = httpMock.expectOne(
        '/assets/default-templates/character.json'
      );
      charReq1.flush(mockCharacterTemplate);

      await Promise.resolve();

      const locReq1 = httpMock.expectOne(
        '/assets/default-templates/location.json'
      );
      locReq1.flush(mockLocationTemplate);

      await promise1;

      // Clear cache
      service.clearCache();

      // Load again - should make new HTTP requests
      const promise2 = service.loadDefaultTemplates();

      const indexReq2 = httpMock.expectOne(
        '/assets/default-templates/index.json'
      );
      indexReq2.flush(mockTemplateIndex);

      await Promise.resolve();

      const charReq2 = httpMock.expectOne(
        '/assets/default-templates/character.json'
      );
      charReq2.flush(mockCharacterTemplate);

      await Promise.resolve();

      const locReq2 = httpMock.expectOne(
        '/assets/default-templates/location.json'
      );
      locReq2.flush(mockLocationTemplate);

      await promise2;
    });
  });
});
