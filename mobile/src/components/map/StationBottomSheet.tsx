import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';

import { styles } from '../../styles/appStyles';
import type { StationDustItem, WeatherState } from '../../types/dust';
import { formatMapValue, getO3Label, getO3Tone, getPm10Label, getPm10Progress, getPm10Tone, getPm25Label, getPm25Tone, toNumber } from '../../utils/dust';

const SHEET_COLLAPSED_HEIGHT = 204;
const SHEET_EXPANDED_HEIGHT = 338;

export function StationBottomSheet({
  isFavorite,
  mode = 'dust',
  onClose,
  onOpenDetail,
  onToggleFavorite,
  station,
  weather,
}: {
  isFavorite: boolean;
  mode?: 'dust' | 'weather';
  onClose: () => void;
  onOpenDetail: (station: StationDustItem) => void;
  onToggleFavorite: (station: StationDustItem) => void;
  station: StationDustItem;
  weather?: WeatherState | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const slideAnim = useRef(new Animated.Value(80)).current;
  const heightAnim = useRef(new Animated.Value(SHEET_COLLAPSED_HEIGHT)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  function closeWithAnimation() {
    Animated.parallel([
      Animated.timing(slideAnim, { duration: 180, toValue: 120, useNativeDriver: false }),
      Animated.timing(opacityAnim, { duration: 140, toValue: 0, useNativeDriver: false }),
    ]).start(onClose);
  }

  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 8,
      onMoveShouldSetPanResponderCapture: (_, gesture) => Math.abs(gesture.dy) > 8,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy < -24) setExpanded(true);
        const shouldClose = expanded ? gesture.dy > 170 : gesture.dy > 145;
        if (shouldClose) {
          closeWithAnimation();
          return;
        }
        if (gesture.dy > 36) setExpanded(false);
      },
    }),
    [expanded],
  );

  useEffect(() => {
    setExpanded(false);
    slideAnim.setValue(80);
    opacityAnim.setValue(0);
    heightAnim.setValue(SHEET_COLLAPSED_HEIGHT);
    Animated.parallel([
      Animated.spring(slideAnim, { damping: 18, stiffness: 180, toValue: 0, useNativeDriver: false }),
      Animated.timing(opacityAnim, { duration: 160, toValue: 1, useNativeDriver: false }),
    ]).start();
  }, [heightAnim, opacityAnim, slideAnim, station.name, station.lat, station.lng, mode]);

  useEffect(() => {
    Animated.spring(heightAnim, {
      damping: 18,
      stiffness: 170,
      toValue: expanded ? SHEET_EXPANDED_HEIGHT : SHEET_COLLAPSED_HEIGHT,
      useNativeDriver: false,
    }).start();
  }, [expanded, heightAnim, mode]);

  return (
    <Animated.View
      style={[
        styles.stationSheet,
        {
          height: heightAnim,
          opacity: opacityAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View style={styles.stationDragArea}>
        <View style={styles.stationSheetHandle} />
      </View>
      <StationSheetHeader
        isFavorite={isFavorite}
        onOpenDetail={onOpenDetail}
        onToggleFavorite={onToggleFavorite}
        station={station}
      />
      {mode === 'weather' ? (
        <WeatherStationContent expanded={expanded} station={station} weather={weather} />
      ) : (
        <DustStationContent expanded={expanded} station={station} />
      )}
    </Animated.View>
  );
}

function StationSheetHeader({
  isFavorite,
  onOpenDetail,
  onToggleFavorite,
  station,
}: {
  isFavorite: boolean;
  onOpenDetail: (station: StationDustItem) => void;
  onToggleFavorite: (station: StationDustItem) => void;
  station: StationDustItem;
}) {
  return (
    <View style={styles.stationSheetHeader}>
      <Pressable onPress={() => onOpenDetail(station)} style={({ pressed }) => [styles.stationTitleGroup, pressed && styles.pressedFeedback]}>
        <Text style={styles.stationEyebrow}>{station.sido ?? '측정소'}</Text>
        <Text style={styles.stationTitle}>{station.name ?? station.city ?? '측정소'}</Text>
        {!!station.time && <Text style={styles.stationTime}>{station.time}</Text>}
        {!!station.addr && <Text style={styles.stationAddress} numberOfLines={1}>{station.addr}</Text>}
      </Pressable>
      <Pressable
        accessibilityLabel={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
        onPress={() => onToggleFavorite(station)}
        style={({ pressed }) => [styles.stationFavoriteButton, isFavorite && styles.stationFavoriteButtonActive, pressed && styles.pressedFeedback]}
      >
        <Ionicons color={isFavorite ? '#e2b93b' : '#aab4ae'} name={isFavorite ? 'star' : 'star-outline'} size={27} />
      </Pressable>
    </View>
  );
}

function DustStationContent({
  expanded,
  station,
}: {
  expanded: boolean;
  station: StationDustItem;
}) {
  const pm10 = toNumber(station.pm10);
  const pm25 = toNumber(station.pm25);
  const o3 = toNumber(station.o3);
  const tone = getPm10Tone(pm10);

  return (
    <>
      <View style={styles.stationMainRow}>
        <View style={[styles.stationValueCircle, { backgroundColor: tone, shadowColor: tone }]}>
          <Text style={styles.stationValueCircleText}>{typeof pm10 === 'number' ? Math.round(pm10) : '?'}</Text>
        </View>
        <View style={styles.stationGauge}>
          <View style={styles.stationGaugeHead}>
            <Text style={styles.stationGaugeLabel}>미세먼지</Text>
            <Text style={[styles.stationGaugeGrade, { color: tone }]}>{getPm10Label(pm10)}</Text>
          </View>
          <View style={styles.stationGaugeTrack}>
            <View style={[styles.stationGaugeFill, { backgroundColor: tone, width: `${getPm10Progress(pm10)}%` }]} />
          </View>
        </View>
      </View>

      {expanded && (
        <View style={styles.stationMetricGrid}>
          <StationMetric label="미세먼지" value={station.pm10} unit="µg/m³" tone={getPm10Tone(pm10)} grade={getPm10Label(pm10)} />
          <StationMetric label="초미세먼지" value={station.pm25} unit="µg/m³" tone={getPm25Tone(pm25)} grade={getPm25Label(pm25)} />
          <StationMetric label="오존" value={station.o3} unit="ppm" tone={getO3Tone(o3)} grade={getO3Label(o3)} />
          <StationMetric label="이산화질소" value={station.no2} unit="ppm" tone="#687180" />
        </View>
      )}
    </>
  );
}

function WeatherStationContent({
  expanded,
  station,
  weather,
}: {
  expanded: boolean;
  station: StationDustItem;
  weather?: WeatherState | null;
}) {
  const temperature = weather?.temperature ?? toNumber(station.weatherTemperature);
  const humidity = weather?.humidity ?? toNumber(station.weatherHumidity);
  const windSpeed = weather?.windSpeed ?? toNumber(station.weatherWindSpeed);
  const rainMm = weather?.rainMm ?? toNumber(station.weatherRainMm);
  const label = weather?.label ?? station.weatherLabel ?? '날씨';
  const measuredAt = weather?.measured_at ?? station.weatherTime ?? '';
  const measuredLabel = formatWeatherMeasuredAt(measuredAt);
  const tone = getTemperatureTone(temperature);

  return (
    <>
      <View style={styles.stationWeatherSummaryRow}>
        <View style={[styles.stationWeatherHeroIcon, { backgroundColor: getTemperatureSoftTone(temperature) }]}>
          <Ionicons color={tone} name={weatherIconName(label)} size={28} />
        </View>
        <View style={styles.stationWeatherHeroText}>
          <Text style={styles.stationWeatherHeroTitle}>
            {typeof temperature === 'number' ? `${Math.round(temperature)}°` : '--°'}
            <Text style={styles.stationWeatherHeroCondition}> {label}</Text>
          </Text>
          <Text style={styles.stationWeatherHeroMeta}>{measuredLabel || '최신 저장 날씨'}</Text>
        </View>
        <Text style={[styles.stationWeatherHeroBadge, { color: tone }]}>{getTemperatureGrade(temperature)}</Text>
      </View>

      {expanded && (
        <View style={styles.stationMetricGrid}>
          <StationMetric label="기온" value={temperature} unit="°C" tone={tone} grade={getTemperatureGrade(temperature)} />
          <StationMetric label="습도" value={humidity} unit="%" tone="#2f80ed" />
          <StationMetric label="풍속" value={windSpeed} unit="m/s" tone="#687180" />
          <StationMetric label="강수량" value={rainMm} unit="mm" tone="#2f80ed" />
        </View>
      )}
    </>
  );
}

function StationMetric({
  grade,
  label,
  tone,
  unit,
  value,
}: {
  grade?: string;
  label: string;
  tone: string;
  unit: string;
  value?: string | number | null;
}) {
  return (
    <View style={styles.stationMetric}>
      <Text style={styles.stationMetricLabel}>{label}</Text>
      <Text style={styles.stationMetricValue}>{formatMapValue(value)}</Text>
      <Text style={styles.stationMetricUnit}>{unit}</Text>
      {!!grade && <Text style={[styles.stationMetricGrade, { color: tone }]}>{grade}</Text>}
    </View>
  );
}

function weatherIconName(label?: string): keyof typeof Ionicons.glyphMap {
  if (label === '비') return 'rainy-outline';
  if (label === '눈') return 'snow-outline';
  if (label === '흐림' || label === '안개') return 'cloudy-outline';
  return 'sunny-outline';
}

function formatWeatherMeasuredAt(value?: string) {
  if (!value) return '';
  const normalized = value.includes('T') ? value.replace('T', ' ').slice(0, 16) : value.slice(0, 16);
  return normalized;
}

function getTemperatureTone(value?: number) {
  if (typeof value !== 'number') return '#687180';
  if (value <= 0) return '#2f80ed';
  if (value >= 33) return '#d94b4b';
  if (value >= 27) return '#f3b43f';
  return '#279b64';
}

function getTemperatureSoftTone(value?: number) {
  if (typeof value !== 'number') return '#eef1f5';
  if (value <= 0) return '#eaf3ff';
  if (value >= 33) return '#fdecec';
  if (value >= 27) return '#fff7df';
  return '#e7f6ed';
}

function getTemperatureGrade(value?: number) {
  if (typeof value !== 'number') return '대기';
  if (value <= 0) return '추움';
  if (value >= 33) return '폭염';
  if (value >= 27) return '더움';
  return '보통';
}
