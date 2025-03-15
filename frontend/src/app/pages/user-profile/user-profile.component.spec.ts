import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, Subject } from 'rxjs';

import { UserProfileComponent } from './user-profile.component';

describe('UserProfileComponent', () => {
  let component: UserProfileComponent;
  let fixture: ComponentFixture<UserProfileComponent>;
  let subjectCompleteSpy: jest.SpyInstance;
  let subjectNextSpy: jest.SpyInstance;

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

    await TestBed.configureTestingModule({
      imports: [UserProfileComponent],
      providers: [{ provide: ActivatedRoute, useValue: activatedRouteMock }],
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
    fixture.destroy();

    // Assert - verify the destroy subject was called
    expect(subjectNextSpy).toHaveBeenCalled();
    expect(subjectCompleteSpy).toHaveBeenCalled();
  });
});
