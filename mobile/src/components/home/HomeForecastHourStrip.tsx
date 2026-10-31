import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Reanimated, {
  Extrapolation,
  FadeInRight,
  interpolate,
  ReduceMotion,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';

import { styles } from '../../styles/appStyles';
import { WeatherIcon, weatherIconKind } from '../shared/WeatherIcon';

export type ForecastHourItem = {
  index: number;
  isPast: boolean;
  isRainy: boolean;
  key: string;
  label: string;
  rainProbability?: number;
  temperature?: number;
  timeLabel: string;
};

// 화면 폭에 맞춰 한 화면에 4~6칸을 꽉 채웁니다.
function cellsPerScreen(width: number) {
  return width < 300 ? 4 : width < 380 ? 5 : 6;
}

// 날짜를 고르면 열리는 시간별 예보 줄.
// 넘길 때 한 칸씩 딱 맞게 멈추고, 양 끝으로 갈수록 칸이 살짝 작고 흐려집니다(애니메이션 줄이기 설정이면 효과 없음).
// 날짜를 바꾸면 줄이 오른쪽에서 밀려 들어옵니다. startIndex 칸(오늘이면 '지금')이 첫 화면 앞쪽에 보이게 엽니다.
export function HomeForecastHourStrip({ dayKey, items, onSelect, selectedIndex, startIndex }: {
  dayKey: string;
  items: ForecastHourItem[];
  onSelect: (index: number) => void;
  selectedIndex: number;
  startIndex: number;
}) {
  const [width, setWidth] = useState(0);
  const cellWidth = width ? width / cellsPerScreen(width) : 0;
  const startX = cellWidth * Math.max(0, startIndex - 1);
  const scrollX = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    scrollX.value = startX;
  }, [scrollX, startX, dayKey]);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  return (
    <Reanimated.View
      entering={FadeInRight.duration(240).reduceMotion(ReduceMotion.System)}
      key={dayKey}
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        if (next > 0 && Math.abs(next - width) > 1) setWidth(next);
      }}
      style={styles.homeHeroBannerForecastScroll}
    >
      {cellWidth > 0 && (
        <Reanimated.ScrollView
          contentOffset={{ x: startX, y: 0 }}
          decelerationRate="fast"
          horizontal
          nestedScrollEnabled
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          snapToInterval={cellWidth}
        >
          {items.map((item, position) => (
            <HourCell
              cellWidth={cellWidth}
              item={item}
              key={item.key}
              onPress={() => onSelect(item.index)}
              position={position}
              reduceMotion={reduceMotion}
              scrollX={scrollX}
              selected={item.index === selectedIndex}
              viewportWidth={width}
            />
          ))}
        </Reanimated.ScrollView>
      )}
    </Reanimated.View>
  );
}

function HourCell({ cellWidth, item, onPress, position, reduceMotion, scrollX, selected, viewportWidth }: {
  cellWidth: number;
  item: ForecastHourItem;
  onPress: () => void;
  position: number;
  reduceMotion: boolean;
  scrollX: SharedValue<number>;
  selected: boolean;
  viewportWidth: number;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    if (reduceMotion) return {};
    // 칸 가운데가 화면 끝에서 얼마나 떨어졌는지. 끝에 걸친 칸일수록 작고 흐리게.
    const center = position * cellWidth + cellWidth / 2 - scrollX.value;
    const edgeDistance = Math.min(center, viewportWidth - center);
    const t = interpolate(edgeDistance, [0, cellWidth * 0.9], [0, 1], Extrapolation.CLAMP);
    return { opacity: 0.35 + 0.65 * t, transform: [{ scale: 0.88 + 0.12 * t }] };
  });
  return (
    <Reanimated.View style={[{ width: cellWidth }, animatedStyle]}>
      <Pressable
        accessibilityLabel={`${item.timeLabel} ${item.label} ${item.temperature === undefined ? '' : `${Math.round(item.temperature)}도`}`}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onPress}
        style={[styles.homeHeroBannerForecastItem, selected && styles.homeHeroBannerForecastItemCurrent]}
      >
        <Text style={[styles.homeHeroBannerForecastTime, item.isPast && styles.homeHeroBannerForecastPast, selected && styles.homeHeroBannerForecastTimeCurrent]}>{item.timeLabel}</Text>
        <View style={item.isPast && !selected ? styles.homeHeroBannerForecastPastIcon : undefined}>
          <WeatherIcon kind={weatherIconKind(item.label)} size={23} />
        </View>
        <Text style={[styles.homeHeroBannerForecastTemp, item.isPast && !selected && styles.homeHeroBannerForecastPast]}>
          {item.temperature === undefined ? '-' : `${Math.round(item.temperature)}°`}
        </Text>
        <Text style={[styles.homeHeroBannerForecastRain, item.isRainy && styles.homeHeroBannerForecastRainActive]}>
          {item.isPast ? '지난 시간' : item.rainProbability === undefined ? '강수 -' : `강수 ${Math.round(item.rainProbability)}%`}
        </Text>
      </Pressable>
    </Reanimated.View>
  );
}
