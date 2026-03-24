import axios from 'axios';

/**
 * Waits for axios auth headers to be set before executing a callback.
 * Uses smart polling with 50ms intervals and a 2s timeout fallback.
 *
 * @param callback - Function to execute once headers are ready
 * @param maxWait - Maximum time to wait in milliseconds (default: 2000)
 * @returns Cleanup function to clear intervals and timeouts
 */
export const waitForAuthHeaders = (callback: () => void, maxWait = 2000): (() => void) => {
  const checkInterval = setInterval(() => {
    if (axios.defaults.headers.common.Authorization) {
      clearInterval(checkInterval);
      callback();
    }
  }, 50);

  const timeout = setTimeout(() => {
    clearInterval(checkInterval);
    callback(); // Execute anyway after timeout
  }, maxWait);

  return () => {
    clearInterval(checkInterval);
    clearTimeout(timeout);
  };
};

/**
 * JWT token payload interface
 */
interface TokenPayload {
  sub: string; // username
  role?: string;
  exp?: number;
}

/**
 * Decode JWT token to extract payload.
 *
 * @param token - JWT token string
 * @returns Decoded token payload or null if invalid
 */
export function decodeToken(token: string): TokenPayload | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;

    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join(''),
    );

    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Failed to decode token:', error);
    return null;
  }
}

/**
 * Get the current user's role from localStorage or JWT token.
 *
 * Priority:
 * 1. role from localStorage (set during login)
 * 2. role from decoded JWT token
 * 3. default to 'user' if neither available
 *
 * @returns User's role ('admin', 'user', etc.)
 */
export function getUserRole(): string {
  // First check if role is stored in localStorage
  const storedRole = localStorage.getItem('role');
  if (storedRole) {
    return storedRole;
  }

  // Fall back to decoding JWT token
  const token = localStorage.getItem('mediquery_token');
  if (token) {
    const payload = decodeToken(token);
    if (payload?.role) {
      return payload.role;
    }
  }

  // Default to 'user' role
  return 'user';
}

/**
 * Check if the current user has admin privileges.
 *
 * @returns true if user has 'admin' role, false otherwise
 */
export function isAdmin(): boolean {
  return getUserRole() === 'admin';
}

/**
 * Check if JWT token is expired.
 *
 * @returns true if token is expired or invalid, false if still valid
 */
export function isTokenExpired(): boolean {
  const token = localStorage.getItem('mediquery_token');
  if (!token) return true;

  const payload = decodeToken(token);
  if (!payload?.exp) return true;

  // exp is in seconds, Date.now() is in milliseconds
  const currentTime = Math.floor(Date.now() / 1000);
  return payload.exp < currentTime;
}

/**
 * Get the current username from localStorage or JWT token.
 *
 * @returns Username or empty string if not found
 */
export function getUsername(): string {
  const storedUsername = localStorage.getItem('mediquery_user');
  if (storedUsername) {
    return storedUsername;
  }

  const token = localStorage.getItem('mediquery_token');
  if (token) {
    const payload = decodeToken(token);
    if (payload?.sub) {
      return payload.sub;
    }
  }

  return '';
}

/**
 * Clear all authentication data from localStorage.
 * Should be called on logout.
 */
export function clearAuth(): void {
  localStorage.removeItem('mediquery_token');
  localStorage.removeItem('mediquery_user');
  localStorage.removeItem('role');
}
