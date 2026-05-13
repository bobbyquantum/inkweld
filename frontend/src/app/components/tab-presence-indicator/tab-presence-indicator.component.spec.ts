import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type PresenceSession } from '@inkweld/presence';
import { beforeEach, describe, expect, it } from 'vitest';

import { PresenceService } from '../../services/presence/presence.service';
import { TabPresenceIndicatorComponent } from './tab-presence-indicator.component';

function session(sessionId: string, username: string): PresenceSession {
  return {
    sessionId,
    user: { id: username, username, color: '#abcabc' },
    status: 'active',
    location: { kind: 'timeline', elementId: 'abc' },
    lastActivityAt: 1,
  };
}

describe('TabPresenceIndicatorComponent', () => {
  let usersAtLocationResult: ReturnType<typeof signal<PresenceSession[]>>;

  beforeEach(() => {
    usersAtLocationResult = signal<PresenceSession[]>([]);

    TestBed.configureTestingModule({
      imports: [TabPresenceIndicatorComponent],
      providers: [
        {
          provide: PresenceService,
          useValue: {
            usersAtLocation: () => usersAtLocationResult.asReadonly(),
          },
        },
      ],
    });
  });

  it('renders nothing when no users are present', () => {
    const fixture = TestBed.createComponent(TabPresenceIndicatorComponent);
    fixture.componentRef.setInput('location', {
      kind: 'timeline',
      elementId: 'abc',
    });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(
        '[data-testid=tab-presence-indicator]'
      )
    ).toBeNull();
  });

  it('renders one avatar per visible user', () => {
    usersAtLocationResult.set([session('s1', 'alice'), session('s2', 'bob')]);
    const fixture = TestBed.createComponent(TabPresenceIndicatorComponent);
    fixture.componentRef.setInput('location', {
      kind: 'timeline',
      elementId: 'abc',
    });
    fixture.detectChanges();

    const avatars = fixture.nativeElement.querySelectorAll(
      '[data-testid=tab-presence-user]'
    );
    expect(avatars).toHaveLength(2);
    expect(avatars[0].getAttribute('data-username')).toBe('alice');
    expect(avatars[1].getAttribute('data-username')).toBe('bob');
  });

  it('collapses overflow users into a +N chip', () => {
    usersAtLocationResult.set(
      Array.from({ length: 7 }, (_, i) => session(`s${i + 1}`, `user${i + 1}`))
    );
    const fixture = TestBed.createComponent(TabPresenceIndicatorComponent);
    fixture.componentRef.setInput('location', {
      kind: 'timeline',
      elementId: 'abc',
    });
    fixture.componentRef.setInput('maxDisplayed', 5);
    fixture.detectChanges();

    const visibleAvatars = fixture.nativeElement.querySelectorAll(
      '[data-testid=tab-presence-user]'
    );
    expect(visibleAvatars).toHaveLength(5);

    const overflow = fixture.nativeElement.querySelector(
      '.tab-presence__avatar--overflow'
    );
    expect(overflow?.textContent?.trim()).toBe('+2');
  });
});
