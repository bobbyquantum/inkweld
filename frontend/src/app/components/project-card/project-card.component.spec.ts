import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProjectCardComponent } from './project-card.component';
import { Project } from 'worm-api-client';

describe('ProjectCardComponent', () => {
  let component: ProjectCardComponent;
  let fixture: ComponentFixture<ProjectCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectCardComponent],
      providers: [],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectCardComponent);
    component = fixture.componentInstance;

    component.project = {
      id: 1,
      title: 'Test Project',
      createdDate: new Date().toISOString(),
      user: { name: 'test', username: 'testuser' },
      slug: 'test-project',
    } as Project;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display project title', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('mat-card-title')?.textContent).toContain(
      'Test Project'
    );
  });

  it('should display project creation date', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('mat-card-subtitle')?.textContent).toContain(
      'Created:'
    );
  });

  it('should have correct routerLink', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const cardElement = compiled.querySelector('mat-card');
    expect(cardElement?.getAttribute('ng-reflect-router-link')).toBe(
      '/project,testuser,test-project'
    );
  });
});
