import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { ProjectElementDto } from '../../../api-client/model/project-element-dto';

interface NewElementForm {
  name: FormControl<string>;
  type: FormControl<ProjectElementDto.TypeEnum>;
  file: FormControl<File | null>;
}
export interface NewElementDialogResult {
  name: string;
  type: ProjectElementDto.TypeEnum;
  file: File | null;
}
@Component({
  selector: 'app-new-element-dialog',
  templateUrl: './new-element-dialog.component.html',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
  ],
})
export class NewElementDialogComponent {
  readonly elementTypes: ProjectElementDto.TypeEnum[] = [
    ProjectElementDto.TypeEnum.Folder,
    ProjectElementDto.TypeEnum.Item,
    ProjectElementDto.TypeEnum.Image,
  ];

  readonly form: FormGroup<NewElementForm>;
  private readonly dialogRef = inject(
    MatDialogRef<NewElementDialogComponent, NewElementDialogResult>
  );

  constructor() {
    this.form = new FormGroup<NewElementForm>({
      name: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      type: new FormControl<ProjectElementDto.TypeEnum>(
        ProjectElementDto.TypeEnum.Item,
        {
          nonNullable: true,
          validators: [Validators.required],
        }
      ),
      file: new FormControl<File | null>(null),
    });
  }

  onFileChange = (event: Event): void => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.form.controls.file.setValue(file);
    }
  };

  onCancel = (): void => {
    this.dialogRef.close();
  };

  onCreate = (): void => {
    if (this.form.valid) {
      const result: NewElementDialogResult = {
        name: this.form.controls.name.value,
        type: this.form.controls.type.value,
        file: this.form.controls.file.value,
      };
      this.dialogRef.close(result);
    }
  };
}
