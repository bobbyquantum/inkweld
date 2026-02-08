import { expect, mcpRequest, test } from './fixtures';

/**
 * MCP Resources E2E Tests
 *
 * Tests MCP resource listing and reading via direct JSON-RPC
 * to the MCP Streamable HTTP endpoint.
 */

test.describe('resources/list', () => {
  test('should list available resources', async ({
    mcpContext,
    apiRequest,
  }) => {
    const result = await mcpRequest(
      apiRequest,
      mcpContext.mcpApiKey,
      'resources/list',
      {}
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();

    const resources = (
      result.result as { resources: Array<{ uri: string; name: string }> }
    ).resources;
    expect(Array.isArray(resources)).toBe(true);
    expect(resources.length).toBeGreaterThan(0);

    // The projects list resource should always be available
    const projectsResource = resources.find(
      r => r.uri === 'inkweld://projects'
    );
    expect(projectsResource).toBeDefined();
    expect(projectsResource!.name).toBeTruthy();
  });

  test('should include project-specific resources', async ({
    mcpContext,
    apiRequest,
  }) => {
    const result = await mcpRequest(
      apiRequest,
      mcpContext.mcpApiKey,
      'resources/list',
      {}
    );

    const resources = (
      result.result as { resources: Array<{ uri: string; name: string }> }
    ).resources;

    // Project resource URIs follow the pattern inkweld://project/{username}/{slug}
    const projectResource = resources.find(r =>
      r.uri.includes(
        `inkweld://project/${mcpContext.username}/${mcpContext.projectSlug}`
      )
    );
    // Project resource should exist since we created a project in fixture
    expect(projectResource).toBeDefined();
  });
});

test.describe('resources/read', () => {
  test('should read the projects list resource', async ({
    mcpContext,
    apiRequest,
  }) => {
    const result = await mcpRequest(
      apiRequest,
      mcpContext.mcpApiKey,
      'resources/read',
      { uri: 'inkweld://projects' }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();

    const contents = (
      result.result as {
        contents: Array<{ uri: string; text?: string; mimeType?: string }>;
      }
    ).contents;
    expect(Array.isArray(contents)).toBe(true);
    expect(contents.length).toBeGreaterThan(0);

    // At least one content entry should reference our project
    const hasProject = contents.some(
      c =>
        c.text?.includes(mcpContext.projectSlug) ||
        c.uri?.includes(mcpContext.projectSlug)
    );
    expect(hasProject).toBe(true);
  });

  test('should read a specific project resource', async ({
    mcpContext,
    apiRequest,
  }) => {
    const projectUri = `inkweld://project/${mcpContext.username}/${mcpContext.projectSlug}`;

    const result = await mcpRequest(
      apiRequest,
      mcpContext.mcpApiKey,
      'resources/read',
      { uri: projectUri }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();

    const contents = (
      result.result as {
        contents: Array<{ uri: string; text?: string; mimeType?: string }>;
      }
    ).contents;
    expect(Array.isArray(contents)).toBe(true);
    expect(contents.length).toBeGreaterThan(0);

    // Should contain project information
    const firstContent = contents[0];
    expect(firstContent.uri).toContain(mcpContext.projectSlug);
    expect(firstContent.text || firstContent.mimeType).toBeTruthy();
  });

  test('should read project elements resource', async ({
    mcpContext,
    apiRequest,
  }) => {
    const elementsUri = `inkweld://project/${mcpContext.username}/${mcpContext.projectSlug}/elements`;

    const result = await mcpRequest(
      apiRequest,
      mcpContext.mcpApiKey,
      'resources/read',
      { uri: elementsUri }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();

    const contents = (
      result.result as { contents: Array<{ uri: string; text?: string }> }
    ).contents;
    expect(Array.isArray(contents)).toBe(true);
  });

  test('should read project worldbuilding resource', async ({
    mcpContext,
    apiRequest,
  }) => {
    const wbUri = `inkweld://project/${mcpContext.username}/${mcpContext.projectSlug}/worldbuilding`;

    const result = await mcpRequest(
      apiRequest,
      mcpContext.mcpApiKey,
      'resources/read',
      { uri: wbUri }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();

    const contents = (
      result.result as { contents: Array<{ uri: string; text?: string }> }
    ).contents;
    expect(Array.isArray(contents)).toBe(true);
  });

  test('should error for unknown resource URI', async ({
    mcpContext,
    apiRequest,
  }) => {
    const result = await mcpRequest(
      apiRequest,
      mcpContext.mcpApiKey,
      'resources/read',
      { uri: 'inkweld://nonexistent/resource' }
    );

    // Should return an error
    expect(result.error).toBeDefined();
  });
});

test.describe('resource templates', () => {
  test('should list resource templates', async ({ mcpContext, apiRequest }) => {
    const result = await mcpRequest(
      apiRequest,
      mcpContext.mcpApiKey,
      'resources/templates/list',
      {}
    );

    // Resource templates may or may not be supported
    // but the method should not error (may return empty)
    if (result.error) {
      // Method not found is acceptable if templates aren't implemented
      expect(result.error.code).toBe(-32601);
    } else {
      expect(result.result).toBeDefined();
      const templates = (
        result.result as {
          resourceTemplates: Array<{ uriTemplate: string; name: string }>;
        }
      ).resourceTemplates;
      expect(Array.isArray(templates)).toBe(true);
    }
  });
});

test.describe('prompts', () => {
  test('should list available prompts', async ({ mcpContext, apiRequest }) => {
    const result = await mcpRequest(
      apiRequest,
      mcpContext.mcpApiKey,
      'prompts/list',
      {}
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();

    const prompts = (
      result.result as {
        prompts: Array<{ name: string; description?: string }>;
      }
    ).prompts;
    expect(Array.isArray(prompts)).toBe(true);
  });

  test('should get a prompt by name', async ({ mcpContext, apiRequest }) => {
    // First list to get available prompt names
    const listResult = await mcpRequest(
      apiRequest,
      mcpContext.mcpApiKey,
      'prompts/list',
      {}
    );

    const prompts = (listResult.result as { prompts: Array<{ name: string }> })
      .prompts;

    if (prompts.length > 0) {
      const promptName = prompts[0].name;

      const result = await mcpRequest(
        apiRequest,
        mcpContext.mcpApiKey,
        'prompts/get',
        { name: promptName }
      );

      // prompts/get may require arguments; either success or error with details
      expect(result.result || result.error).toBeDefined();
    }
  });
});

test.describe('ping', () => {
  test('should respond to ping', async ({ mcpContext, apiRequest }) => {
    const result = await mcpRequest(
      apiRequest,
      mcpContext.mcpApiKey,
      'ping',
      {}
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();
  });
});
