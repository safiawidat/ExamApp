import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import {
  DEFAULT_API_BASE_URL,
  resolveApiBaseUrl,
} from './apiBaseUrl.js';

const productionOptions = (configuredBaseUrl) => ({
  configuredBaseUrl,
  isProduction: true,
});

describe('API base URL configuration', () => {
  test('uses the localhost fallback when the development variable is absent', () => {
    expect(resolveApiBaseUrl({
      configuredBaseUrl: undefined,
      isProduction: false,
    })).toBe(DEFAULT_API_BASE_URL);
  });

  test('accepts an explicit absolute development URL', () => {
    expect(resolveApiBaseUrl({
      configuredBaseUrl: 'http://127.0.0.1:4000/api',
      isProduction: false,
    })).toBe('http://127.0.0.1:4000/api');
  });

  test('accepts a valid HTTPS production URL', () => {
    expect(resolveApiBaseUrl(productionOptions('https://api.example.test/api')))
      .toBe('https://api.example.test/api');
  });

  test('normalizes trailing slashes', () => {
    expect(resolveApiBaseUrl(productionOptions('https://api.example.test/api///')))
      .toBe('https://api.example.test/api');
  });

  test('rejects a missing production variable', () => {
    expect(() => resolveApiBaseUrl(productionOptions(undefined)))
      .toThrow('VITE_API_BASE_URL is required');
  });

  test('rejects a blank production variable', () => {
    expect(() => resolveApiBaseUrl(productionOptions('   ')))
      .toThrow('VITE_API_BASE_URL must not be blank');
  });

  test('rejects a malformed URL', () => {
    expect(() => resolveApiBaseUrl(productionOptions('not a URL')))
      .toThrow('absolute HTTP(S) URL');
  });

  test('rejects an unsupported URL scheme', () => {
    expect(() => resolveApiBaseUrl(productionOptions('ftp://api.example.test/api')))
      .toThrow('http:// or https://');
  });

  test.each([
    ['https://user:password@api.example.test/api', 'must not contain credentials'],
    ['https://api.example.test/api?preview=true', 'must not contain a query or fragment'],
    ['https://api.example.test/api#preview', 'must not contain a query or fragment'],
  ])('rejects unsafe production URL content: %s', (configuredBaseUrl, expectedMessage) => {
    expect(() => resolveApiBaseUrl(productionOptions(configuredBaseUrl)))
      .toThrow(expectedMessage);
  });

  test.each([
    'http://localhost:3001/api',
    'https://127.0.0.1:3001/api',
    'https://[::1]:3001/api',
  ])('rejects a production localhost URL: %s', (configuredBaseUrl) => {
    expect(() => resolveApiBaseUrl(productionOptions(configuredBaseUrl)))
      .toThrow('must not point to localhost');
  });

  test('rejects plain HTTP for a non-local production target', () => {
    expect(() => resolveApiBaseUrl(productionOptions('http://api.example.test/api')))
      .toThrow('must use https://');
  });

  test('does not echo a malformed environment value in its error', () => {
    const configuredBaseUrl = 'private-unrelated-environment-value';

    expect(() => resolveApiBaseUrl(productionOptions(configuredBaseUrl)))
      .toThrow(expect.not.stringContaining(configuredBaseUrl));
  });
});

describe('API requests', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/api///');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test('uses the normalized base and preserves authenticated request behavior', async () => {
    const { API_BASE_URL, AUTH_TOKEN_KEY, apiRequest } = await import('./apiClient.js');
    sessionStorage.setItem(AUTH_TOKEN_KEY, 'test-only-token');

    await expect(apiRequest('/auth/me', { auth: true })).resolves.toEqual({ ok: true });
    expect(API_BASE_URL).toBe('https://api.example.test/api');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.test/api/auth/me',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );

    const requestOptions = fetch.mock.calls[0][1];
    expect(requestOptions.headers.get('Authorization')).toBe('Bearer test-only-token');
  });
});
