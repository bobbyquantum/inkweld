import { Route } from '@playwright/test';
import { mockApi } from './index';
import { mockUsers, MockUserDto } from './users';

/**
 * Authentication handler for mock API
 * Handles login, registration and OAuth flows
 */
export function setupAuthHandlers(): void {
  // GET /csrf/token - CSRF Token endpoint
  mockApi.addHandler('**/csrf/token**', async (route: Route) => {
    // Return a mock CSRF token
    const csrfToken = `mock-csrf-${Date.now()}`;
    console.log(`Providing CSRF token: ${csrfToken}`);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: csrfToken })
    });
  });

  // GET /api/v1/auth/providers - OAuth Providers List
  mockApi.addHandler('**/api/v1/auth/providers', async (route: Route) => {
    // Return a list of available OAuth providers matching OAuthProvidersResponse interface
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        providers: {
          github: true,
          google: true,
          facebook: false,
          discord: false,
          apple: false
        }
      })
    });
  });
  // GET /api/v1/users/check-username - Check username availability
  mockApi.addHandler('**/api/v1/users/check-username**', async (route: Route) => {
    const url = new URL(route.request().url());
    const username = url.searchParams.get('username');

    if (!username) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Username parameter is required',
          error: 'Bad Request',
          statusCode: 400
        })
      });
      return;
    }

    // Check if username exists
    const existingUser = mockUsers.findByUsername(username);

    if (existingUser) {
      // Username is taken, generate suggestions
      const suggestions = [
        `${username}123`,
        `${username}_${Math.floor(Math.random() * 1000)}`,
        `${username}_user`
      ];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          available: false,
          suggestions: suggestions
        })
      });
    } else {
      // Username is available
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          available: true,
          suggestions: []
        })
      });
    }
  });

  // POST /api/v1/auth/register - User registration
  mockApi.addHandler('**/api/v1/auth/register', async (route: Route) => {
    const request = route.request();
    const body = await request.postDataJSON() as any;

    if (!body || !body.username || !body.password) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Username and password are required',
          error: 'Bad Request',
          statusCode: 400
        })
      });
      return;
    }

    // Check if username is already taken
    const existingUser = mockUsers.findByUsername(body.username);
    if (existingUser) {
      console.log(`Registration failed: Username ${body.username} already taken`);
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Username already taken',
          errors: {
            username: ['Username already taken']
          },
          error: 'Bad Request',
          statusCode: 400
        })
      });
      return;
    }

    // Validate password strength
    const password = body.password as string;
    const passwordErrors: string[] = [];
    if (password.length < 8) {
      passwordErrors.push('Password must be at least 8 characters long');
    }
    if (!/[A-Z]/.test(password)) {
      passwordErrors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      passwordErrors.push('Password must contain at least one lowercase letter');
    }
    if (!/\d/.test(password)) {
      passwordErrors.push('Password must contain at least one number');
    }
    if (!/[@$!%*?&]/.test(password)) {
      passwordErrors.push('Password must contain at least one special character (@$!%*?&)');
    }

    if (passwordErrors.length > 0) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Password does not meet requirements',
          errors: {
            password: passwordErrors
          },
          error: 'Bad Request',
          statusCode: 400
        })
      });
      return;
    }

    // Create new user
    const newUser: MockUserDto = {
      id: Date.now().toString(),
      username: body.username,
      name: body.name || body.username,
    };

    try {
      mockUsers.addUser(newUser);
      console.log(`Created new user: ${newUser.username}`);

      // Generate auth token for auto-login after registration
      const token = `mock-token-${newUser.username}`;

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: newUser.id,
            username: newUser.username,
            name: newUser.name,
          },
          token: token,
          requiresApproval: false
        })
      });
    } catch (error) {
      console.error('Failed to create user:', error);
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Failed to create user',
          error: 'Internal Server Error',
          statusCode: 500
        })
      });
    }
  });

  // POST /api/auth/login - User login
  mockApi.addHandler('**/login', async (route: Route) => {
    const request = route.request();
    const body = await request.postDataJSON() as any;

    if (!body || !body.username || !body.password) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Username and password are required',
          error: 'Bad Request',
          statusCode: 400
        })
      });
      return;
    }

    // In a real app, we'd check password hash
    // For testing, we'll use a convention: "correct-password" is always right
    const user = mockUsers.findByUsername(body.username);
    const validPassword = body.password === 'correct-password';

    if (!user || !validPassword) {
      console.log(`Login failed for user: ${body.username}`);
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Invalid username or password',
          error: 'Unauthorized',
          statusCode: 401
        })
      });
      return;
    }
    // Generate mock token
    const token = `mock-token-${user.username}`;

    console.log(`Login successful for user: ${user.username}, returning token`);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: token,
        name: user.name,
        username: user.username,
        ...(user.roles && { roles: user.roles })
      })
    });
  });

  // POST /api/auth/logout - User logout
  mockApi.addHandler('**/api/auth/logout', async (route: Route) => {
    // Just return success
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });

  // All OAuth endpoints
  mockApi.addHandler('**/api/auth/oauth/**', async (route: Route) => {
    const url = route.request().url();

    // Extract the provider from the URL
    let provider = 'generic';
    if (url.includes('google')) provider = 'google';
    else if (url.includes('github')) provider = 'github';
    else if (url.includes('facebook')) provider = 'facebook';

    // For a callback endpoint, simulate a successful OAuth flow
    if (url.includes('callback')) {
      // Create or retrieve the mock OAuth user
      const oauthUser: MockUserDto = {
        id: `oauth-${provider}-${Date.now()}`,
        username: `${provider}-user`,
        name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} User`,
      };

      // Add to users if not exists
      try {
        const existing = mockUsers.findByUsername(oauthUser.username);
        if (!existing) {
          mockUsers.addUser(oauthUser);
        }
      } catch (error) {
        // User likely already exists, use the existing one
        const existing = mockUsers.findByUsername(oauthUser.username);
        if (existing) {
          oauthUser.id = existing.id;
          oauthUser.name = existing.name;
        }
      }

      // Generate token
      const token = `mock-oauth-token-${oauthUser.username}-${Date.now()}`;

      console.log(`OAuth login successful for: ${oauthUser.username}`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token,
          name: oauthUser.name,
          username: oauthUser.username,
        })
      });
    } else {
      // For initial OAuth request, normally we'd redirect to the provider
      // In testing, we'll just return a mock URL to the callback
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          redirectUrl: `http://localhost:4200/auth/callback/${provider}?code=mock-auth-code`
        })
      });
    }
  });
}
