import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HomeComponent } from './home.component';
import { ThemeService } from '@themes/theme.service';
import {
  UserAPIService,
  ProjectAPIService,
  User,
  Project,
} from 'worm-api-client';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Observable, of } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { provideLocationMocks } from '@angular/common/testing';
import { HttpClient } from '@angular/common/http';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let themeServiceMock: jasmine.SpyObj<ThemeService>;
  let userServiceMock: jasmine.SpyObj<UserAPIService>;
  let projectServiceMock: jasmine.SpyObj<ProjectAPIService>;
  let breakpointObserverMock: jasmine.SpyObj<BreakpointObserver>;
  let httpClientMock: jasmine.SpyObj<HttpClient>;

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

    httpClientMock = jasmine.createSpyObj('HttpClient', [
      'get',
      'post',
      'put',
      'delete',
    ]);

    userServiceMock = jasmine.createSpyObj<UserAPIService>('UserAPIService', [
      'getCurrentUser',
    ]);
    const getCurrentUserSpy = userServiceMock.getCurrentUser as jasmine.Spy<
      (observe: 'body') => Observable<User>
    >;
    getCurrentUserSpy.and.returnValue(of({} as User));

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
        { provide: HttpClient, useValue: httpClientMock },
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
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should fetch current user on init', () => {
    component.ngOnInit();
    expect(userServiceMock.getCurrentUser).toHaveBeenCalled();
  });

  it('should fetch all projects on init', () => {
    component.ngOnInit();
    expect(projectServiceMock.getAllProjects).toHaveBeenCalled();
  });

  it('should setup breakpoint observer on init', () => {
    component.ngOnInit();
    expect(breakpointObserverMock.observe).toHaveBeenCalledWith([
      Breakpoints.XSmall,
      Breakpoints.Small,
    ]);
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

  it('should set isMobile to true when breakpoint matches', () => {
    breakpointObserverMock.observe.and.returnValue(
      of({ matches: true, breakpoints: {} })
    );
    component.ngOnInit();
    expect(component.isMobile).toBe(true);
  });

  it('should set isMobile to false when breakpoint does not match', () => {
    breakpointObserverMock.observe.and.returnValue(
      of({ matches: false, breakpoints: {} })
    );
    component.ngOnInit();
    expect(component.isMobile).toBe(false);
  });
});
