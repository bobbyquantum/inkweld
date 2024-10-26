import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProjectMainMenuComponent } from './project-main-menu.component';
import { HttpClient } from '@angular/common/http';

describe('ProjectMainMenuComponent', () => {
  let component: ProjectMainMenuComponent;
  let fixture: ComponentFixture<ProjectMainMenuComponent>;
  let httpClientMock: jasmine.SpyObj<HttpClient>;

  beforeEach(async () => {
    httpClientMock = jasmine.createSpyObj('HttpClient', [
      'get',
      'post',
      'put',
      'delete',
    ]);
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
