import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it } from 'vitest';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import * as Y from 'yjs';

import { ElementTypeSchema } from '../../models/schema-types';
import { WorldbuildingService } from '../../services/worldbuilding.service';
import { WorldbuildingEditorComponent } from './worldbuilding-editor.component';

type WorldbuildingMock = DeepMockProxy<WorldbuildingService>;

describe('WorldbuildingEditorComponent', () => {
  let component: WorldbuildingEditorComponent;
  let fixture: ComponentFixture<WorldbuildingEditorComponent>;
  let worldbuildingService: WorldbuildingMock;

  const mockCharacterSchema: ElementTypeSchema = {
    id: 'character',
    type: 'character',
    name: 'Character',
    icon: 'person',
    description: 'Character schema',
    version: 1,
    isBuiltIn: true,
    tabs: [
      {
        key: 'basic',
        label: 'Basic Info',
        icon: 'info',
        order: 1,
        fields: [
          {
            key: 'name',
            label: 'Name',
            type: 'text',
            placeholder: 'Character name',
          },
          { key: 'age', label: 'Age', type: 'number' },
        ],
      },
      {
        key: 'appearance',
        label: 'Appearance',
        icon: 'visibility',
        order: 2,
        fields: [
          { key: 'appearance.height', label: 'Height', type: 'text' },
          { key: 'appearance.weight', label: 'Weight', type: 'text' },
        ],
      },
    ],
    defaultValues: { name: '', age: 0 },
  };

  beforeEach(async () => {
    worldbuildingService = mockDeep<WorldbuildingService>();
    const mockYMap = new Y.Map();
    worldbuildingService.setupCollaboration.mockResolvedValue(mockYMap);
    worldbuildingService.loadSchemaFromElement.mockReturnValue(
      mockCharacterSchema
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    worldbuildingService.getWorldbuildingData.mockResolvedValue({
      id: 'test-element-123',
      type: 'character',
      name: 'Test Character',
      age: '25',
    } as any);

    await TestBed.configureTestingModule({
      imports: [
        WorldbuildingEditorComponent,
        ReactiveFormsModule,
        NoopAnimationsModule,
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        { provide: WorldbuildingService, useValue: worldbuildingService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorldbuildingEditorComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('elementId', 'test-element-123');
    fixture.componentRef.setInput('username', 'testuser');
    fixture.componentRef.setInput('slug', 'test-project');
    fixture.componentRef.setInput('elementType', 'character');

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeDefined();
  });
});
