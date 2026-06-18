import { Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Animated } from 'react-native';
import type { ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useEffect, useRef, useState } from 'react';

import { styles } from '../../styles/appStyles';
import type { CalendarEvent, HourlyDustItem, PredictionResponse, WeatherHourlyItem, WeatherMidTermItem, WeatherState } from '../../types/dust';
import { getO3Label, getO3Tone, getPm10Label, getPm10Tone, getPm25Label, getPm25Tone, toNumber } from '../../utils/dust';
import { buildCalendarRiskByEvent, type CalendarLocationForecast } from '../calendar/calendarForecast';
import { isDateInEventRange } from '../calendar/calendarUtils';
import { calculateOutingIndex, getOutingGrade, getOutingTone } from '../calendar/outingIndex';


// 홈 탭의 현재 미세먼지 상태, 주요 오염물질 카드, 최근/예측 흐름을 보여줍니다.
export function HomePanel({
  currentPm10,
  currentPm25,
  currentO3,
  accentSoftTone,
  accentTone,
  calendarEvents,
  eventLocationForecasts,
  onOpenCalendar,
  onOpenDetail,
  onOpenMap,
  mapPreviewUrl,
  mapPreviewLabel,
  hourlyItems,
  weatherHourlyItems,
  weatherMidTermItems,
  prediction,
  todayDateLabel,
  weather,
}: {
  currentPm10?: number;
  currentPm25?: number;
  currentO3?: number;
  accentSoftTone: string;
  accentTone: string;
  calendarEvents?: CalendarEvent[];
  eventLocationForecasts?: Record<string, CalendarLocationForecast>;
  onOpenCalendar?: () => void;
  onOpenDetail: () => void;
  onOpenMap: () => void;
  mapPreviewUrl: string;
  mapPreviewLabel: string;
  hourlyItems: HourlyDustItem[];
  weatherHourlyItems: WeatherHourlyItem[];
  weatherMidTermItems?: WeatherMidTermItem[];
  prediction: PredictionResponse | null;
  todayDateLabel: string;
  weather?: WeatherState | null;
}) {
  const [activeGaugeIndex, setActiveGaugeIndex] = useState(0);
  const [gaugeCarouselWidth, setGaugeCarouselWidth] = useState(0);
  const gaugeItemWidth = 130;
  const gaugeScrollX = useRef(new Animated.Value(gaugeItemWidth)).current;
  const gaugeScrollRef = useRef<ScrollView | null>(null);
  const outingIndex = calculateOutingIndex({
    pm10: currentPm10,
    rainMm: weather?.rainMm,
    temperature: weather?.temperature,
    weatherLabel: weather?.label,
    windSpeed: weather?.windSpeed,
  });
  const getTemperatureGrade = (value?: number) => {
    if (typeof value !== 'number') return '확인 중';
    if (value >= 33) return '폭염';
    if (value >= 28) return '더움';
    if (value <= -5) return '한파';
    if (value <= 5) return '추움';
    return '적정';
  };
  const getTemperatureTone = (value?: number) => {
    if (typeof value !== 'number') return '#687180';
    if (value >= 30) return '#d94b4b';
    if (value <= 5) return '#2f80ed';
    return '#279b64';
  };
  const getWindGrade = (value?: number) => {
    if (typeof value !== 'number') return '확인 중';
    if (value >= 9) return '강풍';
    if (value >= 5) return '바람';
    return '잔잔';
  };
  const getWindTone = (value?: number) => {
    if (typeof value !== 'number') return '#687180';
    if (value >= 9) return '#d94b4b';
    if (value >= 5) return '#c58a19';
    return '#2f80ed';
  };
  const getWindDirectionLabel = (value?: number) => {
    if (typeof value !== 'number') return '';
    const directions = ['북풍', '북동풍', '동풍', '남동풍', '남풍', '남서풍', '서풍', '북서풍'];
    const normalized = ((value % 360) + 360) % 360;
    return directions[Math.round(normalized / 45) % directions.length];
  };
  const getHumidityGrade = (value?: number) => {
    if (typeof value !== 'number') return '확인 중';
    if (value >= 80) return '습함';
    if (value <= 35) return '건조';
    return '보통';
  };
  const getHumidityTone = (value?: number) => {
    if (typeof value !== 'number') return '#687180';
    if (value >= 80) return '#2f80ed';
    if (value <= 35) return '#c58a19';
    return '#279b64';
  };
  const getRainGrade = (value?: number) => {
    if (typeof value !== 'number') return '확인 중';
    if (value >= 10) return '강수';
    if (value > 0) return '비';
    return '없음';
  };
  const getRainTone = (value?: number) => {
    if (typeof value !== 'number') return '#687180';
    if (value >= 10) return '#2f80ed';
    if (value > 0) return '#4f8fd9';
    return '#279b64';
  };
  const metricGaugeItems = [
    { code: '외출', decimals: 0, grade: getOutingGrade(outingIndex), index: 0, label: '외출 지수', max: 100, tone: getOutingTone(outingIndex), unit: '점', value: outingIndex },
    { code: 'PM10', decimals: 0, grade: getPm10Label(currentPm10), index: 1, label: '미세먼지', max: 150, tone: getPm10Tone(currentPm10), unit: 'µg/m³', value: currentPm10 },
    { code: 'PM2.5', decimals: 0, grade: getPm25Label(currentPm25), index: 2, label: '초미세먼지', max: 75, tone: getPm25Tone(currentPm25), unit: 'µg/m³', value: currentPm25 },
    { code: 'O3', decimals: 3, grade: getO3Label(currentO3), index: 3, label: '오존', max: 0.15, tone: getO3Tone(currentO3), unit: 'ppm', value: currentO3 },
    { code: 'TEMP', decimals: 0, grade: getTemperatureGrade(weather?.temperature), index: 4, label: '기온', max: 40, tone: getTemperatureTone(weather?.temperature), unit: '°C', value: weather?.temperature },
    { code: 'WIND', decimals: 1, grade: getWindGrade(weather?.windSpeed), index: 5, label: '풍속', max: 12, tone: getWindTone(weather?.windSpeed), unit: [getWindDirectionLabel(weather?.windDirection), 'm/s'].filter(Boolean).join(' · '), value: weather?.windSpeed },
    { code: 'HUM', decimals: 0, grade: getHumidityGrade(weather?.humidity), index: 6, label: '습도', max: 100, tone: getHumidityTone(weather?.humidity), unit: '%', value: weather?.humidity },
    { code: 'RAIN', decimals: 1, grade: getRainGrade(weather?.rainMm), index: 7, label: '강수', max: 20, tone: getRainTone(weather?.rainMm), unit: 'mm', value: weather?.rainMm },
  ];
  const loopedGaugeItems = [...metricGaugeItems, ...metricGaugeItems, ...metricGaugeItems];
  const loopStartIndex = metricGaugeItems.length;
  const activeGaugeCode = metricGaugeItems[activeGaugeIndex]?.code;
  const activeGaugeBasis = activeGaugeIndex === 0
    ? '공기+날씨'
    : ['TEMP', 'WIND', 'HUM', 'RAIN'].includes(activeGaugeCode)
      ? '현재 날씨'
      : '가까운 측정소';
  const gaugeSidePadding = Math.max(0, (gaugeCarouselWidth - gaugeItemWidth) / 2);
  const selectGaugeIndex = (nextIndex: number) => {
    gaugeScrollRef.current?.scrollTo({ x: (loopStartIndex + nextIndex) * gaugeItemWidth, animated: true });
    setActiveGaugeIndex(nextIndex);
  };
  const handleGaugeMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const rawIndex = Math.round(event.nativeEvent.contentOffset.x / gaugeItemWidth);
    const normalizedIndex = ((rawIndex % metricGaugeItems.length) + metricGaugeItems.length) % metricGaugeItems.length;
    setActiveGaugeIndex(normalizedIndex);
    if (rawIndex < loopStartIndex || rawIndex >= loopStartIndex + metricGaugeItems.length) {
      requestAnimationFrame(() => {
        gaugeScrollRef.current?.scrollTo({ x: (loopStartIndex + normalizedIndex) * gaugeItemWidth, animated: false });
      });
    }
  };
  useEffect(() => {
    if (!gaugeCarouselWidth) return;
    requestAnimationFrame(() => {
      gaugeScrollRef.current?.scrollTo({ x: loopStartIndex * gaugeItemWidth, animated: false });
    });
  }, [gaugeCarouselWidth, loopStartIndex]);
  const renderMetricGauge = (item: (typeof metricGaugeItems)[number], index: number) => {
    const size = 168;
    const stroke = 13;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const arc = circumference * 0.78;
    const progress = typeof item.value === 'number' ? Math.max(0.04, Math.min(item.value / item.max, 1)) : 0.04;
    const dash = arc * progress;
    const valueText = typeof item.value === 'number' ? item.value.toFixed(item.decimals) : '-';

    const inputRange = [(index - 1) * gaugeItemWidth, index * gaugeItemWidth, (index + 1) * gaugeItemWidth];
    const gaugeMotion = {
      opacity: gaugeScrollX.interpolate({ inputRange, outputRange: [0.9, 1, 0.9], extrapolate: 'clamp' }),
      zIndex: gaugeScrollX.interpolate({ inputRange, outputRange: [1, 5, 1], extrapolate: 'clamp' }),
      elevation: gaugeScrollX.interpolate({ inputRange, outputRange: [2, 8, 2], extrapolate: 'clamp' }),
      transform: [
        { translateY: gaugeScrollX.interpolate({ inputRange, outputRange: [52, 0, 52], extrapolate: 'clamp' }) },
        { scale: gaugeScrollX.interpolate({ inputRange, outputRange: [0.56, 1, 0.56], extrapolate: 'clamp' }) },
      ],
    };

    return (
      <Animated.View
        key={`${item.code}-${index}`}
        style={[styles.metricGaugePage, { width: gaugeItemWidth }, gaugeMotion]}
      >
        <Pressable
          accessibilityLabel={`${item.label} 중앙으로 보기`}
          onPress={() => selectGaugeIndex(item.index)}
        >
          <View style={[styles.statusGaugeDisk, { shadowColor: item.tone }]}>
            <View style={styles.statusGaugeWrap}>
              <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Circle
                  cx={size / 2}
                  cy={size / 2}
                  fill="none"
                  r={radius}
                  stroke="#e8edf2"
                  strokeDasharray={`${arc} ${circumference}`}
                  strokeLinecap="round"
                  strokeWidth={stroke}
                  transform={`rotate(130 ${size / 2} ${size / 2})`}
                />
                <Circle
                  cx={size / 2}
                  cy={size / 2}
                  fill="none"
                  r={radius}
                  stroke={item.tone}
                  strokeDasharray={`${dash} ${circumference}`}
                  strokeLinecap="round"
                  strokeWidth={stroke}
                  transform={`rotate(130 ${size / 2} ${size / 2})`}
                />
              </Svg>
              <View style={styles.statusGaugeCenter}>
                <Text style={styles.statusGaugeLabel}>{item.label}</Text>
                <Text style={styles.statusGaugeValue}>{valueText}</Text>
                <Text style={styles.statusGaugeUnit}>{item.unit}</Text>
                <Text style={[styles.statusGaugeGrade, { color: item.tone }]}>{item.grade}</Text>
              </View>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    );
  };
  const todayCalendarEvents = (calendarEvents ?? [])
    .filter((event) => isDateInEventRange(todayDateLabel, event))
    .sort((a, b) => a.time.localeCompare(b.time));
  const activityGuideRiskByEvent = buildCalendarRiskByEvent(todayCalendarEvents, {
    currentPm10,
    eventLocationForecasts,
    hourlyItems,
    prediction,
    todayDateLabel,
    weather,
    weatherHourlyItems,
    weatherMidTermItems,
  });
  const activityGuideRows = todayCalendarEvents.map((event) => {
    const risk = activityGuideRiskByEvent[event.id];
    const locationName = [event.locationCity, event.locationRegion].filter(Boolean).join(' ') || event.location;
    return {
      badge: event.time,
      desc: risk.desc,
      icon: risk.icon,
      locationLabel: locationName
        ? `선택 장소 : ${locationName} 기준`
        : '',
      tone: risk.tone,
      title: event.title,
    };
  });
  const activityGuideSummary = todayCalendarEvents.length > 0
    ? `캘린더 일정 ${todayCalendarEvents.length}개를 공기와 날씨 기준으로 판단해요.`
    : '캘린더에 오늘 일정을 추가하면 공기와 날씨 기준으로 판단해요.';
  return (
    <View>
      <View style={[styles.statusCard, { borderColor: accentTone }]}>
        <View
          onLayout={(event) => setGaugeCarouselWidth(event.nativeEvent.layout.width)}
          style={styles.metricGaugeCarousel}
        >
          <Animated.ScrollView
            ref={gaugeScrollRef}
            contentContainerStyle={{ paddingHorizontal: gaugeSidePadding }}
            decelerationRate="fast"
            horizontal
            onMomentumScrollEnd={handleGaugeMomentumEnd}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: gaugeScrollX } } }],
              { useNativeDriver: true },
            )}
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
            snapToInterval={gaugeItemWidth}
          >
            {loopedGaugeItems.map((item, index) => renderMetricGauge(item, index))}
          </Animated.ScrollView>
        </View>
        <View style={styles.statusGaugeMetaRow}>
          <Text style={styles.statusGaugeMetaPill}>{metricGaugeItems[activeGaugeIndex].code} 기준</Text>
          <Text style={styles.statusGaugeMetaPill}>{activeGaugeBasis}</Text>
        </View>
      </View>

      <View style={[styles.activityGuideCard, { shadowColor: accentTone }]}>
        <View style={styles.activityGuideHeader}>
          <View style={styles.activityGuideHeaderTitleGroup}>
            <Text style={styles.activityGuideTitle}>오늘 활동 가이드</Text>
            <Text style={styles.activityGuideSummary}>{activityGuideSummary}</Text>
          </View>
          <Pressable
            accessibilityLabel="캘린더 열기"
            onPress={onOpenCalendar}
            style={({ pressed }) => [
              styles.activityGuideEditButton,
              pressed && styles.pressedFeedback,
            ]}
          >
            <Ionicons color={accentTone} name="calendar-outline" size={18} />
          </Pressable>
        </View>
        <View style={styles.activityGuideList}>
          {activityGuideRows.length === 0 && (
            <View style={styles.activityGuideEmptyBox}>
              <Text style={styles.activityGuideRowTitle}>오늘 등록된 일정이 없어요</Text>
              <Text style={styles.activityGuideRowDesc}>캘린더에 일정을 추가하면 시간대별 미세먼지와 날씨 기준으로 활동 가이드를 보여줘요.</Text>
            </View>
          )}
          {activityGuideRows.map((item, index) => (
            <View key={`${item.title}-${item.badge}-${index}`} style={styles.activityGuideRow}>
              <View style={[styles.activityGuideIconBox, { backgroundColor: `${item.tone}1a` }]}>
                <Ionicons color={item.tone} name={item.icon} size={18} />
              </View>
              <View style={styles.activityGuideTextGroup}>
                <Text style={styles.activityGuideRowTitle}>{item.title}</Text>
                {!!item.locationLabel && <Text style={styles.activityGuideRowLocation}>{item.locationLabel}</Text>}
                <Text style={styles.activityGuideRowDesc}>{item.desc}</Text>
              </View>
              <Text style={[styles.activityGuideBadge, { color: item.tone, backgroundColor: `${item.tone}18` }]}>{item.badge}</Text>
            </View>
          ))}
        </View>
        <Pressable
          accessibilityLabel={"\uC77C\uC815 \uCD94\uAC00\uD558\uB7EC \uAC00\uAE30"}
          onPress={onOpenCalendar}
          style={({ pressed }) => [styles.activityGuideAddScheduleButton, { borderColor: accentTone, backgroundColor: accentSoftTone }, pressed && styles.pressedFeedback]}
        >
          <View style={[styles.activityGuideAddScheduleIcon, { backgroundColor: accentTone }]}>
            <Ionicons color="#ffffff" name="add" size={17} />
          </View>
          <Text style={[styles.activityGuideAddScheduleText, { color: accentTone }]}>{"\uC77C\uC815 \uCD94\uAC00\uD558\uB7EC \uAC00\uAE30"}</Text>
          <Ionicons color={accentTone} name="chevron-forward" size={16} />
        </Pressable>
      </View>
      <Pressable
        accessibilityLabel={"\uC804\uAD6D \uC9C0\uB3C4 \uB0A0\uC528 \uBCF4\uB7EC\uAC00\uAE30"}
        onPress={onOpenMap}
        style={({ pressed }) => [styles.homeMapPreviewCard, { shadowColor: accentTone }, pressed && styles.pressedFeedback]}
      >
        <View style={styles.homeMapPreviewHeader}>
          <View style={styles.homeMapPreviewTitleGroup}>
            <Text style={styles.homeMapPreviewTitle}>{"\uC804\uAD6D \uB0A0\uC528 \uC9C0\uB3C4"}</Text>
            <Text style={styles.homeMapPreviewSubtitle}>{mapPreviewLabel}{" \uAE30\uC900\uC73C\uB85C \uBA3C\uC800 \uBCF4\uC5EC\uC918\uC694."}</Text>
          </View>
          <View style={[styles.homeMapPreviewIconButton, { backgroundColor: accentSoftTone }]}>
            <Ionicons color={accentTone} name="map-outline" size={19} />
          </View>
        </View>
        <View style={styles.homeMapPreviewFrame} pointerEvents="none">
          <WebView
            source={{ uri: mapPreviewUrl }}
            javaScriptEnabled
            domStorageEnabled
            androidLayerType="hardware"
            mixedContentMode="always"
            originWhitelist={['*']}
            setSupportMultipleWindows={false}
            thirdPartyCookiesEnabled
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            style={styles.homeMapPreviewWebView}
          />
        </View>
        <View style={styles.homeMapPreviewFooter}>
          <Text style={[styles.homeMapPreviewLink, { color: accentTone }]}>{"\uC804\uAD6D \uC9C0\uB3C4 \uB0A0\uC528 \uBCF4\uB7EC\uAC00\uAE30"}</Text>
          <Ionicons color={accentTone} name="chevron-forward" size={17} />
        </View>
      </Pressable>
      <Pressable
        accessibilityLabel={'\uBBF8\uC138\uBA3C\uC9C0\uC640 \uB0A0\uC528 \uD750\uB984 \uBCF4\uAE30'}
        onPress={onOpenDetail}
        style={({ pressed }) => [styles.detailFlowButton, { shadowColor: accentTone }, pressed && styles.pressedFeedback]}
      >
        <View style={styles.detailFlowButtonTextGroup}>
          <Text style={[styles.detailFlowButtonText, { color: accentTone }]}>{"\uBBF8\uC138\uBA3C\uC9C0\u00B7\uB0A0\uC528 \uD750\uB984 \uBCF4\uAE30"}</Text>
          <Text style={styles.detailFlowButtonHint}>{"\uC2DC\uAC04\uBCC4 \uBCC0\uD654\uC640 \uACFC\uAC70 \uAE30\uB85D\uC744 \uD655\uC778\uD574\uC694."}</Text>
        </View>
        <Text style={[styles.detailFlowButtonArrow, { color: accentTone }]}>{"\u203A"}</Text>
      </Pressable>
    </View>
  );
}

