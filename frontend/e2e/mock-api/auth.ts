import { Route } from '@playwright/test';
import { mockApi } from './index';
import { mockUsers, MockUserDto } from './users';

/**
 * Authentication handler for mock API
 * Handles login, registration and OAuth flows
 */
export function setupAuthHandlers(): void {
  // GET /api/providers - OAuth Providers List
  mockApi.addHandler('**/providers', async (route: Route) => {
    // Return a list of available OAuth providers
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(['github', 'google']) // Add whatever providers you want to test with
    });
  });
  // POST /api/auth/register - User registration
  mockApi.addHandler('**/api/auth/register', async (route: Route) => {
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
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Username already taken',
          error: 'Conflict',
          statusCode: 409
        })
      });
      return;
    }

    // Create new user
    const newUser: MockUserDto = {
      id: Date.now().toString(),
      username: body.username,
      name: body.name || body.username,
      avatarImageUrl: body.avatarImageUrl || 'https://example.com/default-avatar.png',
    };

    try {
      mockUsers.addUser(newUser);
      console.log(`Created new user: ${newUser.username}`);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newUser)
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
    mockApi.addHandler('**/api/v1/users/me', async (route: Route) => {
      // Just return success
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({         name: user.name,
          username: user.username,
          avatarImageUrl: user.avatarImageUrl, })
      });
    });
    // Generate mock token
    const token = `mock-token-${user.username}-${Date.now()}`;

    console.log(`Login successful for user: ${user.username}`);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token,
        name: user.name,
        username: user.username,
        avatarImageUrl: user.avatarImageUrl,
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
        avatarImageUrl: `https://example.com/${provider}-avatar.png`,
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
          oauthUser.avatarImageUrl = existing.avatarImageUrl;
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
          avatarImageUrl: oauthUser.avatarImageUrl
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
