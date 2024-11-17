import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { HttpClient } from '@angular/common/http';
import { provideLocationMocks } from '@angular/common/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { ThemeService } from '@themes/theme.service';
import { of } from 'rxjs';
import {
  Project,
  ProjectAPIService,
  User,
  UserAPIService,
} from 'worm-api-client';

import { HomeComponent } from './home.component';

jest.mock('@themes/theme.service');
jest.mock('worm-api-client');
jest.mock('@angular/cdk/layout');

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let themeService: jest.Mocked<ThemeService>;
  let userService: jest.Mocked<UserAPIService>;
  let projectService: jest.Mocked<ProjectAPIService>;
  let breakpointObserver: jest.Mocked<BreakpointObserver>;
  let httpClient: jest.Mocked<HttpClient>;

  beforeEach(async () => {
    themeService = {
      update: jest.fn(),
      isDarkMode: jest.fn(),
    } as unknown as jest.Mocked<ThemeService>;

    breakpointObserver = {
      observe: jest
        .fn()
        .mockReturnValue(of({ matches: true, breakpoints: {} })),
    } as unknown as jest.Mocked<BreakpointObserver>;

    httpClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<HttpClient>;

    userService = {
      getCurrentUser: jest.fn().mockReturnValue(of({} as User)),
    } as unknown as jest.Mocked<UserAPIService>;

    projectService = {
      getAllProjects: jest.fn().mockReturnValue(of([] as Project[])),
      createProject: jest.fn(),
    } as unknown as jest.Mocked<ProjectAPIService>;

    await TestBed.configureTestingModule({
      imports: [HomeComponent, NoopAnimationsModule],
      providers: [
        provideRouter([
          { path: '', component: HomeComponent },
          { path: 'project/:id', component: HomeComponent },
        ]),
        provideLocationMocks(),
        { provide: ThemeService, useValue: themeService },
        { provide: UserAPIService, useValue: userService },
        { provide: ProjectAPIService, useValue: projectService },
        { provide: BreakpointObserver, useValue: breakpointObserver },
        { provide: HttpClient, useValue: httpClient },
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
    expect(userService.getCurrentUser).toHaveBeenCalled();
  });

  it('should fetch all projects on init', () => {
    component.ngOnInit();
    expect(projectService.getAllProjects).toHaveBeenCalled();
  });

  it('should setup breakpoint observer on init', () => {
    component.ngOnInit();
    expect(breakpointObserver.observe).toHaveBeenCalledWith([
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
    breakpointObserver.observe.mockReturnValue(
      of({ matches: true, breakpoints: {} })
    );
    component.ngOnInit();
    expect(component.isMobile).toBe(true);
  });

  it('should set isMobile to false when breakpoint does not match', () => {
    breakpointObserver.observe.mockReturnValue(
      of({ matches: false, breakpoints: {} })
    );
    component.ngOnInit();
    expect(component.isMobile).toBe(false);
  });
});
