import { describe, it, expect } from 'bun:test';
import { isOpenAiEndpoint } from '../src/services/openai-lint.service';

describe('isOpenAiEndpoint', () => {
  it('treats an unset endpoint as the default OpenAI API', () => {
    expect(isOpenAiEndpoint(undefined)).toBe(true);
    expect(isOpenAiEndpoint('')).toBe(true);
  });

  it('matches openai.com and its subdomains', () => {
    expect(isOpenAiEndpoint('https://api.openai.com/v1')).toBe(true);
    expect(isOpenAiEndpoint('https://openai.com/v1')).toBe(true);
    expect(isOpenAiEndpoint('https://API.OpenAI.com/v1')).toBe(true);
  });

  it('does not match hosts that merely contain openai.com', () => {
    expect(isOpenAiEndpoint('https://openai.com.example.net/v1')).toBe(false);
    expect(isOpenAiEndpoint('https://evil-openai.com/v1')).toBe(false);
    expect(isOpenAiEndpoint('https://example.net/openai.com/v1')).toBe(false);
    expect(isOpenAiEndpoint('http://localhost:11434/v1')).toBe(false);
  });

  it('returns false for an unparseable endpoint', () => {
    expect(isOpenAiEndpoint('not a url')).toBe(false);
  });
});
