import { DatePipe } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProjectAPIService } from '../../../../api-client/api/project-api.service';
import { ImageElementEditorComponent } from './image-element-editor.component';

describe('ImageElementEditorComponent', () => {
  let component: ImageElementEditorComponent;
  let fixture: ComponentFixture<ImageElementEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        DatePipe,
        ProjectAPIService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
      imports: [ImageElementEditorComponent, DatePipe],
    }).compileComponents();

    fixture = TestBed.createComponent(ImageElementEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
