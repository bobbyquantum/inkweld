import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProjectComponent } from './project.component';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Editor } from 'ngx-editor';
import { provideRouter } from '@angular/router';
import { Project, ProjectAPIService } from 'worm-api-client';
import { Observable, of } from 'rxjs';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

jest.mock('worm-api-client');
jest.mock('ngx-editor');

describe('ProjectComponent', () => {
  let component: ProjectComponent;
  let fixture: ComponentFixture<ProjectComponent>;
  let projectService: jest.Mocked<ProjectAPIService>;

  beforeEach(async () => {
    projectService = {
      getProjectByUsernameAndSlug: jest.fn().mockReturnValue(of({} as Project)),
    } as unknown as jest.Mocked<ProjectAPIService>;

    await TestBed.configureTestingModule({
      imports: [ProjectComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Editor,
          useValue: {
            setContent: jest.fn(),
            destroy: jest.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
