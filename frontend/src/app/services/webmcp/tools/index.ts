/**
 * The WebMCP tool set. Loaded lazily by `WebMcpService` only when the user
 * has turned WebMCP on and the browser supports it, so none of this (nor the
 * editor stack it reaches) is part of the initial bundle.
 */
export { buildAppTools, buildProjectTools } from './catalog';
export { WebMcpRegistry } from './registry';
