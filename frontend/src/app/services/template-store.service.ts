import { HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, map, Observable, tap } from 'rxjs';

import { TemplatesService } from '../../api-client/api/templates.service';
import type {
  CreateTemplateDto,
  TemplateDto,
  TemplateLayoutDto,
  TemplateMetadataDto,
  TemplateSchemaDto,
  UpdateTemplateDto,
} from '../../api-client/model/models';

export type TemplateFilters = {
  isPublic?: boolean;
  category?: string;
  search?: string;
  tags?: string[];
};

export interface SafeTemplateDto
  extends Omit<TemplateDto, 'metadata' | 'schema' | 'layout'> {
  id: string;
  name: string;
  description?: string;
  metadata: Required<TemplateMetadataDto>;
  schema: Required<TemplateSchemaDto>;
  layout: Required<TemplateLayoutDto>;
  version: number;
}

@Injectable({
  providedIn: 'root',
})
export class TemplateStoreService {
  readonly templates$: Observable<readonly SafeTemplateDto[]>;

  readonly activeTemplate$: Observable<SafeTemplateDto | null>;

  private readonly templatesSubject = new BehaviorSubject<
    readonly SafeTemplateDto[]
  >([]);

  private readonly activeTemplateSubject =
    new BehaviorSubject<SafeTemplateDto | null>(null);

  constructor(private readonly templatesService: TemplatesService) {
    this.templates$ = this.templatesSubject.asObservable();
    this.activeTemplate$ = this.activeTemplateSubject.asObservable();
  }

  loadTemplates(
    options: TemplateFilters = {}
  ): Observable<readonly SafeTemplateDto[]> {
    return this.templatesService
      .templateControllerFindAll(
        options.isPublic ?? false,
        options.category ?? '',
        options.search ?? '',
        options.tags ?? [],
        'response'
      )
      .pipe(
        map(response => this.validateTemplateListResponse(response)),
        tap(templates => this.templatesSubject.next(templates))
      );
  }

  loadPublicTemplates(
    options: Omit<TemplateFilters, 'isPublic'> = {}
  ): Observable<readonly SafeTemplateDto[]> {
    return this.templatesService
      .templateControllerFindPublic(
        options.category ?? '',
        options.search ?? '',
        options.tags ?? [],
        'response'
      )
      .pipe(
        map(response => this.validateTemplateListResponse(response)),
        tap(templates => this.templatesSubject.next(templates))
      );
  }

  getTemplate(id: string): Observable<SafeTemplateDto> {
    return this.templatesService.templateControllerFindOne(id, 'response').pipe(
      map(response => this.validateTemplateResponse(response)),
      tap(template => this.activeTemplateSubject.next(template))
    );
  }

  createTemplate(dto: CreateTemplateDto): Observable<SafeTemplateDto> {
    return this.templatesService.templateControllerCreate(dto, 'response').pipe(
      map(response => this.validateTemplateResponse(response)),
      tap(newTemplate => {
        const currentTemplates = [...this.templatesSubject.value];
        this.templatesSubject.next([...currentTemplates, newTemplate]);
        this.activeTemplateSubject.next(newTemplate);
      })
    );
  }

  updateTemplate(
    id: string,
    dto: UpdateTemplateDto
  ): Observable<SafeTemplateDto> {
    return this.templatesService
      .templateControllerUpdate(id, dto, 'response')
      .pipe(
        map(response => this.validateTemplateResponse(response)),
        tap(updatedTemplate => {
          const currentTemplates = [...this.templatesSubject.value];
          const index = currentTemplates.findIndex(t => t.id === id);
          if (index !== -1) {
            currentTemplates[index] = updatedTemplate;
            this.templatesSubject.next(currentTemplates);

            if (this.activeTemplateSubject.value?.id === id) {
              this.activeTemplateSubject.next(updatedTemplate);
            }
          }
        })
      );
  }

  deleteTemplate(id: string): Observable<void> {
    return this.templatesService.templateControllerDelete(id, 'response').pipe(
      map(() => void 0),
      tap(() => {
        const currentTemplates = this.templatesSubject.value;
        this.templatesSubject.next(
          currentTemplates.filter(template => template.id !== id)
        );

        if (this.activeTemplateSubject.value?.id === id) {
          this.activeTemplateSubject.next(null);
        }
      })
    );
  }

