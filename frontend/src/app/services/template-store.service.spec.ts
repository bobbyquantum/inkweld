import { HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { TemplatesService } from '../../api-client/api/templates.service';
import {
  TemplateDto,
  TemplateLayoutDto,
  TemplateMetadataDto,
  TemplateSchemaDto,
  TemplateSectionLayoutDto,
} from '../../api-client/model/models';
import type { SafeTemplateDto } from './template-store.service';
import { TemplateStoreService } from './template-store.service';

describe('TemplateStoreService', () => {
  let service: TemplateStoreService;
  let templatesServiceMock: jest.Mocked<TemplatesService>;

  const mockSectionLayout: TemplateSectionLayoutDto = {
    type: TemplateSectionLayoutDto.TypeEnum.Grid,
    columns: 2,
    gap: '8px',
    styles: {},
  };

  const mockTemplate: SafeTemplateDto = {
    id: '1',
    name: 'Test Template',
    description: 'A test template',
    schema: {
      nodes: {},
    },
    layout: {
      sections: [
        {
          id: 'section1',
          name: 'Section 1',
          fields: [
            {
              id: 'field1',
              name: 'Field 1',
              type: 'text',
            },
          ],
          layout: mockSectionLayout,
        },
      ],
      styles: {},
    },
    metadata: {
      createdAt: '2024-02-22T12:00:00Z',
      updatedAt: '2024-02-22T12:00:00Z',
      createdBy: 'user1',
      isPublic: false,
      tags: [],
      category: 'test',
      parentTemplate: 'parent1',
    },
    version: 1,
  };

  beforeEach(() => {
    templatesServiceMock = {
      templateControllerFindAll: jest.fn(),
      templateControllerFindPublic: jest.fn(),
      templateControllerFindOne: jest.fn(),
      templateControllerCreate: jest.fn(),
      templateControllerUpdate: jest.fn(),
      templateControllerDelete: jest.fn(),
      templateControllerCreateVersion: jest.fn(),
    } as unknown as jest.Mocked<TemplatesService>;

    TestBed.configureTestingModule({
      providers: [
        TemplateStoreService,
        { provide: TemplatesService, useValue: templatesServiceMock },
      ],
    });

    service = TestBed.inject(TemplateStoreService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadTemplates', () => {
    it('should load templates and update state', done => {
      const templates = [mockTemplate];
      templatesServiceMock.templateControllerFindAll.mockReturnValue(
        of(new HttpResponse({ body: templates }))
      );

      service.loadTemplates().subscribe(result => {
        expect(result).toEqual(templates);
        service.templates$.subscribe(storedTemplates => {
          expect(storedTemplates).toEqual(templates);
          done();
        });
      });
    });

    it('should handle filters', done => {
      const filters = {
        isPublic: true,
        category: 'test',
        search: 'query',
        tags: ['tag1'],
      };

      templatesServiceMock.templateControllerFindAll.mockReturnValue(
        of(new HttpResponse({ body: [mockTemplate] }))
      );

      service.loadTemplates(filters).subscribe(() => {
        expect(
          templatesServiceMock.templateControllerFindAll
        ).toHaveBeenCalledWith(true, 'test', 'query', ['tag1'], 'response');
        done();
      });
    });
  });

  describe('getTemplate', () => {
    it('should get template by id and set as active', done => {
      templatesServiceMock.templateControllerFindOne.mockReturnValue(
        of(new HttpResponse({ body: mockTemplate }))
      );

      service.getTemplate('1').subscribe(() => {
        service.activeTemplate$.subscribe(activeTemplate => {
          expect(activeTemplate).toEqual(mockTemplate);
          done();
        });
      });
    });
  });

  describe('createTemplate', () => {
    it('should create template and update state', done => {
      const newTemplate = { ...mockTemplate, id: '2' };
      templatesServiceMock.templateControllerCreate.mockReturnValue(
        of(new HttpResponse({ body: newTemplate }))
      );

      const createDto = {
        name: 'New Template',
        description: 'A new template',
        schema: { nodes: {} },
        layout: { sections: [], styles: {} },
        version: 1,
      };

      service.createTemplate(createDto).subscribe(() => {
        service.templates$.subscribe(templates => {
          expect(templates).toContainEqual(newTemplate);
          service.activeTemplate$.subscribe(activeTemplate => {
            expect(activeTemplate).toEqual(newTemplate);
            done();
          });
        });
      });
    });
  });

  describe('updateTemplate', () => {
    it('should update template and update state', done => {
      const updatedTemplate = { ...mockTemplate, name: 'Updated Template' };
      // Set initial state
      service['templatesSubject'].next([mockTemplate]);

      service['activeTemplateSubject'].next(mockTemplate);
      templatesServiceMock.templateControllerUpdate.mockReturnValue(
        of(new HttpResponse({ body: updatedTemplate }))
      );

      const updateDto = {
        name: 'Updated Template',
        schema: { nodes: {} },
        layout: { sections: [], styles: {} },
        version: 1,
      };

      service.updateTemplate('1', updateDto).subscribe(() => {
        service.templates$.subscribe(updatedTemplates => {
          expect(updatedTemplates[0]).toEqual(updatedTemplate);
          service.activeTemplate$.subscribe(activeTemplate => {
            expect(activeTemplate).toEqual(updatedTemplate);
            done();
          });
        });
      });
    });
  });

  describe('deleteTemplate', () => {
    it('should delete template and update state', done => {
      templatesServiceMock.templateControllerDelete.mockReturnValue(
        of(new HttpResponse({}))
      );

      service.deleteTemplate('1').subscribe(() => {
        service.templates$.subscribe(updatedTemplates => {
          expect(updatedTemplates).not.toContainEqual(mockTemplate);
          service.activeTemplate$.subscribe(activeTemplate => {
            expect(activeTemplate).toBeNull();
            done();
          });
        });
      });
    });
  });

  describe('filtering', () => {
    beforeEach(() => {
      const templates = [
        {
          ...mockTemplate,
          id: '1',
          metadata: {
            ...mockTemplate.metadata,
            category: 'cat1',
            tags: ['tag1'],
          },
        },
        {
          ...mockTemplate,
          id: '2',
          metadata: {
            ...mockTemplate.metadata,
            category: 'cat2',
            tags: ['tag2'],
          },
        },
      ];
      service['templatesSubject'].next(templates);
    });

    it('should filter by category', done => {
      service.filterByCategory('cat1').subscribe(filtered => {
        expect(filtered.length).toBe(1);
        expect(filtered[0].metadata.category).toBe('cat1');
        done();
      });
    });

    it('should filter by tags', done => {
      service.filterByTags(['tag1']).subscribe(filtered => {
        expect(filtered.length).toBe(1);
        expect(filtered[0].metadata.tags).toContain('tag1');
        done();
      });
    });

    it('should search by name', done => {
      service.searchByName('Test').subscribe(filtered => {
        expect(filtered.length).toBe(2);
        done();
      });
    });
  });

  describe('createVersion', () => {
    it('should create new version and update state', done => {
      const newVersion = { ...mockTemplate, id: '2', version: 2 };
      templatesServiceMock.templateControllerCreateVersion.mockReturnValue(
        of(new HttpResponse({ body: newVersion }))
      );

      service.createVersion('1').subscribe(() => {
        service.templates$.subscribe(templates => {
          expect(templates).toContainEqual(newVersion);
          service.activeTemplate$.subscribe(activeTemplate => {
            expect(activeTemplate).toEqual(newVersion);
            done();
          });
        });
      });
    });
  });

  describe('getChildTemplates', () => {
    it('should get child templates for parent id', done => {
      const parentId = '1';
      const childTemplate = {
        ...mockTemplate,
        id: '2',
        metadata: {
          ...mockTemplate.metadata,
          parentTemplate: parentId,
        },
      };

      service['templatesSubject'].next([mockTemplate, childTemplate]);

      service.getChildTemplates(parentId).subscribe(children => {
        expect(children).toHaveLength(1);
        expect(children[0]).toEqual(childTemplate);
        done();
      });
    });
  });

  describe('clearActiveTemplate', () => {
    it('should clear active template', done => {
      service['activeTemplateSubject'].next(mockTemplate);

      service.clearActiveTemplate();
      service.activeTemplate$.subscribe(template => {
        expect(template).toBeNull();
        done();
      });
    });
  });

  describe('validation', () => {
    it('should throw error for invalid template format', done => {
      const invalidTemplate = {
        id: '1',
        name: 'Test',
      } as TemplateDto;
      templatesServiceMock.templateControllerFindOne.mockReturnValue(
        of(new HttpResponse({ body: invalidTemplate }))
      );

      service.getTemplate('1').subscribe({
        error: err => {
          expect(err.message).toBe('Invalid template format');
          done();
        },
      });
    });

    it('should throw error for invalid metadata', done => {
      const invalidTemplate = {
        ...mockTemplate,
        metadata: {} as Required<TemplateMetadataDto>,
      };
      templatesServiceMock.templateControllerFindOne.mockReturnValue(
        of(new HttpResponse({ body: invalidTemplate }))
      );

      service.getTemplate('1').subscribe({
        error: err => {
          expect(err.message).toBe('Invalid template format');
          done(); // Call done() in the error callback
        },
      });
    });

    it('should throw error for invalid schema', done => {
      const invalidTemplate = {
        ...mockTemplate,
        schema: {} as TemplateSchemaDto,
      };
      templatesServiceMock.templateControllerFindOne.mockReturnValue(
        of(new HttpResponse({ body: invalidTemplate }))
      );

      service.getTemplate('1').subscribe({
        error: err => {
          expect(err.message).toBe('Invalid template format');
          done();
        },
      });
    });

    it('should throw error for invalid layout', done => {
      const invalidTemplate = {
        ...mockTemplate,
        layout: {} as TemplateLayoutDto,
      };
      templatesServiceMock.templateControllerFindOne.mockReturnValue(
        of(new HttpResponse({ body: invalidTemplate }))
      );

      service.getTemplate('1').subscribe({
        error: err => {
          expect(err.message).toBe('Invalid template format');
          done();
        },
      });
    });

    it('should throw error for empty response body', done => {
      templatesServiceMock.templateControllerFindOne.mockReturnValue(
        of(new HttpResponse<TemplateDto>({ body: null }))
      );

      service.getTemplate('1').subscribe({
        error: err => {
          expect(err.message).toBe('Invalid response format: empty body');
          done();
        },
      });
    });

    it('should throw error for invalid response format in list', done => {
      templatesServiceMock.templateControllerFindAll.mockReturnValue(
        of(new HttpResponse<TemplateDto[]>({ body: null }))
      );

      service.loadTemplates().subscribe({
        error: err => {
          expect(err.message).toBe('Invalid response format: expected array');
          done();
        },
      });
    });
  });
});
