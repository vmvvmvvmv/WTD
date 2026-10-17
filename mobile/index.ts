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

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
