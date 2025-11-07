import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { app } from '../src/index';

describe('Health Check', () => {
  it('should return 200 for health check', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
  });

  it('should return 200 for readiness check', async () => {
    const res = await app.request('/api/health/ready');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ready');
  });
});

describe('Config', () => {
  it('should return config', async () => {
    const res = await app.request('/api/config');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('version');
  });
});

describe('Root', () => {
  it('should return API info', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe('Inkweld API');
  });
});
