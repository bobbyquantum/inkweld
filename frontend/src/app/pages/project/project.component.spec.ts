import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProjectComponent } from './project.component';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Editor } from 'ngx-editor';
import { provideRouter } from '@angular/router';
import { Project, ProjectAPIService } from 'worm-api-client';
import { Observable, of } from 'rxjs';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

describe('ProjectComponent', () => {
  let component: ProjectComponent;
  let fixture: ComponentFixture<ProjectComponent>;
  let projectServiceMock: jasmine.SpyObj<ProjectAPIService>;
  beforeEach(async () => {
    projectServiceMock = jasmine.createSpyObj<ProjectAPIService>(
      'ProjectAPIService',
      ['getProjectByUsernameAndSlug']
    );
    const getProjectByUsernameAndSlugSpy =
      projectServiceMock.getProjectByUsernameAndSlug as jasmine.Spy<
        (username: string, slug: string, observe: 'body') => Observable<Project>
      >;
    getProjectByUsernameAndSlugSpy.and.returnValue(of({} as Project));
    await TestBed.configureTestingModule({
      imports: [ProjectComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Editor,
          useValue: {
            setContent: jasmine.createSpy('setContent'),
            destroy: jasmine.createSpy('destroy'),
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
