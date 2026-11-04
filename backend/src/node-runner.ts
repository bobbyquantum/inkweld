/**
 * Node.js runtime entrypoint
 * Uses better-sqlite3 for database operations
 */
import { installUnhandledRejectionLogger } from './utils/unhandled-rejection';

// Log a promise rejection nothing handled and keep running
// (utils/unhandled-rejection.ts). Installed before the app loads.
installUnhandledRejectionLogger();

const { default: nodeApp } = await import('./node-app');

export default nodeApp;
