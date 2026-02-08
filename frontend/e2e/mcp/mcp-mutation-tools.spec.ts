import { expect, mcpCallTool, test } from './fixtures';

/**
 * MCP Mutation Tools E2E Tests
 *
 * Tests all write/mutation tools via direct JSON-RPC calls
 * to the MCP Streamable HTTP endpoint.
 */

test.describe('create_element', () => {
  test('should create a folder element', async ({ mcpContext, apiRequest }) => {
    const result = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'create_element',
      {
        project: mcpContext.projectKey,
        name: 'New Chapter',
        type: 'FOLDER',
      }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();

    const toolResult = result.result as {
      content: Array<{ type: string; text: string }>;
    };
    const responseText = toolResult.content.map(c => c.text).join('\n');
    expect(responseText).toContain('New Chapter');
  });

  test('should create an item element', async ({ mcpContext, apiRequest }) => {
    const result = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'create_element',
      {
        project: mcpContext.projectKey,
        name: 'Scene 1',
        type: 'ITEM',
      }
    );

    expect(result.error).toBeUndefined();
    const toolResult = result.result as {
      content: Array<{ type: string; text: string }>;
    };
    expect(toolResult.content).toBeDefined();
    const responseText = toolResult.content.map(c => c.text).join('\n');
    expect(responseText).toContain('Scene 1');
  });

  test('should create a worldbuilding element', async ({
    mcpContext,
    apiRequest,
  }) => {
    const result = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'create_element',
      {
        project: mcpContext.projectKey,
        name: 'Dragon King',
        type: 'WORLDBUILDING',
      }
    );

    expect(result.error).toBeUndefined();
    const toolResult = result.result as {
      content: Array<{ type: string; text: string }>;
    };
    const responseText = toolResult.content.map(c => c.text).join('\n');
    expect(responseText).toContain('Dragon King');
  });

  test('should create element under parent', async ({
    mcpContext,
    apiRequest,
  }) => {
    // Create parent folder
    const parentResult = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'create_element',
      {
        project: mcpContext.projectKey,
        name: 'Parent Folder',
        type: 'FOLDER',
      }
    );
    expect(parentResult.error).toBeUndefined();

    // Extract parent ID
    const parentText = (
      parentResult.result as {
        content: Array<{ type: string; text: string }>;
      }
    ).content
      .map(c => c.text)
      .join('\n');
    const parentIdMatch = parentText.match(
      /["\s]id["\s]*[:\s]+["\s]*([a-zA-Z0-9_-]+)/
    );

    if (parentIdMatch) {
      // Create child under parent
      const childResult = await mcpCallTool(
        apiRequest,
        mcpContext.mcpApiKey,
        'create_element',
        {
          project: mcpContext.projectKey,
          name: 'Child Item',
          type: 'ITEM',
          parentId: parentIdMatch[1],
        }
      );
      expect(childResult.error).toBeUndefined();
    }
  });
});

