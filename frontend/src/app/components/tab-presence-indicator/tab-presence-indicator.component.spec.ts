import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PresenceService } from '../../services/presence/presence.service';
import { type PresenceUser } from '../../services/sync/element-sync-provider.interface';
import { TabPresenceIndicatorComponent } from './tab-presence-indicator.component';

describe('TabPresenceIndicatorComponent', () => {
  let usersAtLocationResult: ReturnType<typeof signal<PresenceUser[]>>;

  beforeEach(() => {
    usersAtLocationResult = signal<PresenceUser[]>([]);

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
    fixture.componentRef.setInput('location', 'timeline:abc');
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(
        '[data-testid=tab-presence-indicator]'
      )
    ).toBeNull();
  });

  it('renders one avatar per visible user', () => {
    usersAtLocationResult.set([
      { clientId: 1, username: 'alice', color: '#fff' },
      { clientId: 2, username: 'bob', color: '#000' },
    ]);
    const fixture = TestBed.createComponent(TabPresenceIndicatorComponent);
    fixture.componentRef.setInput('location', 'timeline:abc');
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
      Array.from({ length: 7 }, (_, i) => ({
        clientId: i + 1,
        username: `user${i + 1}`,
        color: '#abcabc',
      }))
    );
    const fixture = TestBed.createComponent(TabPresenceIndicatorComponent);
    fixture.componentRef.setInput('location', 'timeline:abc');
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
