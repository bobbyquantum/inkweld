import { BreakpointObserver } from '@angular/cdk/layout';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { ProjectDto, UserDto } from '@inkweld/index';
import { ProjectService } from '@services/project.service';
import { UserService } from '@services/user.service';
import { of, Subject } from 'rxjs';

import { UserProfileComponent } from './user-profile.component';

describe('UserProfileComponent', () => {
  let component: UserProfileComponent;
  let fixture: ComponentFixture<UserProfileComponent>;
  let subjectCompleteSpy: jest.SpyInstance;
  let subjectNextSpy: jest.SpyInstance;
  let userService: jest.Mocked<UserService>;
  let breakpointObserver: jest.Mocked<BreakpointObserver>;
  let projectService: Partial<ProjectService>;

  const activatedRouteMock = {
    paramMap: of({
      get: (param: string) => {
        if (param === 'username') {
          return 'testuser';
        }
        return null;
      },
    }),
  };

  beforeEach(async () => {
    // Spy on Subject's next and complete methods
    const originalSubject = Subject.prototype;
    subjectNextSpy = jest.spyOn(originalSubject, 'next');
    subjectCompleteSpy = jest.spyOn(originalSubject, 'complete');

    // Mock UserService similar to HomeComponent
    userService = {
      currentUser: signal<UserDto>({ name: 'Test User', username: 'testuser' }),
    } as unknown as jest.Mocked<UserService>;

    // Mock BreakpointObserver
    breakpointObserver = {
      observe: jest
        .fn()
        .mockReturnValue(of({ matches: false, breakpoints: {} })),
    } as unknown as jest.Mocked<BreakpointObserver>;

    // Mock ProjectService to avoid service injection issues
    projectService = {
      loadAllProjects: jest.fn().mockResolvedValue(undefined),
      projects: signal<ProjectDto[]>([]),
    };

    await TestBed.configureTestingModule({
      imports: [UserProfileComponent, NoopAnimationsModule],
      providers: [
        { provide: ActivatedRoute, useValue: activatedRouteMock },
        { provide: UserService, useValue: userService },
        { provide: BreakpointObserver, useValue: breakpointObserver },
        { provide: ProjectService, useValue: projectService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should extract username from route params', () => {
    expect(component.username).toBe('testuser');
  });

  it('should properly clean up subscriptions when destroyed', () => {
    // Act - trigger ngOnDestroy
    component.ngOnDestroy();

    // Assert - verify the destroy subject was called
    expect(subjectNextSpy).toHaveBeenCalled();
    expect(subjectCompleteSpy).toHaveBeenCalled();
  });
});
