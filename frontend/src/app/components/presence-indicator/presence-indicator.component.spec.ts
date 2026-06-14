import { signal } from '@angular/core';
import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { type PresenceSession } from '@inkweld/presence';
import { PresenceService } from '@services/presence/presence.service';
import { beforeEach, describe, expect, it } from 'vitest';

import { PresenceIndicatorComponent } from './presence-indicator.component';

function session(sessionId: string, username: string): PresenceSession {
  return {
    sessionId,
    user: { id: username, username, color: '#abcdef' },
    status: 'active',
    location: { kind: 'elements' },
    lastActivityAt: 1,
  };
}

describe('PresenceIndicatorComponent', () => {
  let component: PresenceIndicatorComponent;
  let fixture: ComponentFixture<PresenceIndicatorComponent>;
  let users: ReturnType<typeof signal<PresenceSession[]>>;

  beforeEach(async () => {
    users = signal<PresenceSession[]>([]);

    await TestBed.configureTestingModule({
      imports: [PresenceIndicatorComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: PresenceService, useValue: { users: users.asReadonly() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PresenceIndicatorComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should return correct initials for usernames', () => {
    expect(component.getInitials('Alice')).toBe('AL');
    expect(component.getInitials('Bob Smith')).toBe('BS');
    expect(component.getInitials('john doe')).toBe('JD');
    expect(component.getInitials('')).toBe('?');
    expect(component.getInitials('a')).toBe('A');
  });

  it('should display maximum of MAX_DISPLAYED_USERS', () => {
    users.set(
      Array.from({ length: 10 }, (_, i) => session(`s${i}`, `User${i}`))
    );
    fixture.detectChanges();

    expect(component['displayedUsers']().length).toBe(5);
    expect(component['overflowCount']()).toBe(5);
  });

  it('should calculate overflow tooltip correctly', () => {
    users.set(
      Array.from({ length: 8 }, (_, i) => session(`s${i}`, `User${i}`))
    );
    fixture.detectChanges();

    expect(component['overflowTooltip']()).toContain('User5');
  });

  it('should not show presence indicator when no active users', () => {
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid=presence-indicator]')
    ).toBeNull();
  });
});
