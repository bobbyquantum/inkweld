/**
 * MCP permission scopes checked by the tool layer against an OAuth grant's
 * permissions.
 */
export const MCP_PERMISSIONS = {
  // Read permissions
  READ_PROJECT: 'read:project',
  READ_ELEMENTS: 'read:elements',
  READ_WORLDBUILDING: 'read:worldbuilding',
  READ_SCHEMAS: 'read:schemas',

  // Write permissions
  WRITE_ELEMENTS: 'write:elements',
  WRITE_WORLDBUILDING: 'write:worldbuilding',
} as const;

export type McpPermission = (typeof MCP_PERMISSIONS)[keyof typeof MCP_PERMISSIONS];
