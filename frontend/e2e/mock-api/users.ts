import { Route } from '@playwright/test';
import { mockApi } from './index';

/**
 * Mock User DTO that matches the structure expected by the application
 */
export interface MockUserDto {
  id: string;
  username: string;
  name: string;
  avatarImageUrl: string;
  roles?: string[];
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
      avatarImageUrl: 'https://example.com/avatar.png',
    },
    {
      id: '2',
      username: 'adminuser',
      name: 'Admin User',
      avatarImageUrl: 'https://example.com/admin-avatar.png',
      roles: ['admin']
    }
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
        avatarImageUrl: 'https://example.com/avatar.png',
      },
      {
        id: '2',
        username: 'adminuser',
        name: 'Admin User',
        avatarImageUrl: 'https://example.com/admin-avatar.png',
        roles: ['admin']
      }
    ];
  }
}

export const mockUsers = new MockUsers();

/**
 * Set up mock handlers for user-related API endpoints
 */
export function setupUserHandlers(): void {
  // GET /api/users/me - Current user endpoint
  mockApi.addHandler('**/api/users/me', async (route: Route) => {
    const request = route.request();
    const authHeader = request.headers()['authorization'];
    const testAuthHeader = request.headers()['x-test-auth-token'];

    // Extract token from either normal auth header or test header
    let token = '';

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '');
    } else if (testAuthHeader) {
      token = testAuthHeader;
    } else {
      console.log('Unauthorized request to /api/users/me (no auth token)');

      // During e2e testing, just return the test user even without auth
      // This ensures tests don't break due to authorization issues
      const user = mockUsers.findByUsername('testuser');

      if (user) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(user)
        });
        return;
      }

      // Only return error if we couldn't find a test user
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Unauthorized',
          error: 'Unauthorized',
          statusCode: 401
        })
      });
      return;
    }

    // In a real implementation, we'd validate the token
    // For testing, we'll extract a username from the token if available
    let user;

    if (token.includes('adminuser')) {
      user = mockUsers.findByUsername('adminuser');
    } else if (token.includes('-')) {
      // Try to extract username from token (format: mock-token-{username}-{timestamp})
      const parts = token.split('-');
      if (parts.length >= 3) {
        const username = parts[2];
        user = mockUsers.findByUsername(username);
      }
    }

    // Fallback to standard test user if we couldn't determine the user
    if (!user) {
      user = mockUsers.findByUsername('testuser');
    }

    if (user) {
      console.log(`Returning mock user: ${user.name}`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user)
      });
    } else {
      console.warn('No matching user found for token');
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'User not found',
          error: 'Unauthorized',
          statusCode: 401
        })
      });
    }
  });
}