  createVersion(id: string): Observable<SafeTemplateDto> {
    return this.templatesService
      .templateControllerCreateVersion(id, 'response')
      .pipe(
        map(response => this.validateTemplateResponse(response)),
        tap(newVersion => {
          const currentTemplates = [...this.templatesSubject.value];
          this.templatesSubject.next([...currentTemplates, newVersion]);
          this.activeTemplateSubject.next(newVersion);
        })
      );
  }

  filterByCategory(category: string): Observable<readonly SafeTemplateDto[]> {
    return this.templates$.pipe(
      map(templates => templates.filter(t => t.metadata.category === category))
    );
  }

  filterByTags(
    tags: readonly string[]
  ): Observable<readonly SafeTemplateDto[]> {
    return this.templates$.pipe(
      map(templates =>
        templates.filter(t => tags.every(tag => t.metadata.tags?.includes(tag)))
      )
    );
  }

  searchByName(search: string): Observable<readonly SafeTemplateDto[]> {
    const searchLower = search.toLowerCase();
    return this.templates$.pipe(
      map(templates =>
        templates.filter(
          t =>
            t.name.toLowerCase().includes(searchLower) ||
            (t.description?.toLowerCase().includes(searchLower) ?? false)
        )
      )
    );
  }

  getChildTemplates(parentId: string): Observable<readonly SafeTemplateDto[]> {
    return this.templates$.pipe(
      map(templates =>
        templates.filter(t => t.metadata.parentTemplate === parentId)
      )
    );
  }

  clearActiveTemplate(): void {
    this.activeTemplateSubject.next(null);
  }

  private validateTemplateListResponse(
    response: HttpResponse<TemplateDto[]>
  ): SafeTemplateDto[] {
    if (!response.body || !Array.isArray(response.body)) {
      throw new Error('Invalid response format: expected array');
    }
    return response.body.map(template => this.validateTemplate(template));
  }

  private validateTemplateResponse(
    response: HttpResponse<TemplateDto>
  ): SafeTemplateDto {
    if (!response.body) {
      throw new Error('Invalid response format: empty body');
    }
    return this.validateTemplate(response.body);
  }

  private validateTemplate(template: unknown): SafeTemplateDto {
    if (!this.isValidTemplate(template)) {
      throw new Error('Invalid template format');
    }
    return template;
  }

  private isValidTemplate(value: unknown): value is SafeTemplateDto {
    if (!this.isRecord(value)) {
      return false;
    }

    const template = value;
    return (
      typeof template['id'] === 'string' &&
      typeof template['name'] === 'string' &&
      this.isValidMetadata(template['metadata']) &&
      this.isValidSchema(template['schema']) &&
      this.isValidLayout(template['layout']) &&
      typeof template['version'] === 'number'
    );
  }

  private isValidMetadata(
    value: unknown
  ): value is Required<TemplateMetadataDto> {
    if (!this.isRecord(value)) {
      return false;
    }

    const metadata = value;
    return (
      typeof metadata['createdAt'] === 'string' &&
      typeof metadata['updatedAt'] === 'string' &&
      typeof metadata['createdBy'] === 'string' &&
      typeof metadata['isPublic'] === 'boolean' &&
      (!('tags' in metadata) || Array.isArray(metadata['tags'])) &&
      (!('category' in metadata) || typeof metadata['category'] === 'string') &&
      (!('parentTemplate' in metadata) ||
        typeof metadata['parentTemplate'] === 'string')
    );
  }

  private isValidSchema(value: unknown): value is Required<TemplateSchemaDto> {
    if (!this.isRecord(value)) {
      return false;
    }

    const schema = value;
    return typeof schema['nodes'] === 'object' && schema['nodes'] !== null;
  }

  private isValidLayout(value: unknown): value is Required<TemplateLayoutDto> {
    if (!this.isRecord(value)) {
      return false;
    }

    const layout = value;
    return (
      Array.isArray(layout['sections']) &&
      typeof layout['styles'] === 'object' &&
      layout['styles'] !== null
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
  }
}
