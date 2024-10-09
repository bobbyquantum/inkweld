import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProjectMainMenuComponent } from './project-main-menu.component';

describe('ProjectMainMenuComponent', () => {
  let component: ProjectMainMenuComponent;
  let fixture: ComponentFixture<ProjectMainMenuComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectMainMenuComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectMainMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
