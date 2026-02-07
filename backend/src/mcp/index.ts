/**
 * MCP (Model Context Protocol) Module
 *
 * Exports all MCP functionality for use in routes.
 */

// Core exports
export * from './mcp.types';
export * from './mcp.auth';
export {
  handleMcpRequest,
  registerResourceHandler,
  registerTool,
  registerPrompt,
} from './mcp.handler';

// Register resources (side effects - they self-register)
// Only projects are listed as resources - tools handle the rest
import './resources/projects.resource';

// Register tools (side effects - they self-register)
import './tools/search.tools';
import './tools/mutation.tools';
import './tools/image.tools';
