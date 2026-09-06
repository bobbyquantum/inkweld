import { type Route } from '@playwright/test';

import { mockApi } from './index';

/**
 * Mock User DTO that matches the structure expected by the application
 */
export interface MockUserDto {
  id: string;
  username: string;
  name: string;
  roles?: string[];
  isAdmin?: boolean;
  hasAvatar?: boolean;
}

/**
 * Manages mock user data and handlers for user-related endpoints
 */
class MockUsers {
  // Static users available for tests
  private users: MockUserDto[] = [
    {
      id: '1',
      username: 'testuser',
      name: 'Test User',
      roles: ['admin'],
      isAdmin: true, // Give testuser admin role for screenshot tests
      hasAvatar: false,
    },
    {
      id: '2',
      username: 'adminuser',
      name: 'Admin User',
      roles: ['admin'],
      isAdmin: true,
      hasAvatar: false,
    },
  ];

  /**
   * Get all mock users
   */
  public getUsers(): MockUserDto[] {
    return this.users;
  }

  /**
   * Find a user by username
   */
  public findByUsername(username: string): MockUserDto | undefined {
    return this.users.find(u => u.username === username);
  }

  /**
   * Add a new user to the mock database
   */
  public addUser(user: MockUserDto): void {
    // Ensure we don't have duplicates
    if (this.findByUsername(user.username)) {
      throw new Error(`User with username ${user.username} already exists`);
    }
    this.users.push(user);
  }

  /**
   * Reset users to default state (useful between tests)
   */
  public resetUsers(): void {
    this.users = [
      {
        id: '1',
        username: 'testuser',
        name: 'Test User',
        roles: ['admin'],
        isAdmin: true, // Give testuser admin role for screenshot tests
      },
      {
        id: '2',
        username: 'adminuser',
        name: 'Admin User',
        roles: ['admin'],
        isAdmin: true,
      },
    ];
  }
}

export const mockUsers = new MockUsers();

/**
 * Set up mock handlers for user-related API endpoints
 */
export function setupUserHandlers(): void {
  // GET /api/v1/users/check-username - Check username availability
  mockApi.addHandler(
    '**/api/v1/users/check-username/**',
    async (route: Route) => {
      const url = route.request().url();
      const username = url.split('/').pop()?.split('?')[0] || '';

      const existingUser = mockUsers.findByUsername(username);

      if (existingUser) {
        // Username is taken, provide suggestions
        const suggestions = [
          `${username}1`,
          `${username}2`,
          `${username}_user`,
        ];

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            available: false,
            suggestions,
          }),
        });
      } else {
        // Username is available
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            available: true,
            suggestions: [],
          }),
        });
      }
    }
  );

  // GET /api/v1/users/me - Current user endpoint (Token based)
  mockApi.addHandler('**/api/v1/users/me', async (route: Route) => {
    const request = route.request();
    const authHeader = request.headers()['authorization'];
    let token = '';

    // Extract token from Authorization header
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Remove 'Bearer ' prefix
    }

    // If no auth token found, return 401 Unauthorized
    if (!token) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Unauthorized',
          error: 'Unauthorized',
          statusCode: 401,
        }),
      });
      return;
    }

    // If auth token found, try to extract username and find the user
    // Mock format: mock-token-{username}
    let user;
    const parts = token.split('-');
    if (parts.length >= 3 && parts[0] === 'mock' && parts[1] === 'token') {
      const username = parts[2];
      user = mockUsers.findByUsername(username);
    }

    // If a user was found for the token, return 200 OK
    if (user) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      });
    } else {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'User not found',
          error: 'Unauthorized',
          statusCode: 401,
        }),
      });
    }
  });

  // GET /api/v1/users/:username/profile — public profile card.
  // Registered before the bare `**/api/v1/users` list handler, which would
  // otherwise swallow this URL (patterns are unanchored prefix matches).
  mockApi.addHandler('**/api/v1/users/*/profile', async (route: Route) => {
    const match = /\/api\/v1\/users\/([^/]+)\/profile/.exec(
      route.request().url()
    );
    const username = match ? decodeURIComponent(match[1]) : '';
    const user = mockUsers.findByUsername(username);
    if (!user) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'User not found' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        username: user.username,
        name: user.name,
        bio: 'Writes slow-burn fantasy and the occasional ghost story.',
        hasAvatar: user.hasAvatar ?? false,
        isOwner: true,
        sections: { activity: true, projects: true },
        visibility: {
          profile: 'public',
          activity: 'public',
          projects: 'members',
        },
        projects: [
          {
            slug: 'wandering-stars',
            title: 'Wandering Stars',
            description: 'A slow-burn space opera in three acts.',
            updatedDate: Date.now(),
          },
          {
            slug: 'the-hollow',
            title: 'The Hollow',
            description: 'Ghost story set in a drowned valley.',
            updatedDate: Date.now() - 86_400_000,
          },
        ],
      }),
    });
  });

  // GET /api/v1/users/:username/activity — one year of per-day word counts
  // for the profile contribution grid.
  mockApi.addHandler('**/api/v1/users/*/activity*', async (route: Route) => {
    const url = new URL(route.request().url());
    const year =
      Number(url.searchParams.get('year')) || new Date().getUTCFullYear();
    const days: { day: string; words: number; sessions: number }[] = [];
    const cursor = new Date(Date.UTC(year, 0, 1));
    let i = 0;
    while (cursor.getUTCFullYear() === year) {
      // Deterministic pseudo-random pattern with weekly rhythm and gaps.
      const seed = (i * 7919 + year) % 97;
      const weekday = cursor.getUTCDay();
      const active = seed % 4 !== 0 && !(weekday === 0 && seed % 3 === 0);
      const words = active ? 80 + ((seed * 37) % 900) : 0;
      days.push({
        day: cursor.toISOString().slice(0, 10),
        words,
        sessions: words > 0 ? 1 + (seed % 3) : 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      i++;
    }
    const totalWords = days.reduce((sum, d) => sum + d.words, 0);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        year,
        timeZone: url.searchParams.get('tz') ?? 'UTC',
        days,
        totalWords,
        activeDays: days.filter(d => d.words > 0).length,
        longestStreak: 11,
        currentStreak: 4,
        availableYears: [year, year - 1, year - 2],
      }),
    });
  });

  // GET /api/v1/users - List all users (admin endpoint)
  mockApi.addHandler('**/api/v1/users', async (route: Route) => {
    const users = mockUsers.getUsers();

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        users: users.map(u => ({
          ...u,
          createdAt: new Date().toISOString(),
          approved: true,
          enabled: true,
        })),
        total: users.length,
      }),
    });
  });

  // GET /api/v1/admin/users/pending - Get pending users
  mockApi.addHandler('**/api/v1/admin/users/pending', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}
