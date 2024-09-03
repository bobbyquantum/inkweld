import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProjectComponent } from './project.component';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Editor } from 'ngx-editor';

describe('ProjectComponent', () => {
  let component: ProjectComponent;
  let fixture: ComponentFixture<ProjectComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectComponent, NoopAnimationsModule],
      providers: [
        {
          provide: Editor,
          useValue: {
            setContent: jasmine.createSpy('setContent'),
            destroy: jasmine.createSpy('destroy'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
