/* eslint-disable @typescript-eslint/unbound-method */
import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import type {
  CreateTemplateDto,
  TemplateSectionDto,
} from '../../../api-client/model/models';
import { TemplateSchemaService } from '../../services/template-schema.service';
import {
  type SafeTemplateDto,
  TemplateStoreService,
} from '../../services/template-store.service';

interface TemplateFormGroup {
  name: FormControl<string>;
  description: FormControl<string>;
  version: FormControl<number>;
}

@Component({
  selector: 'app-template-builder',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './template-builder.component.html',
  styleUrls: ['./template-builder.component.scss'],
})
export class TemplateBuilderComponent implements OnInit {
  @Input() template?: SafeTemplateDto;
  @Output() saved = new EventEmitter<CreateTemplateDto>();
  @Output() cancelled = new EventEmitter<void>();

  form: FormGroup<TemplateFormGroup>;
  sections: TemplateSectionDto[] = [];
  saving = false;

  private readonly fb = inject(FormBuilder);
  private readonly templateStore = inject(TemplateStoreService);
  private readonly schemaService = inject(TemplateSchemaService);

  constructor() {
    this.form = this.fb.group<TemplateFormGroup>({
      name: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      description: new FormControl('', { nonNullable: true }),
      version: new FormControl(1, { nonNullable: true }),
    });
  }

  ngOnInit(): void {
    if (this.template) {
      this.form.patchValue({
        name: this.template.name,
        description: this.template.description,
        version: this.template.version,
      });

      this.sections = this.template.layout.sections.map(
        section =>
          ({
            id: section.id,
            name: section.name,
            fields: section.fields.map(field => ({
              id: field.id,
              name: field.name,
              type: field.type,
            })),
            layout: {
              type: section.layout.type,
              gap: section.layout.gap,
              columns: section.layout.columns,
              styles: section.layout.styles ?? {},
            },
          }) as TemplateSectionDto
      );
    }
  }

  addSection(): void {
    // TODO: Open section editor dialog
  }

  editSection(section: TemplateSectionDto): void {
    // TODO: Open section editor dialog with existing section
    // Section parameter will be used when dialog implementation is added
    void section;
  }

  removeSection(id: string): void {
    this.sections = this.sections.filter(s => s.id !== id);
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  onSubmit(): void {
    if (this.form.invalid) return;

    this.saving = true;
    try {
      const formValue = this.form.getRawValue();
      const templateData: CreateTemplateDto = {
        name: formValue.name,
        description: formValue.description,
        version: formValue.version,
        schema: {
          nodes: {},
        },
        layout: {
          sections: this.sections,
          styles: {},
        },
      };

      this.saved.emit(templateData);
    } finally {
      this.saving = false;
    }
  }
}
