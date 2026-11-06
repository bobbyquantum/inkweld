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
    sessionStorage.clear();
    vi.unstubAllGlobals();
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
  describe('the server a link names', () => {
    const API = 'https://api.example.com';
    const linkSearch = `?server=${encodeURIComponent(API)}`;

    function withRouter(url: string): Subject<NavigationStart | NavigationEnd> {
      const events = new Subject<NavigationStart | NavigationEnd>();
      TestBed.configureTestingModule({
        providers: [{ provide: Router, useValue: { events, url } }],
      });
      return events;
    }

    it('reads the project from the server in the link', () => {
      vi.stubGlobal('location', {
        ...location,
        pathname: '/public/bobbyquantum/dustmote-rising',
        search: linkSearch,
      });
      const context = TestBed.inject(PublicProjectContextService);

      expect(context.serverUrl()).toBe(API);
      expect(context.storagePrefix()).toBe(
        `public:${encodeURIComponent(API)}:`
      );
    });

    it('keeps that server while moving around the project', () => {
      vi.stubGlobal('location', { ...location, pathname: '/', search: '' });
      const events = withRouter('/');
      const context = TestBed.inject(PublicProjectContextService);

      events.next(new NavigationStart(1, `/public/alice/story${linkSearch}`));
      events.next(
        new NavigationEnd(
          2,
          '/public/alice/story/document/chapter',
          '/public/alice/story/document/chapter'
        )
      );

      expect(context.serverUrl()).toBe(API);
    });

    it('still knows the server after a reload deeper in the project', () => {
      vi.stubGlobal('location', {
        ...location,
        pathname: '/public/alice/story',
        search: linkSearch,
      });
      TestBed.inject(PublicProjectContextService);
      TestBed.resetTestingModule();
      vi.stubGlobal('location', {
        ...location,
        pathname: '/public/alice/story/media',
        search: '',
      });

      expect(TestBed.inject(PublicProjectContextService).serverUrl()).toBe(API);
    });

    it("uses the build's server for a project whose link named none", () => {
      vi.stubGlobal('location', {
        ...location,
        pathname: '/public/alice/story',
        search: linkSearch,
      });
      TestBed.inject(PublicProjectContextService);
      TestBed.resetTestingModule();
      vi.stubGlobal('location', {
        ...location,
        pathname: '/public/carol/other',
        search: '',
      });

      expect(TestBed.inject(PublicProjectContextService).serverUrl()).not.toBe(
        API
      );
    });

    it('ignores a server that is not an http(s) URL', () => {
      vi.stubGlobal('location', {
        ...location,
        pathname: '/public/alice/story',
        search: '?server=javascript%3Aalert(1)',
      });

      expect(
        TestBed.inject(PublicProjectContextService).serverUrl()
      ).not.toContain('javascript');
      expect(sessionStorage.getItem('inkweld-public-link-servers')).toBeNull();
    });

    it('survives unreadable stored servers', () => {
      sessionStorage.setItem('inkweld-public-link-servers', '{not json');
      vi.stubGlobal('location', {
        ...location,
        pathname: '/public/alice/story',
        search: '',
      });

      expect(() =>
        TestBed.inject(PublicProjectContextService).serverUrl()
      ).not.toThrow();
    });
  });
});