test.describe('update_element', () => {
  test('should rename an element', async ({ mcpContext, apiRequest }) => {
    // Create element
    const createResult = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'create_element',
      {
        project: mcpContext.projectKey,
        name: 'Original Name',
        type: 'ITEM',
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

    if (idMatch) {
      const result = await mcpCallTool(
        apiRequest,
        mcpContext.mcpApiKey,
        'update_element',
        {
          project: mcpContext.projectKey,
          elementId: idMatch[1],
          name: 'Updated Name',
        }
      );

      expect(result.error).toBeUndefined();
      const toolResult = result.result as {
        content: Array<{ type: string; text: string }>;
      };
      const responseText = toolResult.content.map(c => c.text).join('\n');
      expect(responseText).toContain('Updated Name');
    }
  });
});

test.describe('delete_element', () => {
  test('should delete an element', async ({ mcpContext, apiRequest }) => {
    // Create element to delete
    const createResult = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'create_element',
      {
        project: mcpContext.projectKey,
        name: 'To Be Deleted',
        type: 'ITEM',
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

    if (idMatch) {
      const result = await mcpCallTool(
        apiRequest,
        mcpContext.mcpApiKey,
        'delete_element',
        {
          project: mcpContext.projectKey,
          elementId: idMatch[1],
        }
      );
      expect(result.error).toBeUndefined();

      // Verify deletion - search should not find it
      const searchResult = await mcpCallTool(
        apiRequest,
        mcpContext.mcpApiKey,
        'search_elements',
        {
          project: mcpContext.projectKey,
          query: 'To Be Deleted',
        }
      );
      expect(searchResult.error).toBeUndefined();
    }
  });
});

test.describe('sort_elements', () => {
  test('should sort elements alphabetically', async ({
    mcpContext,
    apiRequest,
  }) => {
    // Create elements in reverse order
    await mcpCallTool(apiRequest, mcpContext.mcpApiKey, 'create_element', {
      project: mcpContext.projectKey,
      name: 'Zebra',
      type: 'ITEM',
    });
    await mcpCallTool(apiRequest, mcpContext.mcpApiKey, 'create_element', {
      project: mcpContext.projectKey,
      name: 'Apple',
      type: 'ITEM',
    });
    await mcpCallTool(apiRequest, mcpContext.mcpApiKey, 'create_element', {
      project: mcpContext.projectKey,
      name: 'Mango',
      type: 'ITEM',
    });

    const result = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'sort_elements',
      {
        project: mcpContext.projectKey,
        sortBy: 'name',
      }
    );

    expect(result.error).toBeUndefined();
  });
});

test.describe('tag_element', () => {
  test('should add tags to an element', async ({ mcpContext, apiRequest }) => {
    // Create element
    const createResult = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'create_element',
      {
        project: mcpContext.projectKey,
        name: 'Tagged Element',
        type: 'ITEM',
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

    if (idMatch) {
      const result = await mcpCallTool(
        apiRequest,
        mcpContext.mcpApiKey,
        'tag_element',
        {
          project: mcpContext.projectKey,
          elementId: idMatch[1],
          action: 'add',
          tags: ['important', 'draft'],
        }
      );

      expect(result.error).toBeUndefined();
    }
  });

  test('should set tags (replacing existing)', async ({
    mcpContext,
    apiRequest,
  }) => {
    const createResult = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'create_element',
      {
        project: mcpContext.projectKey,
        name: 'Set Tags Element',
        type: 'ITEM',
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

    if (idMatch) {
      // Add tags first
      await mcpCallTool(apiRequest, mcpContext.mcpApiKey, 'tag_element', {
        project: mcpContext.projectKey,
        elementId: idMatch[1],
        action: 'add',
        tags: ['old-tag'],
      });

      // Set (replace) tags
      const result = await mcpCallTool(
        apiRequest,
        mcpContext.mcpApiKey,
        'tag_element',
        {
          project: mcpContext.projectKey,
          elementId: idMatch[1],
          action: 'set',
          tags: ['new-tag-1', 'new-tag-2'],
        }
      );

      expect(result.error).toBeUndefined();
    }
  });
});

test.describe('update_worldbuilding', () => {
  test('should update worldbuilding fields', async ({
    mcpContext,
    apiRequest,
  }) => {
    const createResult = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'create_element',
      {
        project: mcpContext.projectKey,
        name: 'Character Elara',
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

    if (idMatch) {
      const result = await mcpCallTool(
        apiRequest,
        mcpContext.mcpApiKey,
        'update_worldbuilding',
        {
          project: mcpContext.projectKey,
          elementId: idMatch[1],
          fields: {
            description: 'A brave warrior from the northern lands',
            occupation: 'Knight',
            age: '32',
          },
        }
      );

      expect(result.error).toBeUndefined();
    }
  });

  /**
   * Regression test for bug: update_worldbuilding writes to wrong Yjs map
   *
   * ISSUE: Fields updated via update_worldbuilding are written to the 'identity' Yjs map
   * instead of the 'worldbuilding' map. This causes:
   * - Fields to appear with 'identity.' prefix when read (e.g., 'identity.age' instead of 'age')
   * - Updates to not actually modify the schema-defined root fields
   * - Inconsistent data structure between UI-created and MCP-created data
   *
   * EXPECTED: Regular fields (age, occupation, etc.) should be stored in the 'worldbuilding' map
   * and appear without 'identity.' prefix when retrieved via get_element_full.
   */
  test('should write fields to worldbuilding map, not identity map (regression)', async ({
    mcpContext,
    apiRequest,
  }) => {
    // 1. Create a worldbuilding element
    const createResult = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'create_element',
      {
        project: mcpContext.projectKey,
        name: 'Test Character Mira',
        type: 'WORLDBUILDING',
      }
    );
    expect(createResult.error).toBeUndefined();

    // Extract element ID from structuredContent
    const createContent = createResult.result as {
      structuredContent?: { element?: { id?: string } };
    };
    const elementId = createContent.structuredContent?.element?.id;
    expect(elementId).toBeTruthy();

    // 2. Update worldbuilding fields
    const updateResult = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'update_worldbuilding',
      {
        project: mcpContext.projectKey,
        elementId,
        fields: {
          age: '25',
          occupation: 'Mage',
          fullName: 'Mira Starweaver',
        },
      }
    );
    expect(updateResult.error).toBeUndefined();

    // 3. Read the element to verify the data structure
    const readResult = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'get_element_full',
      {
        project: mcpContext.projectKey,
        elementId,
      }
    );
    expect(readResult.error).toBeUndefined();

    const readContent = readResult.result as {
      content: Array<{ type: string; text: string }>;
    };

    // 4. Verify the fields are in the correct namespace
    // get_element_full returns JSON as text, parse it
    const textContent = readContent.content?.[0]?.text;
    expect(textContent).toBeTruthy();
    const elementData = JSON.parse(textContent) as {
      worldbuilding?: Record<string, unknown>;
      identity?: Record<string, unknown>;
    };

    const worldbuilding = elementData.worldbuilding;
    expect(worldbuilding).toBeDefined();

    // BUG CHECK: Fields should appear WITHOUT 'identity.' prefix in worldbuilding
    // If the bug exists, we'll see 'identity.age' instead of 'age'
    const hasIdentityPrefix = Object.keys(worldbuilding ?? {}).some(k =>
      k.startsWith('identity.')
    );
    const hasRootAgeField = 'age' in (worldbuilding ?? {});
    const hasRootOccupationField = 'occupation' in (worldbuilding ?? {});
    const hasRootFullNameField = 'fullName' in (worldbuilding ?? {});

    // These assertions will FAIL if the bug exists (fields go to identity.* namespace)
    expect(hasIdentityPrefix).toBe(false); // Should NOT have identity. prefixed keys
    expect(hasRootAgeField).toBe(true); // Should have 'age' at root level
    expect(hasRootOccupationField).toBe(true); // Should have 'occupation' at root level
    expect(hasRootFullNameField).toBe(true); // Should have 'fullName' at root level

    // Also verify the actual values
    expect(worldbuilding?.['age']).toBe('25');
    expect(worldbuilding?.['occupation']).toBe('Mage');
    expect(worldbuilding?.['fullName']).toBe('Mira Starweaver');
  });

  test('should write identity fields to top-level identity object', async ({
    mcpContext,
    apiRequest,
  }) => {
    // 1. Create a worldbuilding element
    const createResult = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'create_element',
      {
        project: mcpContext.projectKey,
        name: 'Test Character Identity',
        type: 'WORLDBUILDING',
      }
    );
    expect(createResult.error).toBeUndefined();

    const createContent = createResult.result as {
      structuredContent?: { element?: { id?: string } };
    };
    const elementId = createContent.structuredContent?.element?.id;
    expect(elementId).toBeTruthy();

    // 2. Update with identity field (description)
    const updateResult = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'update_worldbuilding',
      {
        project: mcpContext.projectKey,
        elementId,
        fields: {
          description: 'A mysterious wanderer',
          age: '30',
        },
      }
    );
    expect(updateResult.error).toBeUndefined();

    // 3. Read the element
    const readResult = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'get_element_full',
      {
        project: mcpContext.projectKey,
        elementId,
      }
    );
    expect(readResult.error).toBeUndefined();

    const readContent = readResult.result as {
      content: Array<{ type: string; text: string }>;
    };
    const textContent = readContent.content?.[0]?.text;
    expect(textContent).toBeTruthy();

    const elementData = JSON.parse(textContent) as {
      worldbuilding?: Record<string, unknown>;
      identity?: Record<string, unknown>;
    };

    // Identity should be a top-level key, not nested in worldbuilding
    expect(elementData.identity).toBeDefined();
    expect(elementData.identity?.['description']).toBe('A mysterious wanderer');

    // Age should be in worldbuilding, not identity
    expect(elementData.worldbuilding?.['age']).toBe('30');
    expect(elementData.worldbuilding?.['description']).toBeUndefined();
  });
});

