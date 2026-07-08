/**
 * Mock OpenAI-compatible LLM HTTP server for e2e tests.
 *
 * Spins up a tiny Node `http` server that responds to
 * `POST /v1/chat/completions` (and the equivalent without `/v1`) with a
 * canned `DocumentLintResponseDto` payload shaped as an OpenAI chat
 * completion. The backend's `openai-lint.service.processDocument()` will
 * parse the JSON string inside `choices[0].message.content` and turn the
 * `corrections` into `auto_review` marks on the Yjs doc — exactly what the
 * real LLM would return.
 *
 * The mock inspects the user message (which contains `[P0] ...`,
 * `[P1] ...` paragraph prefixes produced by the backend) and emits
 * deterministic corrections for known trigger phrases:
 *
 *   • "This are" → "This is"            (grammar, paragraph_index 0)
 *   • "Their is" → "There is"           (grammar, paragraph_index 0)
 *   • "He dont" → "He doesn't"          (grammar, paragraph_index 0)
 *
 * Unknown paragraphs produce no corrections, simulating a clean review.
 *
 * The server is intentionally stateless so parallel test workers can all
 * hit the same instance without interference.
 */

import * as http from 'http';
import type { AddressInfo } from 'net';

import { getFreePort } from './free-port';

/** Shape returned inside `choices[0].message.content` as a JSON string. */
interface DocumentLintResponseDto {
  corrections: Array<{
    paragraph_index: number;
    start_pos: number;
    end_pos: number;
    original_text: string;
    corrected_text: string;
    error_type: string;
    recommendation: string;
  }>;
  style_recommendations: Array<{ suggestion: string; reason: string }>;
}

export interface MockLlmServer {
  port: number;
  url: string;
  close(): Promise<void>;
}

/**
 * Pattern table: trigger phrase → correction. The first 8 characters of
 * each trigger must match the substring we search for in the user payload.
 */
const PATTERNS: Array<{
  trigger: string;
  corrected: string;
  paragraph_index: number;
  error_type: string;
  recommendation: string;
}> = [
  {
    trigger: 'This are',
    corrected: 'This is',
    paragraph_index: 0,
    error_type: 'grammar',
    recommendation: 'Subject-verb agreement: "are" should be "is".',
  },
  {
    trigger: 'Their is',
    corrected: 'There is',
    paragraph_index: 0,
    error_type: 'grammar',
    recommendation: 'Use "There" for existence statements.',
  },
  {
    trigger: 'He dont',
    corrected: "He doesn't",
    paragraph_index: 0,
    error_type: 'grammar',
    recommendation: 'Contraction requires an apostrophe.',
  },
];

/**
 * Inspect the chat-completion request body and return a canned
 * `DocumentLintResponseDto` based on the user message contents.
 *
 * The user message looks like:
 *   [P0] This are a test.
 *   [P1] Another paragraph.
 *
 * We scan each ` [P<N>] ` section for known phrases, returning offsets
 * relative to that paragraph's flat text.
 */
function buildCannedResponse(userMessage: string): DocumentLintResponseDto {
  // Split on the [PN] markers; keep each paragraph's text.
  const paragraphs = userMessage
    .split(/\[P\d+\]\s*/)
    .filter(Boolean)
    .map(s => s.trim());

  const corrections: DocumentLintResponseDto['corrections'] = [];

  paragraphs.forEach((text, idx) => {
    for (const pattern of PATTERNS) {
      if (pattern.paragraph_index !== idx) continue;
      const idx2 = text.indexOf(pattern.trigger);
      if (idx2 >= 0) {
        corrections.push({
          paragraph_index: idx,
          start_pos: idx2,
          end_pos: idx2 + pattern.trigger.length,
          original_text: pattern.trigger,
          corrected_text: pattern.corrected,
          error_type: pattern.error_type,
          recommendation: pattern.recommendation,
        });
      }
    }
  });

  return {
    corrections,
    style_recommendations: [],
  };
}

/**
 * Start the mock OpenAI-compatible chat-completions server on a free port.
 * Returns the bound port and a `close()` handle.
 */
export async function startMockLlmServer(
  preferredPort?: number
): Promise<MockLlmServer> {
  const port = preferredPort ?? (await getFreePort());

  const server = http.createServer((req, res) => {
    // Health probe used by globalSetup to verify the server is ready.
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // OpenAI chat completions endpoint — accepts both /v1/chat/completions
    // and /chat/completions (the backend appends /chat/completions to the
    // configured endpoint, so we support both prefix variants).
    if (
      req.method === 'POST' &&
      (req.url === '/v1/chat/completions' ||
        req.url === '/chat/completions' ||
        req.url === '/v1/chat/completions/' ||
        req.url === '/chat/completions/')
    ) {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        let userMessage = '';
        try {
          const parsed = JSON.parse(body) as {
            messages?: Array<{ role: string; content: string }>;
          };
          const userMsg = parsed.messages?.find(m => m.role === 'user');
          userMessage = userMsg?.content ?? '';
        } catch {
          // Malformed body — respond with empty corrections.
        }

        const lintResponse = buildCannedResponse(userMessage);
        const openAiResponse = {
          id: 'chatcmpl-mock',
          object: 'chat.completion',
          model: 'mock-llm',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify(lintResponse),
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          },
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(openAiResponse));
      });
      return;
    }

    // 404 for any other path — surfaces accidental misconfiguration.
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Not mocked: ${req.method} ${req.url}` }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;

  return {
    port: address.port,
    url: `http://127.0.0.1:${address.port}/v1`,
    close: () =>
      new Promise<void>(resolve => {
        server.close(() => resolve());
      }),
  };
}

/**
 * Wait for the mock LLM server to become reachable.
 * Used by globalSetup to avoid races with the first /review call.
 */
export async function waitForMockLlm(server: MockLlmServer): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const res = await fetch(`${server.url.replace(/\/v1$/, '')}/health`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Mock LLM server at ${server.url} did not become ready`);
}
