import { FlexWidget, ImageWidget, TextWidget } from 'react-native-android-widget';

import { WEATHER_ICON_SOURCES } from '../components/shared/WeatherIcon';
import { semanticColors } from '../theme/semanticColors';
import type { WidgetData, WidgetHour } from './widgetData';

export const WIDGET_NAME = 'TodayWidget';
export const CALENDAR_URI = 'weathertodo://calendar';

const COLORS = { accent: '#2563EB', bg: '#F4F8FC', card: '#FFFFFF', sub: '#5B6B7C', text: '#1B2430' } as const;

// 실제 위젯 높이는 약 175dp(4x2칸)라 세로 여백을 최소로 씁니다.
const PADDING = 10;
const GAP = 6;
const CARD_PADDING = 8;
const HEADER_HEIGHT = 44;
const MAX_EVENTS = 2;

function Card({ children, flex, marginLeft }: { children: React.ReactNode; flex: number; marginLeft?: number }) {
  return (
    <FlexWidget style={{ backgroundColor: COLORS.card, borderRadius: 16, flex, height: 'match_parent', marginLeft, padding: CARD_PADDING }}>
      {children}
    </FlexWidget>
  );
}

// 시간대별 날씨 한 칸: 시각, 날씨 아이콘, 기온, 비 올 확률.
function HourColumn({ hour }: { hour: WidgetHour }) {
  const rainy = (hour.rainProbability ?? 0) >= 30;
  return (
    <FlexWidget style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
      <TextWidget style={{ color: COLORS.sub, fontSize: 11, fontWeight: '600' }} text={hour.timeLabel} />
      {hour.kind !== 'unknown' && <ImageWidget image={WEATHER_ICON_SOURCES[hour.kind]} imageHeight={26} imageWidth={26} />}
      <TextWidget style={{ color: COLORS.text, fontSize: 15, fontWeight: '700' }} text={hour.temperature === undefined ? '-' : `${Math.round(hour.temperature)}°`} />
      <TextWidget style={{ color: rainy ? COLORS.accent : COLORS.sub, fontSize: 11, fontWeight: '600' }} text={hour.rainProbability === undefined ? '-' : `${Math.round(hour.rainProbability)}%`} />
    </FlexWidget>
  );
}

// 오늘 일정: 시간 + 제목. 제목이 길면 카드 폭에서 "..."으로 줄이고, 2건을 넘으면 "외 N건"을 붙입니다.
function EventsCard({ data }: { data: WidgetData }) {
  const shown = data.events.slice(0, MAX_EVENTS);
  const extra = data.events.length - shown.length;
  // 위젯 라이브러리는 React 프래그먼트(<>)를 지원하지 않아 FlexWidget으로 감쌉니다.
  return (
    <FlexWidget style={{ flex: 1, width: 'match_parent' }}>
      <TextWidget style={{ color: COLORS.sub, fontSize: 11, fontWeight: '700' }} text="오늘 일정" />
      {shown.length === 0
        ? (
          <FlexWidget style={{ alignItems: 'center', flex: 1, justifyContent: 'center', width: 'match_parent' }}>
            <TextWidget style={{ color: COLORS.sub, fontSize: 13 }} text="일정 없음" />
          </FlexWidget>
        )
        : (
          <FlexWidget style={{ flex: 1, justifyContent: 'center', width: 'match_parent' }}>
            {shown.map((event, index) => (
              <FlexWidget key={event.id} style={{ alignItems: 'center', flexDirection: 'row', marginTop: index === 0 ? 0 : 6, width: 'match_parent' }}>
                <TextWidget style={{ color: COLORS.accent, fontSize: 13, fontWeight: '700' }} text={event.time} />
                <FlexWidget style={{ flex: 1, marginLeft: 5 }}>
                  <TextWidget maxLines={1} style={{ color: COLORS.text, fontSize: 13, width: 'match_parent' }} text={event.title} truncate="END" />
                </FlexWidget>
              </FlexWidget>
            ))}
            {extra > 0 && <TextWidget style={{ color: COLORS.sub, fontSize: 12, fontWeight: '600', marginTop: 4 }} text={`외 ${extra}건`} />}
          </FlexWidget>
        )}
    </FlexWidget>
  );
}

// 폰이 알려 주는 위젯 크기는 기기마다 부정확해서(삼성은 실제보다 크게 보고) 크기를 계산하지 않고 비율(flex)로만 나눕니다.
export function TodayWidget({ data }: { data: WidgetData | null }) {
  if (!data) {
    return (
      <FlexWidget clickAction="OPEN_APP" style={{ alignItems: 'center', backgroundColor: COLORS.bg, borderRadius: 28, height: 'match_parent', justifyContent: 'center', width: 'match_parent' }}>
        <TextWidget style={{ color: COLORS.sub, fontSize: 14 }} text="앱을 열어 지역을 선택해 주세요" />
      </FlexWidget>
    );
  }
  const gradeTone = semanticColors.airQuality[data.dustGrade].tone;
  const weatherIcon = data.weatherKind === 'unknown' ? null : WEATHER_ICON_SOURCES[data.weatherKind];
  const dustText = `미세먼지 ${data.dustValue === undefined ? '-' : Math.round(data.dustValue)} ${data.dustLabel}`;

  return (
    <FlexWidget clickAction="OPEN_APP" style={{ backgroundColor: COLORS.bg, borderRadius: 28, flexDirection: 'column', height: 'match_parent', padding: PADDING, width: 'match_parent' }}>
      <FlexWidget style={{ alignItems: 'center', flexDirection: 'row', height: HEADER_HEIGHT, justifyContent: 'space-between', width: 'match_parent' }}>
        <FlexWidget style={{ alignItems: 'center', flexDirection: 'row' }}>
          {weatherIcon && <ImageWidget image={weatherIcon} imageHeight={40} imageWidth={40} />}
          <TextWidget style={{ color: COLORS.text, fontSize: 28, fontWeight: '700', marginLeft: 4 }} text={data.temperature === undefined ? '-' : `${Math.round(data.temperature)}°`} />
          <FlexWidget style={{ marginLeft: 8 }}>
            <TextWidget maxLines={1} style={{ color: COLORS.text, fontSize: 14, fontWeight: '600' }} text={`${data.regionLabel} · ${data.weatherLabel}`} />
            <TextWidget maxLines={1} style={{ color: gradeTone, fontSize: 12, fontWeight: '700' }} text={dustText} />
          </FlexWidget>
        </FlexWidget>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: CALENDAR_URI }}
          style={{ alignItems: 'center', backgroundColor: COLORS.accent, borderRadius: 19, height: 38, justifyContent: 'center', width: 38 }}
        >
          <TextWidget style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '700' }} text="+" />
        </FlexWidget>
      </FlexWidget>

      <FlexWidget style={{ flex: 1, flexDirection: 'row', marginTop: GAP, width: 'match_parent' }}>
        <Card flex={4}>
          <EventsCard data={data} />
        </Card>
        <Card flex={6} marginLeft={GAP}>
          <FlexWidget style={{ alignItems: 'center', flex: 1, flexDirection: 'row', width: 'match_parent' }}>
            {data.hours.length > 0
              ? data.hours.map((hour, index) => <HourColumn hour={hour} key={index} />)
              : <TextWidget style={{ color: COLORS.sub, fontSize: 13 }} text="예보를 불러오지 못했어요" />}
          </FlexWidget>
        </Card>
      </FlexWidget>
    </FlexWidget>
  );
}
