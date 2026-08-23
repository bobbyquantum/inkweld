import { describe, it, expect } from 'bun:test';
import { McpRpcError, JSON_RPC_ERRORS, MCP_PROTOCOL_VERSION } from '../src/mcp/mcp.types';

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
      expect(err).toBeInstanceOf(McpRpcError);
      expect((err as McpRpcError).code).toBe(JSON_RPC_ERRORS.INVALID_REQUEST);
    }
  });

  it('should work with RESOURCE_NOT_FOUND code', () => {
    const error = new McpRpcError(
      JSON_RPC_ERRORS.RESOURCE_NOT_FOUND,
      'Resource not found: test://uri'
    );
    expect(error.code).toBe(-32602);
    expect(error.message).toBe('Resource not found: test://uri');
  });

  it('should carry optional data payload for protocol errors', () => {
    const error = new McpRpcError(
      JSON_RPC_ERRORS.UNSUPPORTED_PROTOCOL_VERSION,
      'Unsupported protocol version',
      { supported: ['2026-07-28'], requested: '2025-11-25' }
    );
    expect(error.code).toBe(-32022);
    expect(error.data).toEqual({ supported: ['2026-07-28'], requested: '2025-11-25' });
  });

  it('should expose the 2026-07-28 protocol error codes', () => {
    expect(JSON_RPC_ERRORS.HEADER_MISMATCH).toBe(-32020);
    expect(JSON_RPC_ERRORS.MISSING_REQUIRED_CLIENT_CAPABILITY).toBe(-32021);
    expect(JSON_RPC_ERRORS.UNSUPPORTED_PROTOCOL_VERSION).toBe(-32022);
    expect(MCP_PROTOCOL_VERSION).toBe('2026-07-28');
  });
});
