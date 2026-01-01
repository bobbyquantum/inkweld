import { signal } from '@angular/core';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { DocumentService } from '@services/project/document.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PresenceIndicatorComponent,
  PresenceUser,
} from './presence-indicator.component';

describe('PresenceIndicatorComponent', () => {
  let component: PresenceIndicatorComponent;
  let fixture: ComponentFixture<PresenceIndicatorComponent>;
  let documentService: Partial<DocumentService>;
  let projectStateService: Partial<ProjectStateService>;

  const createMockConnections = (
    users: Map<number, { user?: { name?: string; color?: string } }>,
    ownClientId = 0
  ) => [
    {
      documentId: 'doc1',
      provider: {
        awareness: {
          getStates: vi.fn().mockReturnValue(users),
          clientID: ownClientId,
        },
      },
    },
  ];

  beforeEach(async () => {
    const mockUsers = new Map([
      [1, { user: { name: 'Alice', color: '#ff0000' } }],
      [2, { user: { name: 'Bob', color: '#00ff00' } }],
    ]);

    documentService = {
      getActiveConnections: vi
        .fn()
        .mockReturnValue(createMockConnections(mockUsers)),
    };

    projectStateService = {
      project: signal({
        id: '1',
        title: 'Test',
        slug: 'test',
        username: 'user',
        createdDate: new Date().toISOString(),
        updatedDate: new Date().toISOString(),
      }),
    };

    await TestBed.configureTestingModule({
      imports: [PresenceIndicatorComponent, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DocumentService, useValue: documentService },
        { provide: ProjectStateService, useValue: projectStateService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PresenceIndicatorComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show active users', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    // Manually trigger update
    component['updatePresence']();
    fixture.detectChanges();

    expect(component['activeUsers']().length).toBe(2);
  });

  it('should return correct initials for usernames', () => {
    expect(component.getInitials('Alice')).toBe('AL');
    expect(component.getInitials('Bob Smith')).toBe('BS');
    expect(component.getInitials('john doe')).toBe('JD');
    expect(component.getInitials('')).toBe('?');
    expect(component.getInitials('a')).toBe('A');
  });

  it('should display maximum of MAX_DISPLAYED_USERS', async () => {
    // Mock many users
    const manyUsers = new Map<
      number,
      { user: { name: string; color: string } }
    >();
    for (let i = 0; i < 10; i++) {
      manyUsers.set(i + 1, { user: { name: `User${i}`, color: `#${i}00000` } });
    }

    (
      documentService.getActiveConnections as ReturnType<typeof vi.fn>
    ).mockReturnValue(createMockConnections(manyUsers));

    fixture.detectChanges();
    component['updatePresence']();
    fixture.detectChanges();
    await fixture.whenStable();

    // Should show MAX_DISPLAYED_USERS (5) users
    expect(component['displayedUsers']().length).toBeLessThanOrEqual(5);
    expect(component['overflowCount']()).toBeGreaterThan(0);
  });

  it('should generate color based on clientId', () => {
    const color1 = component['generateColor'](1);
    const color2 = component['generateColor'](2);
    const color3 = component['generateColor'](1);

    expect(color1).toMatch(/^hsl\(\d+(\.\d+)?,\s*\d+%,\s*\d+%\)$/);
    expect(color2).toMatch(/^hsl\(\d+(\.\d+)?,\s*\d+%,\s*\d+%\)$/);
    // Same clientId should generate same color
    expect(color1).toBe(color3);
  });

  it('should calculate overflow tooltip correctly', async () => {
    const manyUsers = new Map<
      number,
      { user: { name: string; color: string } }
    >();
    for (let i = 0; i < 8; i++) {
      manyUsers.set(i + 1, { user: { name: `User${i}`, color: `#${i}00000` } });
    }

    (
      documentService.getActiveConnections as ReturnType<typeof vi.fn>
    ).mockReturnValue(createMockConnections(manyUsers));

    fixture.detectChanges();
    component['updatePresence']();
    fixture.detectChanges();
    await fixture.whenStable();

    const tooltip = component['overflowTooltip']();
    expect(tooltip).toContain('User');
  });

  it('should not show presence indicator when no active users', async () => {
    (
      documentService.getActiveConnections as ReturnType<typeof vi.fn>
    ).mockReturnValue(createMockConnections(new Map()));

    fixture.detectChanges();
    component['updatePresence']();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component['activeUsers']().length).toBe(0);
  });

  it('should handle users without name gracefully', async () => {
    const mixedUsers = new Map<number, { user?: { name?: string } }>([
      [1, { user: {} }],
      [2, { user: { name: 'Valid' } }],
      [3, {}],
    ]);

    (
      documentService.getActiveConnections as ReturnType<typeof vi.fn>
    ).mockReturnValue(createMockConnections(mixedUsers));

    fixture.detectChanges();
    component['updatePresence']();
    fixture.detectChanges();
    await fixture.whenStable();

    // Should only count users with valid names
    const users = component['activeUsers']();
    expect(users.some((u: PresenceUser) => u.username === 'Valid')).toBe(true);
  });

  it('should handle no active connections', async () => {
    (
      documentService.getActiveConnections as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);

    fixture.detectChanges();
    component['updatePresence']();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component['activeUsers']().length).toBe(0);
  });

  it('should clean up on destroy', () => {
    fixture.detectChanges();
    component.ngOnDestroy();
    // Verify no errors during cleanup
    expect(component['pollInterval']).toBeNull();
  });

  it('should filter out own client ID', async () => {
    const mockUsers = new Map([
      [1, { user: { name: 'Alice', color: '#ff0000' } }],
      [2, { user: { name: 'Bob', color: '#00ff00' } }],
    ]);

    // Set own clientID to 1
    (
      documentService.getActiveConnections as ReturnType<typeof vi.fn>
    ).mockReturnValue(createMockConnections(mockUsers, 1));

    fixture.detectChanges();
    component['updatePresence']();
    fixture.detectChanges();
    await fixture.whenStable();

    // Should only show Bob (clientId 2), not Alice (clientId 1 = own)
    const users = component['activeUsers']();
    expect(users.some((u: PresenceUser) => u.username === 'Alice')).toBe(false);
    expect(users.some((u: PresenceUser) => u.username === 'Bob')).toBe(true);
  });

  it('should handle connections without provider', async () => {
    (
      documentService.getActiveConnections as ReturnType<typeof vi.fn>
    ).mockReturnValue([
      { documentId: 'doc1', provider: null },
      { documentId: 'doc2' },
    ]);

    fixture.detectChanges();
    component['updatePresence']();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component['activeUsers']().length).toBe(0);
  });
});
