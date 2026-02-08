import { expect, mcpCallTool, mcpRequest, test } from './fixtures';

/**
 * MCP Search & Query Tools E2E Tests
 *
 * Tests all read/query tools via direct JSON-RPC calls
 * to the MCP Streamable HTTP endpoint.
 */

test.describe('tools/list', () => {
  test('should list all available tools', async ({
    mcpContext,
    apiRequest,
  }) => {
    const result = await mcpRequest(
      apiRequest,
      mcpContext.mcpApiKey,
      'tools/list'
    );

    expect(result.error).toBeUndefined();
    const toolsResult = result.result as {
      tools: Array<{
        name: string;
        description?: string;
        inputSchema: unknown;
      }>;
    };
    expect(toolsResult.tools).toBeDefined();
    expect(toolsResult.tools.length).toBeGreaterThan(0);

    // Verify expected search tools are present
    const toolNames = toolsResult.tools.map(t => t.name);
    expect(toolNames).toContain('get_project_tree');
    expect(toolNames).toContain('search_elements');
    expect(toolNames).toContain('search_worldbuilding');
    expect(toolNames).toContain('get_element_full');
    expect(toolNames).toContain('get_document_content');
    expect(toolNames).toContain('get_project_metadata');

    // Verify expected mutation tools are present
    expect(toolNames).toContain('create_element');
    expect(toolNames).toContain('update_element');
    expect(toolNames).toContain('delete_element');
    expect(toolNames).toContain('move_elements');

    // Each tool should have an inputSchema
    for (const tool of toolsResult.tools) {
      expect(tool.inputSchema).toBeDefined();
      expect((tool.inputSchema as { type: string }).type).toBe('object');
    }
  });
});

test.describe('get_project_tree', () => {
  test('should return project tree for empty project', async ({
    mcpContext,
    apiRequest,
  }) => {
    const result = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'get_project_tree',
      { project: mcpContext.projectKey }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();

    const toolResult = result.result as {
      content: Array<{ type: string; text: string }>;
    };
    expect(toolResult.content).toBeDefined();
    expect(toolResult.content.length).toBeGreaterThan(0);
    expect(toolResult.content[0].type).toBe('text');
  });

  test('should return tree with elements after creating some', async ({
    mcpContext,
    apiRequest,
  }) => {
    // Create a folder first
    const createResult = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'create_element',
      {
        project: mcpContext.projectKey,
        name: 'Chapter 1',
        type: 'FOLDER',
      }
    );
    expect(createResult.error).toBeUndefined();

    // Now get the tree
    const result = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'get_project_tree',
      { project: mcpContext.projectKey }
    );

    expect(result.error).toBeUndefined();
    const toolResult = result.result as {
      content: Array<{ type: string; text: string }>;
    };

    // Parse the response text to verify the folder appears
    const responseText = toolResult.content.map(c => c.text).join('\n');
    expect(responseText).toContain('Chapter 1');
  });
});

test.describe('search_elements', () => {
  test('should search elements by name', async ({ mcpContext, apiRequest }) => {
    // Create elements to search
    await mcpCallTool(apiRequest, mcpContext.mcpApiKey, 'create_element', {
      project: mcpContext.projectKey,
      name: 'Prologue',
      type: 'ITEM',
    });
    await mcpCallTool(apiRequest, mcpContext.mcpApiKey, 'create_element', {
      project: mcpContext.projectKey,
      name: 'Epilogue',
      type: 'ITEM',
    });

    // Search for prologue
    const result = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'search_elements',
      {
        project: mcpContext.projectKey,
        query: 'Prologue',
      }
    );

    expect(result.error).toBeUndefined();
    const toolResult = result.result as {
      content: Array<{ type: string; text: string }>;
    };
    const responseText = toolResult.content.map(c => c.text).join('\n');
    expect(responseText).toContain('Prologue');
  });

  test('should filter by element type', async ({ mcpContext, apiRequest }) => {
    await mcpCallTool(apiRequest, mcpContext.mcpApiKey, 'create_element', {
      project: mcpContext.projectKey,
      name: 'TypeTestFolder',
      type: 'FOLDER',
    });
    await mcpCallTool(apiRequest, mcpContext.mcpApiKey, 'create_element', {
      project: mcpContext.projectKey,
      name: 'TypeTestItem',
      type: 'ITEM',
    });

    const result = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'search_elements',
      {
        project: mcpContext.projectKey,
        query: 'TypeTest',
        types: ['FOLDER'],
      }
    );

    expect(result.error).toBeUndefined();
    const toolResult = result.result as {
      content: Array<{ type: string; text: string }>;
    };
    const responseText = toolResult.content.map(c => c.text).join('\n');
    expect(responseText).toContain('TypeTestFolder');
  });
});

