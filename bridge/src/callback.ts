// src/callback.ts

import http from 'http';
import { parseInt as parseNumber } from 'lib0/number';

import { getYDocSharedObjectContent, WSSharedDoc } from './utils.js';

/**
 * Safely parses the CALLBACK_OBJECTS environment variable.
 * Ensures that the parsed object conforms to Record<string, string>.
 * Logs an error and returns an empty object if parsing fails.
 */
function parseCallbackObjects(
  envVar: string | undefined
): Record<string, string> {
  if (!envVar) return {};
  try {
    const parsed = JSON.parse(envVar) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
          result[key] = value;
        } else {
          throw new Error(`Value for key "${key}" is not a string.`);
        }
      }
      return result;
    } else {
      throw new Error('Parsed CALLBACK_OBJECTS is not an object.');
    }
  } catch (error) {
    console.error('Error parsing CALLBACK_OBJECTS:', error);
    return {};
  }
}

// Type-safe parsing of CALLBACK_OBJECTS
const CALLBACK_OBJECTS: Record<string, string> = parseCallbackObjects(
  process.env.CALLBACK_OBJECTS
);

const CALLBACK_URL = process.env.CALLBACK_URL
  ? new URL(process.env.CALLBACK_URL)
  : null;
const CALLBACK_TIMEOUT = parseNumber(process.env.CALLBACK_TIMEOUT || '5000');

export const isCallbackSet = !!CALLBACK_URL;

export function callbackHandler(
  update: Uint8Array,
  _origin: unknown, // Changed from 'any' to 'unknown'
  doc: WSSharedDoc
) {
  const room = doc.name;

  // Define a more specific type for dataToSend to avoid using 'any'
  const dataToSend: {
    room: string;
    data: Record<string, { type: string; content: unknown }>;
  } = {
    room,
    data: {},
  };

  for (const [sharedObjectName, sharedObjectType] of Object.entries(
    CALLBACK_OBJECTS
  )) {
    dataToSend.data[sharedObjectName] = {
      type: sharedObjectType,
      content: getYDocSharedObjectContent(
        doc,
        sharedObjectName,
        sharedObjectType
      ),
    };
  }

  if (CALLBACK_URL) {
    callbackRequest(CALLBACK_URL, CALLBACK_TIMEOUT, dataToSend);
  }
}

function callbackRequest(url: URL, timeout: number, data: object): void {
  const body = JSON.stringify(data);
  const options: http.RequestOptions = {
    hostname: url.hostname,
    port: url.port || 80, // Default to port 80 if not specified
    path: url.pathname,
    timeout,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  const req = http.request(options, res => {
    // Optional: Handle response if needed
    res.on('data', () => {}); // Consume data to free up memory
  });

  req.on('timeout', () => {
    console.warn('Callback request timed out.');
    req.destroy();
  });

  req.on('error', e => {
    console.error('Callback request error.', e);
    req.destroy();
  });

  req.write(body);
  req.end();
}
