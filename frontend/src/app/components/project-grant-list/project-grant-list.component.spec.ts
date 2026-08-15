import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { beforeEach, describe, expect, it } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  ProjectGrantListComponent,
  type ProjectGrantRow,
} from './project-grant-list.component';

describe('ProjectGrantListComponent', () => {
  let component: ProjectGrantListComponent;
  let fixture: ComponentFixture<ProjectGrantListComponent>;

  const grants: ProjectGrantRow[] = [
    {
      projectId: 'proj-1',
      projectTitle: 'My Novel',
      projectSlug: 'my-novel',
      role: 'viewer',
      selected: true,
    },
    {
      projectId: 'proj-2',
      projectTitle: 'Short Stories',
      projectSlug: 'short-stories',
      role: 'editor',
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        ProjectGrantListComponent,
        translocoTestProvider(),
        MatCheckboxModule,
        MatSelectModule,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectGrantListComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('grants', grants);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render a row per grant with title and slug', () => {
    const rows = fixture.nativeElement.querySelectorAll(
      '[data-testid="project-grant-role-select"]'
    );
    expect(rows).toHaveLength(2);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('My Novel');
    expect(text).toContain('Short Stories');
  });

  it('should emit roleChange when a role changes', () => {
    const spy = vi.fn();
    component.roleChange.subscribe(spy);
    component.onRoleChange('proj-1', 'admin');
    expect(spy).toHaveBeenCalledWith({ projectId: 'proj-1', role: 'admin' });
  });

  it('should emit selectionChange when a checkbox toggles (consent mode)', () => {
    fixture.componentRef.setInput('showSelect', true);
    fixture.detectChanges();
    const spy = vi.fn();
    component.selectionChange.subscribe(spy);
    component.onSelectionChange('proj-2', true);
    expect(spy).toHaveBeenCalledWith({ projectId: 'proj-2', selected: true });
  });

  it('should emit remove when the remove button is clicked (management mode)', () => {
    fixture.componentRef.setInput('showRemove', true);
    fixture.detectChanges();
    const spy = vi.fn();
    component.remove.subscribe(spy);
    const buttons = fixture.nativeElement.querySelectorAll(
      '[data-testid="project-grant-remove"]'
    );
    expect(buttons).toHaveLength(2);
    buttons[0].click();
    expect(spy).toHaveBeenCalledWith('proj-1');
  });

  it('should emit allProjectsChange when the toggle changes', () => {
    fixture.componentRef.setInput('showAllProjects', true);
    fixture.detectChanges();
    const spy = vi.fn();
    component.allProjectsChange.subscribe(spy);
    component.onAllProjectsToggle(true);
    expect(spy).toHaveBeenCalledWith({
      accessAllProjects: true,
      defaultRole: 'viewer',
    });
  });

  it('should emit allProjectsChange with current role when default role changes', () => {
    fixture.componentRef.setInput('showAllProjects', true);
    fixture.componentRef.setInput('accessAllProjects', true);
    fixture.componentRef.setInput('defaultRole', 'editor');
    fixture.detectChanges();
    const spy = vi.fn();
    component.allProjectsChange.subscribe(spy);
    component.onDefaultRoleChange('admin');
    expect(spy).toHaveBeenCalledWith({
      accessAllProjects: true,
      defaultRole: 'admin',
    });
  });

  it('should get the correct role label i18n key', () => {
    expect(component.getRoleLabel('viewer')).toBe('auth.oauthConsent.viewOnly');
    expect(component.getRoleLabel('editor')).toBe(
      'auth.oauthConsent.viewAndEdit'
    );
    expect(component.getRoleLabel('admin')).toBe(
      'auth.oauthConsent.fullAccess'
    );
  });
});
