import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Project } from '@inkweld/index';

import { environment } from '../../../environments/environment';
import { ProjectCoverComponent } from './project-cover.component';

describe('ProjectCoverComponent', () => {
  let component: ProjectCoverComponent;
  let fixture: ComponentFixture<ProjectCoverComponent>;

  const mockProject: Project = {
    id: '1',
    title: 'Test Project',
    slug: 'test-project',
    username: 'testuser',
    description: 'A test project',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
    coverImage: 'cover.png',
  };

  const mockProjectNoCover: Project = {
    id: '2',
    title: 'No Cover Project',
    slug: 'no-cover-project',
    username: 'testuser',
    description: 'A test project without cover',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
    coverImage: null,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectCoverComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectCoverComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('hasCover', () => {
    it('should return true when project has coverImage', () => {
      component.project = mockProject;
      expect(component.hasCover).toBe(true);
    });

    it('should return false when project has no coverImage', () => {
      component.project = mockProjectNoCover;
      expect(component.hasCover).toBe(false);
    });

    it('should return false when project is undefined', () => {
      component.project = undefined as unknown as Project;
      expect(component.hasCover).toBe(false);
    });

    it('should return true when coverImage is empty string (truthy check)', () => {
      // Note: empty string passes != null check, but might not be ideal
      component.project = { ...mockProject, coverImage: '' };
      expect(component.hasCover).toBe(true);
    });
  });

  describe('coverUrl', () => {
    it('should return correct URL when project has cover', () => {
      component.project = mockProject;
      const url = component.coverUrl;

      const expectedBaseUrl = environment.production
        ? window.location.origin
        : environment.apiUrl;
      expect(url).toBe(
        `${expectedBaseUrl}/api/v1/projects/testuser/test-project/cover`
      );
    });

    it('should return null when project has no cover', () => {
      component.project = mockProjectNoCover;
      expect(component.coverUrl).toBeNull();
    });

    it('should return null when project is undefined', () => {
      component.project = undefined as unknown as Project;
      expect(component.coverUrl).toBeNull();
    });
  });

  describe('variant input', () => {
    it('should default to card variant', () => {
      expect(component.variant).toBe('card');
    });

    it('should accept list variant', () => {
      component.variant = 'list';
      expect(component.variant).toBe('list');
    });

    it('should accept small variant', () => {
      component.variant = 'small';
      expect(component.variant).toBe('small');
    });
  });
});
