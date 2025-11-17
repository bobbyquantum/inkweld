import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ProjectsService } from '../../api-client/api/projects.service';
import { Project } from '../../api-client/model/project';
import { LoggerService } from './logger.service';
import { MigrationService, MigrationStatus } from './migration.service';
import { OfflineProjectService } from './offline-project.service';
import { OfflineProjectElementsService } from './offline-project-elements.service';
import { SetupService } from './setup.service';

describe('MigrationService', () => {
  let service: MigrationService;
  let offlineProjectService: OfflineProjectService;

  const mockProjects: Project[] = [
    {
      id: 'offline-1',
      title: 'Test Project 1',
      slug: 'test-project-1',
      description: 'Test description 1',
      username: 'testuser',
      createdDate: '2024-01-01',
      updatedDate: '2024-01-01',
    },
  ];

  beforeEach(() => {
    const projectsServiceMock = {
      postApiV1Projects: () => of(mockProjects[0]),
    };

    const loggerMock = {
      info: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {},
    };

    const setupServiceMock = {};
    const offlineElementsServiceMock = {};
    const offlineProjectServiceMock = {
      projects: signal<Project[]>([]),
      deleteProject: () => {},
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        MigrationService,
        { provide: OfflineProjectService, useValue: offlineProjectServiceMock },
        { provide: ProjectsService, useValue: projectsServiceMock },
        { provide: LoggerService, useValue: loggerMock },
        { provide: SetupService, useValue: setupServiceMock },
        {
          provide: OfflineProjectElementsService,
          useValue: offlineElementsServiceMock,
        },
      ],
    });

    service = TestBed.inject(MigrationService);
    offlineProjectService = TestBed.inject(OfflineProjectService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have initial migration state', () => {
    const state = service.migrationState();
    expect(state.status).toBe(MigrationStatus.NotStarted);
    expect(state.totalProjects).toBe(0);
    expect(state.completedProjects).toBe(0);
    expect(state.failedProjects).toBe(0);
  });

  it('should return false when no offline projects exist', () => {
    expect(service.hasOfflineProjects()).toBe(false);
    expect(service.getOfflineProjectsCount()).toBe(0);
  });

  it('should detect offline projects when they exist', () => {
    offlineProjectService.projects.set(mockProjects);
    expect(service.hasOfflineProjects()).toBe(true);
    expect(service.getOfflineProjectsCount()).toBe(1);
  });

  it('should reset migration state', () => {
    service.migrationState.set({
      status: MigrationStatus.Completed,
      totalProjects: 5,
      completedProjects: 3,
      failedProjects: 2,
      projectStatuses: [],
    });

    service.resetMigrationState();

    const state = service.migrationState();
    expect(state.status).toBe(MigrationStatus.NotStarted);
    expect(state.totalProjects).toBe(0);
    expect(state.completedProjects).toBe(0);
    expect(state.failedProjects).toBe(0);
  });
});
