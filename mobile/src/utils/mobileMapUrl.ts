import { API_URL, APP_TEST_TOKEN } from '../config/runtime';

// 서버가 내려주는 지도 페이지(WebView) 주소. 안드로이드 에뮬레이터는 localhost 대신 127.0.0.1을 씁니다.
const MOBILE_MAP_URL = `${API_URL.replace(/\/$/, '').replace(/^http:\/\/localhost(?=[:/]|$)/, 'http://127.0.0.1')}/dust/mobile-map/`;

export function buildMobileMapUrl(params?: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  if (APP_TEST_TOKEN) query.set('app_test_token', APP_TEST_TOKEN);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined) query.set(key, String(value));
  });
  const suffix = query.toString();
  return `${MOBILE_MAP_URL}${suffix ? `?${suffix}` : ''}`;
}
