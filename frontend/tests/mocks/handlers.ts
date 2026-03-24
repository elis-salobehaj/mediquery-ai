import { HttpResponse, http } from 'msw';

export const handlers = [
  // Mock login endpoint
  http.post('/api/v1/auth/token', () => {
    return HttpResponse.json({
      access_token: 'mock-access-token',
      token_type: 'bearer',
      expires_in: 3600,
    });
  }),

  // Mock user profile endpoint
  http.get('/api/v1/auth/me', () => {
    return HttpResponse.json({
      id: 1,
      email: 'guest@example.com',
      is_active: true,
      role: 'guest',
    });
  }),

  // Add more handlers as needed to match the schema
];
