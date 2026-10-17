// 일정이 바뀌면 위젯도 바로 갱신합니다. Expo Go에는 위젯 네이티브 모듈이 없어 require 실패를 무시합니다.
export async function refreshWidget() {
  try {
    const { requestWidgetUpdate } = require('react-native-android-widget') as typeof import('react-native-android-widget');
    const { TodayWidget, WIDGET_NAME } = require('./TodayWidget') as typeof import('./TodayWidget');
    const { loadWidgetData } = require('./widgetData') as typeof import('./widgetData');
    await requestWidgetUpdate({
      renderWidget: async () => <TodayWidget data={await loadWidgetData().catch(() => null)} />,
      widgetName: WIDGET_NAME,
    });
  } catch {
    // 위젯이 없거나 지원되지 않는 환경이면 조용히 넘어갑니다.
  }
}
