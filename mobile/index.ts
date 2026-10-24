import { registerRootComponent } from 'expo';

import App from './App';

// 홈 화면 위젯 갱신 핸들러. Expo Go에는 위젯 네이티브 모듈이 없어 등록 실패를 무시합니다.
try {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widget/widgetTaskHandler');
  registerWidgetTaskHandler(widgetTaskHandler);
} catch {
  // 위젯 없이 앱만 실행합니다.
}

// 일정 알림 백그라운드 갱신 작업. 앱이 꺼진 상태에서 깨어날 때도 찾을 수 있게 시작 파일에서 정의합니다.
try {
  const { defineCalendarReminderTask } = require('./src/features/calendar/calendarReminderBackground');
  defineCalendarReminderTask();
} catch {
  // 네이티브 모듈이 없는 환경(Expo Go)에서는 앱이 열려 있을 때만 갱신합니다.
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
