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
import { XsrfService } from 'app/app.config';
import { of, throwError } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let themeServiceMock: jasmine.SpyObj<ThemeService>;
  let userServiceMock: jasmine.SpyObj<UserAPIService>;
  let projectServiceMock: jasmine.SpyObj<ProjectAPIService>;
  let breakpointObserverMock: jasmine.SpyObj<BreakpointObserver>;
  let xsrfServiceMock: jasmine.SpyObj<XsrfService>;

  beforeEach(async () => {
    themeServiceMock = jasmine.createSpyObj('ThemeService', [
      'update',
      'isDarkMode',
    ]);
    userServiceMock = jasmine.createSpyObj('UserAPIService', [
      'getCurrentUser',
    ]);
    projectServiceMock = jasmine.createSpyObj('ProjectAPIService', [
      'getAllProjects',
      'createProject',
    ]);
    breakpointObserverMock = jasmine.createSpyObj('BreakpointObserver', [
      'observe',
    ]);
    xsrfServiceMock = jasmine.createSpyObj('XsrfService', ['getXsrfToken']);

    userServiceMock.getCurrentUser.and.returnValue(
      of(new HttpResponse<User>({ body: {} as User }))
    );
    projectServiceMock.getAllProjects.and.returnValue(
      of(new HttpResponse<Project[]>({ body: [] }))
    );

    breakpointObserverMock.observe.and.returnValue(
      of({ matches: true, breakpoints: {} })
    );

    await TestBed.configureTestingModule({
      imports: [
        HomeComponent,
        NoopAnimationsModule,
        RouterTestingModule.withRoutes([
          { path: '', component: HomeComponent },
          { path: 'project/:id', component: HomeComponent },
        ]),
      ],
      providers: [
        { provide: ThemeService, useValue: themeServiceMock },
        { provide: UserAPIService, useValue: userServiceMock },
        { provide: ProjectAPIService, useValue: projectServiceMock },
        { provide: BreakpointObserver, useValue: breakpointObserverMock },
        { provide: XsrfService, useValue: xsrfServiceMock },
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

  it('should toggle theme', () => {
    themeServiceMock.isDarkMode.and.returnValue(true);
    component.toggleTheme();
    expect(themeServiceMock.update).toHaveBeenCalledWith('light-theme');

    themeServiceMock.isDarkMode.and.returnValue(false);
    component.toggleTheme();
    expect(themeServiceMock.update).toHaveBeenCalledWith('dark-theme');
  });

  it('should add project', async () => {
    const mockProject: Project = {
      id: '1',
      title: 'Test Project',
      createdDate: new Date().toISOString(),
    };
    projectServiceMock.createProject.and.returnValue(
      of(new HttpResponse<Project>({ body: mockProject }))
    );
    xsrfServiceMock.getXsrfToken.and.returnValue('test-token');

    await component.addProject();

    expect(xsrfServiceMock.getXsrfToken).toHaveBeenCalled();
    expect(projectServiceMock.createProject).toHaveBeenCalledWith(
      'test-token',
      { title: 'hello2' }
    );
  });

  it('should handle error when adding project', async () => {
    const errorResponse = new HttpErrorResponse({
      error: 'Error',
      status: 400,
    });
    projectServiceMock.createProject.and.returnValue(
      throwError(() => errorResponse)
    );
    spyOn(console, 'error');

    await component.addProject();

    expect(console.error).toHaveBeenCalledWith(errorResponse);
  });
});
