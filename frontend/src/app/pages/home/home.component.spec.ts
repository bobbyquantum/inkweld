import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HomeComponent } from './home.component';
import { ThemeService } from '@themes/theme.service';
import {
  UserAPIService,
  ProjectAPIService,
  User,
  Project,
} from 'worm-api-client';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Observable, of } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { provideLocationMocks } from '@angular/common/testing';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let themeServiceMock: jasmine.SpyObj<ThemeService>;
  let userServiceMock: jasmine.SpyObj<UserAPIService>;
  let projectServiceMock: jasmine.SpyObj<ProjectAPIService>;
  let breakpointObserverMock: jasmine.SpyObj<BreakpointObserver>;

  beforeEach(async () => {
    themeServiceMock = jasmine.createSpyObj('ThemeService', [
      'update',
      'isDarkMode',
    ]);
    breakpointObserverMock = jasmine.createSpyObj('BreakpointObserver', [
      'observe',
    ]);
    breakpointObserverMock.observe.and.returnValue(
      of({ matches: true, breakpoints: {} })
    );

    //user service mock
    userServiceMock = jasmine.createSpyObj<UserAPIService>('UserAPIService', [
      'getCurrentUser',
    ]);
    const getCurrentUserSpy = userServiceMock.getCurrentUser as jasmine.Spy<
      (observe: 'body') => Observable<User>
    >;
    getCurrentUserSpy.and.returnValue(of({} as User));

    //project mock
    projectServiceMock = jasmine.createSpyObj<ProjectAPIService>(
      'ProjectAPIService',
      ['getAllProjects', 'createProject']
    );
    const getAllProjectsSpy = projectServiceMock.getAllProjects as jasmine.Spy<
      (observe: 'body') => Observable<Project[]>
    >;
    getAllProjectsSpy.and.returnValue(of([] as Project[]));

    await TestBed.configureTestingModule({
      imports: [HomeComponent, NoopAnimationsModule],
      providers: [
        provideRouter([
          { path: '', component: HomeComponent },
          { path: 'project/:id', component: HomeComponent },
        ]),
        provideLocationMocks(),
        { provide: ThemeService, useValue: themeServiceMock },
        { provide: UserAPIService, useValue: userServiceMock },
        { provide: ProjectAPIService, useValue: projectServiceMock },
        { provide: BreakpointObserver, useValue: breakpointObserverMock },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: '123' })),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should fetch current user on init', () => {
    expect(userServiceMock.getCurrentUser).toHaveBeenCalled();
  });

  it('should fetch all projects on init', () => {
    expect(projectServiceMock.getAllProjects).toHaveBeenCalled();
  });

  it('should select a project', () => {
    const project = { id: 123, name: 'Test Project' } as Project;
    component.selectProject(project);
    expect(component.selectedProject).toEqual(project);
  });

  it('should back to list', () => {
    component.backToList();
    expect(component.selectedProject).toBeNull();
  });
});
