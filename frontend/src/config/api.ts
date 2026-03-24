// API Configuration - Single Source of Truth
// This uses Vite's environment variable system
// Values come from:
// - .env file for local development (npm run dev)
// - Docker build args for containerized deployment (docker-compose)

export const API_CONFIG = {
  // Uses empty string locally so requests are relative (e.g., /api/login)
  // This allows the Vite dev server proxy (vite.config.ts) to intercept and route them.
  // Super-defensive environment variable access to support Vite (browser) and Node.js (E2E tests)
  BASE_URL: import.meta.env?.VITE_API_URL ?? '',
} as const;

export const getApiUrl = (endpoint: string): string => {
  // Ensure endpoint has a leading slash
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // Ensure we use the proper API v1 prefix which aligns with backend routing
  // and allows Vite development server proxy rules to accurately route requests.
  const apiPath = cleanEndpoint.startsWith('/api/') ? cleanEndpoint : `/api/v1${cleanEndpoint}`;

  return `${API_CONFIG.BASE_URL}${apiPath}`;
};
