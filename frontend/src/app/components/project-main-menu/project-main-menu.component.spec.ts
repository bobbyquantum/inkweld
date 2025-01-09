import { HttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { ProjectMainMenuComponent } from './project-main-menu.component';

describe('ProjectMainMenuComponent', () => {
  let component: ProjectMainMenuComponent;
  let fixture: ComponentFixture<ProjectMainMenuComponent>;
  let httpClientMock: jest.Mocked<HttpClient>;
  let routerMock: jest.Mocked<Router>;

  beforeEach(async () => {
    httpClientMock = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<HttpClient>;

    routerMock = {
      navigate: jest.fn(),
    } as unknown as jest.Mocked<Router>;

    await TestBed.configureTestingModule({
      imports: [ProjectMainMenuComponent],
      providers: [
        { provide: HttpClient, useValue: httpClientMock },
        { provide: Router, useValue: routerMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectMainMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('onExitClick', () => {
    it('should navigate to home page', () => {
      component.onExitClick();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/']);
    });
  });
});
