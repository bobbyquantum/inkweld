import { TestBed } from '@angular/core/testing';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationStart,
  Router,
} from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PublicProjectContextService } from './public-project-context.service';

describe('PublicProjectContextService', () => {
  const originalUrl = location.href;
  const originalBase = document.querySelector('base');
  const originalHref = originalBase?.getAttribute('href');
  let base: HTMLBaseElement;
  beforeEach(() => {
    base = originalBase ?? document.createElement('base');
    base.href = '/';
    if (!originalBase) document.head.append(base);
  });
  afterEach(() => {
    if (!originalBase) base.remove();
    else if (originalHref !== null && originalHref !== undefined)
      base.setAttribute('href', originalHref);
    history.replaceState(null, '', originalUrl);
    TestBed.resetTestingModule();
  });

  it('recognizes initial public deep links without configuring a profile', () => {
    vi.stubGlobal('location', {
      ...location,
      pathname: '/public/alice/story/document/chapter',
    });
    const stored = localStorage.getItem('inkweld-app-config');
    const context = TestBed.inject(PublicProjectContextService);
    expect(context.active()).toBe(true);
    expect(context.storagePrefix()).toMatch(/^public:/);
    expect(localStorage.getItem('inkweld-app-config')).toBe(stored);
  });

  it('does not classify a nested path or incomplete link as public', () => {
    vi.stubGlobal('location', { ...location, pathname: '/alice/public/story' });
    expect(TestBed.inject(PublicProjectContextService).active()).toBe(false);
    TestBed.resetTestingModule();
    vi.stubGlobal('location', { ...location, pathname: '/public/alice' });
    expect(TestBed.inject(PublicProjectContextService).active()).toBe(false);
  });

  it('tracks navigation and restores the previous context on cancellation', () => {
    vi.stubGlobal('location', { ...location, pathname: '/alice/private' });
    const events = new Subject<
      NavigationStart | NavigationEnd | NavigationCancel
    >();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events, url: '/alice/private' } },
      ],
    });
    const context = TestBed.inject(PublicProjectContextService);
    events.next(new NavigationStart(1, '/public/alice/story'));
    expect(context.active()).toBe(true);
    events.next(new NavigationCancel(1, '/public/alice/story', 'cancelled'));
    expect(context.active()).toBe(false);
    events.next(
      new NavigationEnd(2, '/public/alice/story', '/public/alice/story')
    );
    expect(context.active()).toBe(true);
    events.next(new NavigationEnd(3, '/', '/'));
    expect(context.active()).toBe(false);
  });
});
