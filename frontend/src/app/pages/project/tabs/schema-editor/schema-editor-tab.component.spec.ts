import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { type ElementTypeSchema } from '@models/schema-types';
import { ProjectStateService } from '@services/project/project-state.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../../../testing/transloco-test-provider';
import { SchemaEditorTabComponent } from './schema-editor-tab.component';

describe('SchemaEditorTabComponent', () => {
  let component: SchemaEditorTabComponent;
  let fixture: ComponentFixture<SchemaEditorTabComponent>;

  const mockSchema: ElementTypeSchema = {
    id: 'character',
    name: 'Character',
    icon: 'person',
    description: '',
    version: 1,
    tabs: [],
  };

  let mockWorldbuildingService: {
    schemas: () => ElementTypeSchema[];
    getSchema: ReturnType<typeof vi.fn>;
    saveSchemaToLibrary: ReturnType<typeof vi.fn>;
  };
  let mockProjectState: {
    openTabs: () => { id: string; schema?: ElementTypeSchema }[];
    canWrite: () => boolean;
  };

  beforeEach(async () => {
    mockWorldbuildingService = {
      schemas: () => [],
      getSchema: vi.fn().mockReturnValue(mockSchema),
      saveSchemaToLibrary: vi.fn(),
    };
    mockProjectState = {
      openTabs: () => [],
      canWrite: () => true,
    };

    await TestBed.configureTestingModule({
      imports: [SchemaEditorTabComponent, translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(new Map([['schemaId', 'character']])) },
        },
        { provide: WorldbuildingService, useValue: mockWorldbuildingService },
        { provide: ProjectStateService, useValue: mockProjectState },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SchemaEditorTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should resolve the schema from the library by route id', () => {
    expect(component.schema()?.id).toBe('character');
    expect(mockWorldbuildingService.getSchema).toHaveBeenCalledWith(
      'character'
    );
  });

  it('should live-save schema edits', () => {
    component.onSchemaChange(mockSchema);
    expect(mockWorldbuildingService.saveSchemaToLibrary).toHaveBeenCalledWith(
      mockSchema
    );
  });
});
