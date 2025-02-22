import { ApiProperty } from '@nestjs/swagger';

/**
 * Validation rules for template fields
 */
export class TemplateValidationDto {
  @ApiProperty({ description: 'Validation type', enum: ['required', 'pattern', 'min', 'max', 'custom'] })
  type!: 'required' | 'pattern' | 'min' | 'max' | 'custom';

  @ApiProperty({ description: 'Validation value', required: false })
  value?: unknown;

  @ApiProperty({ description: 'Validation message', required: false })
  message?: string;
}

/**
 * Specification for an attribute in the template schema
 */
export class TemplateAttributeSpecDto {
  @ApiProperty({ description: 'Default value', required: false })
  default?: unknown;

  @ApiProperty({ description: 'Whether attribute is required', required: false })
  required?: boolean;

  @ApiProperty({ description: 'Validation rules', type: [TemplateValidationDto], required: false })
  validations?: TemplateValidationDto[];
}

/**
 * Specification for a node in the template schema
 */
export class TemplateNodeSpecDto {
  @ApiProperty({ description: 'Content expression', required: false })
  content?: string;

  @ApiProperty({ description: 'Node group', required: false })
  group?: string;

  @ApiProperty({ description: 'Whether node is inline', required: false })
  inline?: boolean;

  @ApiProperty({ description: 'Node attributes', required: false })
  attrs?: Record<string, TemplateAttributeSpecDto>;

  @ApiProperty({ description: 'Whether node is selectable', required: false })
  selectable?: boolean;

  @ApiProperty({ description: 'Whether node is draggable', required: false })
  draggable?: boolean;

  @ApiProperty({ description: 'DOM representation', required: false })
  toDOM?: string;

  @ApiProperty({ description: 'DOM parsing rules', required: false })
  parseDOM?: string[];
}

/**
 * Field configuration within a template section
 */
export class TemplateFieldDto {
  @ApiProperty({ description: 'Field identifier' })
  id!: string;

  @ApiProperty({ description: 'Field name' })
  name!: string;

  @ApiProperty({ description: 'Field type (references node type)' })
  type!: string;

  @ApiProperty({ description: 'Whether field is required', required: false })
  required?: boolean;

  @ApiProperty({ description: 'Default value', required: false })
  defaultValue?: unknown;

  @ApiProperty({ description: 'View mode', enum: ['edit', 'readonly', 'hidden'], required: false })
  viewMode?: 'edit' | 'readonly' | 'hidden';

  @ApiProperty({ description: 'Custom styles', required: false })
  styles?: Record<string, unknown>;
}

/**
 * Section layout configuration
 */
export class TemplateSectionLayoutDto {
  @ApiProperty({ description: 'Layout type', enum: ['grid', 'flex', 'flow'] })
  type!: 'grid' | 'flex' | 'flow';

  @ApiProperty({ description: 'Number of columns for grid layout', required: false })
  columns?: number;

  @ApiProperty({ description: 'Gap between elements', required: false })
  gap?: string;

  @ApiProperty({ description: 'Custom styles', required: false })
  styles?: Record<string, unknown>;
}

/**
 * Section within a template layout
 */
export class TemplateSectionDto {
  @ApiProperty({ description: 'Section identifier' })
  id!: string;

  @ApiProperty({ description: 'Section name' })
  name!: string;

  @ApiProperty({ description: 'Section fields', type: [TemplateFieldDto] })
  fields!: TemplateFieldDto[];

  @ApiProperty({ description: 'Section layout configuration' })
  layout!: TemplateSectionLayoutDto;
}

/**
 * Template schema definition
 */
export class TemplateSchemaDto {
  @ApiProperty({ description: 'Template node specifications' })
  nodes!: Record<string, TemplateNodeSpecDto>;
}

/**
 * Template layout configuration
 */
export class TemplateLayoutDto {
  @ApiProperty({ description: 'Template sections', type: [TemplateSectionDto] })
  sections!: TemplateSectionDto[];

  @ApiProperty({ description: 'Custom styles', required: false })
  styles?: Record<string, unknown>;
}

/**
 * Template metadata
 */
export class TemplateMetadataDto {
  @ApiProperty({ description: 'Template creation date' })
  createdAt!: Date;

  @ApiProperty({ description: 'Template last update date' })
  updatedAt!: Date;

  @ApiProperty({ description: 'Template creator ID' })
  createdBy!: string;

  @ApiProperty({ description: 'Whether template is public' })
  isPublic!: boolean;

  @ApiProperty({ description: 'Template tags', type: [String], required: false })
  tags?: string[];

  @ApiProperty({ description: 'Template category', required: false })
  category?: string;

  @ApiProperty({ description: 'Parent template ID for inheritance', required: false })
  parentTemplate?: string;
}

/**
 * Complete template definition
 */
export class TemplateDto {
  @ApiProperty({ description: 'Unique identifier for the template' })
  id!: string;

  @ApiProperty({ description: 'Name of the template' })
  name!: string;

  @ApiProperty({ description: 'Optional description of the template', required: false })
  description?: string;

  @ApiProperty({ description: 'Template schema definition' })
  schema!: TemplateSchemaDto;

  @ApiProperty({ description: 'Template layout configuration' })
  layout!: TemplateLayoutDto;

  @ApiProperty({ description: 'Template metadata' })
  metadata!: TemplateMetadataDto;

  @ApiProperty({ description: 'Template version number' })
  version!: number;
}

/**
 * Data for creating a new template
 */
export class CreateTemplateDto implements Omit<TemplateDto, 'id' | 'metadata'> {
  @ApiProperty({ description: 'Name of the template' })
  name!: string;

  @ApiProperty({ description: 'Optional description of the template', required: false })
  description?: string;

  @ApiProperty({ description: 'Template schema definition' })
  schema!: TemplateSchemaDto;

  @ApiProperty({ description: 'Template layout configuration' })
  layout!: TemplateLayoutDto;

  @ApiProperty({ description: 'Template version number' })
  version!: number;
}

/**
 * Data for updating an existing template
 */
export class UpdateTemplateDto implements Partial<CreateTemplateDto> {
  @ApiProperty({ description: 'Name of the template', required: false })
  name?: string;

  @ApiProperty({ description: 'Optional description of the template', required: false })
  description?: string;

  @ApiProperty({ description: 'Template schema definition', required: false })
  schema?: TemplateSchemaDto;

  @ApiProperty({ description: 'Template layout configuration', required: false })
  layout?: TemplateLayoutDto;

  @ApiProperty({ description: 'Template version number', required: false })
  version?: number;
}
