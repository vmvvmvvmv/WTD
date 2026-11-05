import Constants from 'expo-constants';

export const DEFAULT_API_URL = 'http://localhost:8001';

// API 서버 주소입니다. USB reverse를 쓰는 개발 환경에서는 localhost를 사용합니다.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL;

export const NAVER_MAP_CLIENT_ID = process.env.EXPO_PUBLIC_NAVER_MAP_CLIENT_ID ?? '';

// 시험 기간에 아무나 서버를 부르지 못하게 하는 약한 문턱일 뿐 비밀번호가 아닙니다. APK를 풀면 누구나 볼 수 있으니
// 개인정보나 돈이 드는 기능을 이 값만 믿고 열지 않습니다(서버 쪽 호출 한도는 따로 둠).
export const APP_TEST_TOKEN = process.env.EXPO_PUBLIC_APP_TEST_TOKEN ?? '';

// Expo Push Token 발급에 필요한 EAS 프로젝트 ID입니다.
export const EAS_PROJECT_ID = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;

// Expo Go에서는 원격 푸시 알림이 제한되므로 기능 분기에 사용합니다.
export const IS_EXPO_GO = Constants.appOwnership === 'expo';