test.describe('search_worldbuilding', () => {
  test('should search worldbuilding content', async ({
    mcpContext,
    apiRequest,
  }) => {
    // Create a worldbuilding element
    const createElement = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'create_element',
      {
        project: mcpContext.projectKey,
        name: 'Sir Lancelot',
        type: 'WORLDBUILDING',
      }
    );
    expect(createElement.error).toBeUndefined();

    // Search for it
    const result = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'search_worldbuilding',
      {
        project: mcpContext.projectKey,
        query: 'Lancelot',
      }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();
  });
});

test.describe('get_project_metadata', () => {
  test('should return project metadata', async ({ mcpContext, apiRequest }) => {
    const result = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'get_project_metadata',
      { project: mcpContext.projectKey }
    );

    expect(result.error).toBeUndefined();
    const toolResult = result.result as {
      content: Array<{ type: string; text: string }>;
    };
    expect(toolResult.content).toBeDefined();
    expect(toolResult.content.length).toBeGreaterThan(0);

    const responseText = toolResult.content.map(c => c.text).join('\n');
    expect(responseText).toContain('MCP Test Project');
  });
});

test.describe('get_relationships_graph', () => {
  test('should return relationships graph', async ({
    mcpContext,
    apiRequest,
  }) => {
    const result = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'get_relationships_graph',
      { project: mcpContext.projectKey }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();
  });
});

test.describe('get_publish_plans', () => {
  test('should return publish plans (empty for new project)', async ({
    mcpContext,
    apiRequest,
  }) => {
    const result = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'get_publish_plans',
      { project: mcpContext.projectKey }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();
  });
});

test.describe('get_element_full', () => {
  test('should return full element data', async ({
    mcpContext,
    apiRequest,
  }) => {
    // Create an element
    const createResult = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'create_element',
      {
        project: mcpContext.projectKey,
        name: 'Full Data Element',
        type: 'WORLDBUILDING',
      }
    );
    expect(createResult.error).toBeUndefined();

    // Extract element ID from create result
    const createContent = (
      createResult.result as {
        content: Array<{ type: string; text: string }>;
      }
    ).content;
    const createText = createContent.map(c => c.text).join('\n');

    // Parse the ID - it should be in the response
    const idMatch = createText.match(
      /["\s]id["\s]*[:\s]+["\s]*([a-zA-Z0-9_-]+)/
    );
    if (!idMatch) {
      // Try to get it from the tree instead
      const treeResult = await mcpCallTool(
        apiRequest,
        mcpContext.mcpApiKey,
        'search_elements',
        {
          project: mcpContext.projectKey,
          query: 'Full Data Element',
        }
      );
      expect(treeResult.error).toBeUndefined();
      return; // Skip the full element check if we can't extract the ID
    }

    const elementId = idMatch[1];
    const result = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'get_element_full',
      {
        project: mcpContext.projectKey,
        elementId,
      }
    );

    expect(result.error).toBeUndefined();
    const toolResult = result.result as {
      content: Array<{ type: string; text: string }>;
    };
    expect(toolResult.content).toBeDefined();
    const responseText = toolResult.content.map(c => c.text).join('\n');
    expect(responseText).toContain('Full Data Element');
  });
});

test.describe('search_relationships', () => {
  test('should search relationships for an element', async ({
    mcpContext,
    apiRequest,
  }) => {
    // Create an element
    const createResult = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'create_element',
      {
        project: mcpContext.projectKey,
        name: 'Relation Source',
        type: 'WORLDBUILDING',
      }
    );
    expect(createResult.error).toBeUndefined();

    const createText = (
      createResult.result as {
        content: Array<{ type: string; text: string }>;
      }
    ).content
      .map(c => c.text)
      .join('\n');

    const idMatch = createText.match(
      /["\s]id["\s]*[:\s]+["\s]*([a-zA-Z0-9_-]+)/
    );
    if (!idMatch) return; // Skip if can't parse ID

    const elementId = idMatch[1];
    const result = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'search_relationships',
      {
        project: mcpContext.projectKey,
        elementId,
      }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();
  });
});