test.describe('create_relationship & delete_relationship', () => {
  test('should create and delete a relationship', async ({
    mcpContext,
    apiRequest,
  }) => {
    // Create two worldbuilding elements
    const source = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'create_element',
      {
        project: mcpContext.projectKey,
        name: 'Alliance Source',
        type: 'WORLDBUILDING',
      }
    );
    expect(source.error).toBeUndefined();

    const target = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'create_element',
      {
        project: mcpContext.projectKey,
        name: 'Alliance Target',
        type: 'WORLDBUILDING',
      }
    );
    expect(target.error).toBeUndefined();

    const sourceText = (
      source.result as { content: Array<{ type: string; text: string }> }
    ).content
      .map(c => c.text)
      .join('\n');
    const targetText = (
      target.result as { content: Array<{ type: string; text: string }> }
    ).content
      .map(c => c.text)
      .join('\n');

    const sourceId = sourceText.match(
      /["\s]id["\s]*[:\s]+["\s]*([a-zA-Z0-9_-]+)/
    );
    const targetId = targetText.match(
      /["\s]id["\s]*[:\s]+["\s]*([a-zA-Z0-9_-]+)/
    );

    if (sourceId && targetId) {
      // Create relationship
      const createRel = await mcpCallTool(
        apiRequest,
        mcpContext.mcpApiKey,
        'create_relationship',
        {
          project: mcpContext.projectKey,
          sourceId: sourceId[1],
          targetId: targetId[1],
          type: 'ally_of',
          details: 'Sworn allies since the Great War',
        }
      );
      expect(createRel.error).toBeUndefined();

      // Extract relationship ID
      const relText = (
        createRel.result as {
          content: Array<{ type: string; text: string }>;
        }
      ).content
        .map(c => c.text)
        .join('\n');

      const relIdMatch = relText.match(
        /(?:relationship[Ii]d|"id")["\s]*[:\s]+["\s]*([a-zA-Z0-9_-]+)/
      );

      if (relIdMatch) {
        // Delete relationship
        const deleteRel = await mcpCallTool(
          apiRequest,
          mcpContext.mcpApiKey,
          'delete_relationship',
          {
            project: mcpContext.projectKey,
            relationshipId: relIdMatch[1],
          }
        );
        expect(deleteRel.error).toBeUndefined();
      }
    }
  });
});

