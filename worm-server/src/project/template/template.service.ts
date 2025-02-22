import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, In } from 'typeorm';
import { Template } from './template.entity.js';
import { CreateTemplateDto, UpdateTemplateDto, TemplateMetadataDto } from './template.dto.js';

@Injectable()
export class TemplateService {
  constructor(
    @InjectRepository(Template)
    private readonly templateRepository: Repository<Template>
  ) {}

  /**
   * Creates a new template
   */
  async create(userId: string, dto: CreateTemplateDto & { metadata?: Partial<TemplateMetadataDto> }): Promise<Template> {
    // Check for existing template with same name
    const existing = await this.templateRepository.findOne({
      where: { name: dto.name, createdBy: userId }
    });

    if (existing) {
      throw new ConflictException(`Template with name "${dto.name}" already exists`);
    }

    // Handle template inheritance
    let parentSchema = {};
    let parentLayout = {};
    if (dto.metadata?.parentTemplate) {
      const parent = await this.templateRepository.findOne({
        where: { id: dto.metadata.parentTemplate }
      });

      if (!parent) {
        throw new NotFoundException(`Parent template ${dto.metadata.parentTemplate} not found`);
      }

      // Merge parent schema and layout with overrides
      parentSchema = parent.schema;
      parentLayout = parent.layout;
    }

    const template = this.templateRepository.create({
      ...dto,
      schema: { ...parentSchema, ...dto.schema },
      layout: { ...parentLayout, ...dto.layout },
      createdBy: userId,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: userId,
        isPublic: false,
        ...dto.metadata
      }
    });

    return this.templateRepository.save(template);
  }

  /**
   * Updates an existing template
   */
  async update(id: string, userId: string, dto: UpdateTemplateDto): Promise<Template> {
    const template = await this.templateRepository.findOne({
      where: { id, createdBy: userId }
    });

    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }

    // Check name uniqueness if name is being updated
    if (dto.name && dto.name !== template.name) {
      const existing = await this.templateRepository.findOne({
        where: { name: dto.name, createdBy: userId }
      });

      if (existing) {
        throw new ConflictException(`Template with name "${dto.name}" already exists`);
      }
    }

    // Increment version if schema or layout is modified
    if (dto.schema || dto.layout) {
      template.version++;
    }

    // Update template properties
    if (dto.name) template.name = dto.name;
    if (dto.description) template.description = dto.description;
    if (dto.schema) template.schema = dto.schema;
    if (dto.layout) template.layout = dto.layout;

    // Update metadata
    template.metadata = {
      ...template.metadata,
      updatedAt: new Date()
    };

    return this.templateRepository.save(template);
  }

  /**
   * Retrieves a template by ID
   */
  async findById(id: string): Promise<Template> {
    const template = await this.templateRepository.findOne({
      where: { id },
      relations: ['creator', 'parentTemplate']
    });

    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }

    return template;
  }

  /**
   * Lists templates with optional filtering
   */
  async findAll(options: {
    userId?: string;
    isPublic?: boolean;
    category?: string;
    search?: string;
    tags?: string[];
  }): Promise<Template[]> {
    const where: FindOptionsWhere<Template> = {};

    if (options.userId) {
      where.createdBy = options.userId;
    }

    if (typeof options.isPublic === 'boolean') {
      where.isPublic = options.isPublic;
    }

    if (options.category) {
      where.category = options.category;
    }

    if (options.search) {
      where.name = Like(`%${options.search}%`);
    }

    if (options.tags?.length) {
      where.tags = In(options.tags);
    }

    return this.templateRepository.find({
      where,
      relations: ['creator'],
      order: {
        name: 'ASC'
      }
    });
  }

  /**
   * Deletes a template
   */
  async delete(id: string, userId: string): Promise<void> {
    const template = await this.templateRepository.findOne({
      where: { id, createdBy: userId }
    });

    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }

    // Check if any templates inherit from this one
    const children = await this.templateRepository.find({
      where: { parentTemplateId: id }
    });

    if (children.length > 0) {
      throw new ConflictException(
        `Cannot delete template: ${children.length} other template(s) inherit from it`
      );
    }

    await this.templateRepository.remove(template);
  }

  /**
   * Creates a new version of a template
   */
  async createVersion(id: string, userId: string): Promise<Template> {
    const template = await this.templateRepository.findOne({
      where: { id, createdBy: userId }
    });

    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }

    const newVersion = this.templateRepository.create({
      ...template,
      id: undefined, // Let the database generate a new ID
      name: `${template.name} v${template.version + 1}`,
      version: template.version + 1,
      metadata: {
        ...template.metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
        parentTemplate: template.id
      }
    });

    return this.templateRepository.save(newVersion);
  }

  /**
   * Validates a template schema and layout
   */
  private validateTemplate(template: CreateTemplateDto | UpdateTemplateDto): void {
    if (template.schema) {
      this.validateSchema(template.schema);
    }

    if (template.layout) {
      this.validateLayout(template.layout);
    }
  }

  /**
   * Validates template schema
   */
  private validateSchema(schema: CreateTemplateDto['schema']): void {
    if (!schema.nodes || Object.keys(schema.nodes).length === 0) {
      throw new Error('Schema must define at least one node type');
    }

    // Additional schema validation logic can be added here
  }

  /**
   * Validates template layout
   */
  private validateLayout(layout: CreateTemplateDto['layout']): void {
    if (!layout.sections || layout.sections.length === 0) {
      throw new Error('Layout must define at least one section');
    }

    // Validate each section
    for (const section of layout.sections) {
      if (!section.fields || section.fields.length === 0) {
        throw new Error(`Section "${section.name}" must define at least one field`);
      }

      // Validate that field types exist in schema
      // Additional layout validation logic can be added here
    }
  }
}
