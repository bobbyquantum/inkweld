import { HttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProjectMainMenuComponent } from './project-main-menu.component';

describe('ProjectMainMenuComponent', () => {
  let component: ProjectMainMenuComponent;
  let fixture: ComponentFixture<ProjectMainMenuComponent>;
  let httpClientMock: jest.Mocked<HttpClient>;

  beforeEach(async () => {
    httpClientMock = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<HttpClient>;

    await TestBed.configureTestingModule({
      imports: [ProjectMainMenuComponent],
      providers: [{ provide: HttpClient, useValue: httpClientMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectMainMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
