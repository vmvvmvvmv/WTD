import axios from 'axios';

import { API_URL, APP_TEST_TOKEN, NAVER_MAP_CLIENT_ID } from '../config/runtime';

export { API_URL, NAVER_MAP_CLIENT_ID };

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: APP_TEST_TOKEN ? { 'X-App-Test-Token': APP_TEST_TOKEN } : undefined,
  timeout: 12000,
  withCredentials: true,
});
