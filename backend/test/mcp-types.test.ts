import { describe, it, expect } from 'bun:test';
import { McpRpcError, JSON_RPC_ERRORS } from '../src/mcp/mcp.types';

describe('McpRpcError', () => {
  it('should create an error with code and message', () => {
    const error = new McpRpcError(JSON_RPC_ERRORS.METHOD_NOT_FOUND, 'Unknown tool: foo');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(McpRpcError);
    expect(error.code).toBe(JSON_RPC_ERRORS.METHOD_NOT_FOUND);
    expect(error.message).toBe('Unknown tool: foo');
  });

  it('should be catchable as an Error', () => {
    try {
      throw new McpRpcError(JSON_RPC_ERRORS.INVALID_REQUEST, 'Permission denied');
    } catch (err) {
      expect(err instanceof McpRpcError).toBe(true);
      expect((err as McpRpcError).code).toBe(JSON_RPC_ERRORS.INVALID_REQUEST);
    }
  });

  it('should work with RESOURCE_NOT_FOUND code', () => {
    const error = new McpRpcError(
      JSON_RPC_ERRORS.RESOURCE_NOT_FOUND,
      'Resource not found: test://uri'
    );
    expect(error.code).toBe(-32002);
    expect(error.message).toBe('Resource not found: test://uri');
  });
});
