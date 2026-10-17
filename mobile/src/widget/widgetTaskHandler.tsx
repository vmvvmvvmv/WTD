import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { TodayWidget } from './TodayWidget';
import { loadWidgetData } from './widgetData';

// 위젯을 추가·갱신·크기 변경할 때 안드로이드가 호출합니다. 클릭(앱 열기·+ 버튼)은 라이브러리가 직접 처리합니다.
export async function widgetTaskHandler({ renderWidget, widgetAction }: WidgetTaskHandlerProps) {
  if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') return;
  const data = await loadWidgetData().catch(() => null);
  renderWidget(<TodayWidget data={data} />);
}