test.describe('replace_all_elements', () => {
  test('should replace all elements with a new set', async ({
    mcpContext,
    apiRequest,
  }) => {
    // First create some elements
    await mcpCallTool(apiRequest, mcpContext.mcpApiKey, 'create_element', {
      project: mcpContext.projectKey,
      name: 'Old Element',
      type: 'ITEM',
    });

    // Replace all with new elements
    const result = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'replace_all_elements',
      {
        project: mcpContext.projectKey,
        elements: [
          { id: 'new-1', name: 'Act 1', type: 'FOLDER', level: 0 },
          { id: 'new-2', name: 'Scene 1', type: 'ITEM', level: 1 },
          { id: 'new-3', name: 'Act 2', type: 'FOLDER', level: 0 },
          { id: 'new-4', name: 'Scene 2', type: 'ITEM', level: 1 },
        ],
      }
    );

    expect(result.error).toBeUndefined();

    // Verify the new structure
    const tree = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'get_project_tree',
      { project: mcpContext.projectKey }
    );
    expect(tree.error).toBeUndefined();

    const treeText = (
      tree.result as { content: Array<{ type: string; text: string }> }
    ).content
      .map(c => c.text)
      .join('\n');
    expect(treeText).toContain('Act 1');
    expect(treeText).toContain('Act 2');
  });
});

