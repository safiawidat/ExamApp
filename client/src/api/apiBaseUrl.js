export const DEFAULT_API_BASE_URL = 'http://localhost:3001/api';

const isLocalHostname = (hostname) => {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');

  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || /^127(?:\.\d{1,3}){3}$/.test(normalized)
    || normalized === '0.0.0.0'
    || normalized === '[::1]';
};

export const resolveApiBaseUrl = ({ configuredBaseUrl, isProduction }) => {
  if (configuredBaseUrl === undefined) {
    if (isProduction) {
      throw new Error('VITE_API_BASE_URL is required for production builds.');
    }

    return DEFAULT_API_BASE_URL;
  }

  const trimmedBaseUrl = configuredBaseUrl.trim();

  if (!trimmedBaseUrl) {
    if (isProduction) {
      throw new Error('VITE_API_BASE_URL must not be blank in production.');
    }

    return DEFAULT_API_BASE_URL;
  }

  let parsedBaseUrl;

  try {
    parsedBaseUrl = new URL(trimmedBaseUrl);
  } catch {
    throw new Error('VITE_API_BASE_URL must be an absolute HTTP(S) URL.');
  }

  if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
    throw new Error('VITE_API_BASE_URL must use http:// or https://.');
  }

  if (parsedBaseUrl.username || parsedBaseUrl.password) {
    throw new Error('VITE_API_BASE_URL must not contain credentials.');
  }

  if (parsedBaseUrl.search || parsedBaseUrl.hash) {
    throw new Error('VITE_API_BASE_URL must not contain a query or fragment.');
  }

  if (isProduction) {
    if (isLocalHostname(parsedBaseUrl.hostname)) {
      throw new Error('VITE_API_BASE_URL must not point to localhost in production.');
    }

    if (parsedBaseUrl.protocol !== 'https:') {
      throw new Error('VITE_API_BASE_URL must use https:// in production.');
    }
  }

  return parsedBaseUrl.toString().replace(/\/+$/, '');
};
