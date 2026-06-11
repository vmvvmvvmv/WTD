import { apiClient } from './client';

export function checkAuth() {
  return apiClient.post('/api/check-auth/');
}

export function login(payload: { username: string; password: string }) {
  return apiClient.post('/api/login/', payload);
}

export function logout() {
  return apiClient.post('/api/logout/');
}

export function register(payload: {
  username: string;
  password: string;
  email?: string;
  city?: string;
  region?: string;
}) {
  return apiClient.post('/api/register/', payload);
}