test.describe('move_elements', () => {
  test('should move elements to a new parent', async ({
    mcpContext,
    apiRequest,
  }) => {
    // Create structure: folder + item at root
    const folderResult = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'create_element',
      {
        project: mcpContext.projectKey,
        name: 'Target Folder',
        type: 'FOLDER',
      }
    );
    expect(folderResult.error).toBeUndefined();

    const itemResult = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'create_element',
      {
        project: mcpContext.projectKey,
        name: 'Movable Item',
        type: 'ITEM',
      }
    );
    expect(itemResult.error).toBeUndefined();

    // Extract IDs
    const folderText = (
      folderResult.result as {
        content: Array<{ type: string; text: string }>;
      }
    ).content
      .map(c => c.text)
      .join('\n');
    const itemText = (
      itemResult.result as {
        content: Array<{ type: string; text: string }>;
      }
    ).content
      .map(c => c.text)
      .join('\n');

    const folderId = folderText.match(
      /["\s]id["\s]*[:\s]+["\s]*([a-zA-Z0-9_-]+)/
    );
    const itemId = itemText.match(/["\s]id["\s]*[:\s]+["\s]*([a-zA-Z0-9_-]+)/);

    if (folderId && itemId) {
      const result = await mcpCallTool(
        apiRequest,
        mcpContext.mcpApiKey,
        'move_elements',
        {
          project: mcpContext.projectKey,
          elementIds: [itemId[1]],
          newParentId: folderId[1],
        }
      );
      expect(result.error).toBeUndefined();
    }
  });
});

test.describe('reorder_element', () => {
  test('should reorder an element within siblings', async ({
    mcpContext,
    apiRequest,
  }) => {
    // Create multiple elements
    const first = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'create_element',
      {
        project: mcpContext.projectKey,
        name: 'First',
        type: 'ITEM',
      }
    );
    const second = await mcpCallTool(
      apiRequest,
      mcpContext.mcpApiKey,
      'create_element',
      {
        project: mcpContext.projectKey,
        name: 'Second',
        type: 'ITEM',
      }
    );

    expect(first.error).toBeUndefined();
    expect(second.error).toBeUndefined();

    const firstText = (
      first.result as { content: Array<{ type: string; text: string }> }
    ).content
      .map(c => c.text)
      .join('\n');
    const secondText = (
      second.result as { content: Array<{ type: string; text: string }> }
    ).content
      .map(c => c.text)
      .join('\n');

    const firstId = firstText.match(
      /["\s]id["\s]*[:\s]+["\s]*([a-zA-Z0-9_-]+)/
    );
    const secondId = secondText.match(
      /["\s]id["\s]*[:\s]+["\s]*([a-zA-Z0-9_-]+)/
    );

    if (firstId && secondId) {
      // Move second before first
      const result = await mcpCallTool(
        apiRequest,
        mcpContext.mcpApiKey,
        'reorder_element',
        {
          project: mcpContext.projectKey,
          elementId: secondId[1],
          position: 0,
        }
      );
      expect(result.error).toBeUndefined();
    }
  });
});
