import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewProjectComponent } from './new-project.component';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Configuration, ProjectAPIService } from 'worm-api-client';
import { of } from 'rxjs';

describe('NewProjectComponent', () => {
  let component: NewProjectComponent;
  let fixture: ComponentFixture<NewProjectComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewProjectComponent],
      providers: [
        provideNoopAnimations(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {},
        },
        {
          provide: ProjectAPIService,
          useValue: {
            createProject: jasmine
              .createSpy('createProject')
              .and.returnValue(of({})),
          },
        },
        {
          provide: Configuration,
          useValue: {},
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NewProjectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
