import { apiClient } from './client';

export function getMyPage() {
  return apiClient.post('/api/mypage/');
}

export function updateProfile(payload: FormData) {
  return apiClient.post('/api/update/', payload, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
}

export function updatePassword(payload: { currentPassword: string; newPassword: string }) {
  return apiClient.post('/api/update_password/', payload);
}

export function getAddressInfo() {
  return apiClient.get('/api/getAddressInfo');
}
