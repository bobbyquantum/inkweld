import { HttpClient } from '@angular/common/http';
import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { ProjectTreeService } from '@services/project-tree.service';
import { BehaviorSubject, of } from 'rxjs';
import { Project, ProjectAPIService, ProjectElementDto } from 'worm-api-client';

import { ProjectComponent } from './project.component';

describe('ProjectComponent', () => {
  let component: ProjectComponent;
  let fixture: ComponentFixture<ProjectComponent>;
  let projectService: jest.Mocked<ProjectAPIService>;
  let treeService: jest.Mocked<ProjectTreeService>;
  let snackBar: jest.Mocked<MatSnackBar>;
  let elementsSignal: WritableSignal<ProjectElementDto[]>;
  let loadingSignal: WritableSignal<boolean>;
  let savingSignal: WritableSignal<boolean>;
  let errorSignal: WritableSignal<string | undefined>;
  let httpClientMock: jest.Mocked<HttpClient>;
  let routeParams: BehaviorSubject<{ username: string; slug: string }>;

  const mockProject: Project = {
    id: '1',
    title: 'Test Project',
    description: 'A test project',
    slug: 'test-project',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
  };

  beforeEach(async () => {
    projectService = {
      getProjectByUsernameAndSlug: jest.fn(),
    } as unknown as jest.Mocked<ProjectAPIService>;

    httpClientMock = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<HttpClient>;

    // Create writable signals
    elementsSignal = signal<ProjectElementDto[]>([]);
    loadingSignal = signal(false);
    savingSignal = signal(false);
    errorSignal = signal<string | undefined>(undefined);

    treeService = {
      elements: elementsSignal,
      isLoading: loadingSignal,
      isSaving: savingSignal,
      error: errorSignal,
      loadProjectElements: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ProjectTreeService>;

    snackBar = {
      open: jest.fn(),
    } as unknown as jest.Mocked<MatSnackBar>;

    // Create route params subject
    routeParams = new BehaviorSubject({
      username: 'testuser',
      slug: 'test-project',
    });

    await TestBed.configureTestingModule({
      imports: [ProjectComponent, NoopAnimationsModule],
      providers: [
        { provide: HttpClient, useValue: httpClientMock },
        { provide: ProjectAPIService, useValue: projectService },
        { provide: ProjectTreeService, useValue: treeService },
        { provide: MatSnackBar, useValue: snackBar },
        {
          provide: ActivatedRoute,
          useValue: { params: routeParams.asObservable() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    routeParams.complete();
    jest.clearAllMocks();
  });

  it('should create', done => {
    (projectService.getProjectByUsernameAndSlug as jest.Mock).mockReturnValue(
      of(mockProject)
    );
    fixture.detectChanges();
    setTimeout(() => {
      expect(component).toBeTruthy();
      done();
    });
  });

  it('should load project and elements on init', done => {
    (projectService.getProjectByUsernameAndSlug as jest.Mock).mockReturnValue(
      of(mockProject)
    );

    fixture.detectChanges();
    setTimeout(() => {
      expect(projectService.getProjectByUsernameAndSlug).toHaveBeenCalledWith(
        'testuser',
        'test-project'
      );
      expect(treeService.loadProjectElements).toHaveBeenCalledWith(
        'testuser',
        'test-project'
      );
      expect(component.project).toEqual(mockProject);
      done();
    });
  });

  it('should handle null project response', done => {
    (projectService.getProjectByUsernameAndSlug as jest.Mock).mockReturnValue(
      of(null)
    );

    fixture.detectChanges();
    setTimeout(() => {
      expect(component.project).toBeNull();
      done();
    });
  });

  it('should handle route params changes', done => {
    (projectService.getProjectByUsernameAndSlug as jest.Mock).mockReturnValue(
      of(mockProject)
    );

    fixture.detectChanges();
    setTimeout(() => {
      // Change route params
      routeParams.next({ username: 'newuser', slug: 'new-project' });
      setTimeout(() => {
        expect(projectService.getProjectByUsernameAndSlug).toHaveBeenCalledWith(
          'newuser',
          'new-project'
        );
        done();
      });
    });
  });

  it('should show loading state while loading project and elements', done => {
    loadingSignal.set(true);
    (projectService.getProjectByUsernameAndSlug as jest.Mock).mockReturnValue(
      of(mockProject)
    );

    fixture.detectChanges();
    setTimeout(() => {
      expect(component.isLoading()).toBe(true);
      loadingSignal.set(false);
      expect(component.isLoading()).toBe(false);
      done();
    });
  });
});
