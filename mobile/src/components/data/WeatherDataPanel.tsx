import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { DATA_LIST_PAGE_SIZE, dataRanges } from '../../constants/dust';
import { styles } from '../../styles/appStyles';
import type { RegionState, WeatherDailyItem, WeatherState } from '../../types/dust';
import { toNumber } from '../../utils/dust';

type WeatherDataMetricKey = 'temperature' | 'humidity' | 'wind_speed' | 'rain_mm';
type ChartMode = 'line' | 'bar';

const weatherMetrics: { key: WeatherDataMetricKey; code: string; label: string; unit: string; decimals: number }[] = [
  { key: 'temperature', code: 'TEMP', label: '기온', unit: '°C', decimals: 0 },
  { key: 'humidity', code: 'HUM', label: '습도', unit: '%', decimals: 0 },
  { key: 'wind_speed', code: 'WIND', label: '풍속', unit: 'm/s', decimals: 1 },
  { key: 'rain_mm', code: 'RAIN', label: '강수량', unit: 'mm', decimals: 1 },
];
const WEATHER_CHART_TONE = '#f3b43f';
const WEATHER_TEMP_LOW_TONE = '#2f80ed';
const WEATHER_TEMP_HIGH_TONE = '#d94b4b';
const WEATHER_NEUTRAL_TONE = '#687180';
const WEATHER_BLUE_LOW_TONE = '#b9dcff';
const WEATHER_BLUE_MID_TONE = '#4d9bef';
const WEATHER_BLUE_HIGH_TONE = '#1456a8';

function weatherValue(item: WeatherDailyItem, metric: WeatherDataMetricKey) {
  if (metric === 'temperature') return toNumber(item.avgTemperature);
  if (metric === 'humidity') return toNumber(item.avgHumidity);
  if (metric === 'wind_speed') return toNumber(item.avgWindSpeed);
  return toNumber(item.rainMm) ?? 0;
}

function formatWeatherValue(value: number | undefined, decimals: number) {
  if (typeof value !== 'number') return '-';
  return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
}

function highTemperatureTone(value: number | undefined) {
  return typeof value === 'number' && value >= 33 ? WEATHER_TEMP_HIGH_TONE : WEATHER_CHART_TONE;
}

function temperatureValueTone(value: number | undefined) {
  if (typeof value !== 'number') return WEATHER_NEUTRAL_TONE;
  if (value <= 0) return WEATHER_TEMP_LOW_TONE;
  if (value >= 33) return WEATHER_TEMP_HIGH_TONE;
  return WEATHER_CHART_TONE;
}

function weatherMetricValueTone(metric: WeatherDataMetricKey, value: number | undefined) {
  if (metric === 'temperature') return temperatureValueTone(value);
  if (metric === 'humidity' || metric === 'rain_mm' || metric === 'wind_speed') return weatherMetricChartTone(metric, value);
  return WEATHER_NEUTRAL_TONE;
}

function weatherDateLabel(item: WeatherDailyItem) {
  return item.date ?? '';
}

function weatherAxisRange(metric: WeatherDataMetricKey) {
  if (metric === 'temperature') return { min: -20, mid: 10, max: 40 };
  if (metric === 'humidity') return { min: 0, mid: 50, max: 100 };
  if (metric === 'wind_speed') return { min: 0, mid: 7.5, max: 15 };
  return { min: 0, mid: 40, max: 80 };
}

function mixHexTone(fromHex: string, toHex: string, ratio: number) {
  const normalizedRatio = Math.max(0, Math.min(1, ratio));
  const from = fromHex.replace('#', '');
  const to = toHex.replace('#', '');
  const mixed = [0, 2, 4].map((index) => {
    const fromValue = parseInt(from.slice(index, index + 2), 16);
    const toValue = parseInt(to.slice(index, index + 2), 16);
    return Math.round(fromValue + (toValue - fromValue) * normalizedRatio).toString(16).padStart(2, '0');
  });
  return `#${mixed.join('')}`;
}

function weatherMetricChartTone(metric: WeatherDataMetricKey, value: number | undefined) {
  if (metric === 'temperature') return WEATHER_CHART_TONE;
  if (typeof value !== 'number') return WEATHER_BLUE_MID_TONE;
  const { min, max } = weatherAxisRange(metric);
  const ratio = (value - min) / Math.max(1, max - min);
  if (ratio < 0.5) return mixHexTone(WEATHER_BLUE_LOW_TONE, WEATHER_BLUE_MID_TONE, ratio * 2);
  return mixHexTone(WEATHER_BLUE_MID_TONE, WEATHER_BLUE_HIGH_TONE, (ratio - 0.5) * 2);
}

function weatherMetricLineTone(metric: WeatherDataMetricKey) {
  return metric === 'temperature' ? WEATHER_CHART_TONE : WEATHER_BLUE_MID_TONE;
}

function buildSmoothLinePath(points: { x: number; y: number }[]) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const beforePrevious = points[index - 2] ?? previous;
    const next = points[index + 1] ?? point;
    const smoothing = 0.18;
    return `${path} C ${previous.x + (point.x - beforePrevious.x) * smoothing} ${previous.y + (point.y - beforePrevious.y) * smoothing} ${point.x - (next.x - previous.x) * smoothing} ${point.y - (next.y - previous.y) * smoothing} ${point.x} ${point.y}`;
  }, '');
}

export function WeatherDataPanel({
  accentBorderTone,
  accentSoftTone,
  accentTone,
  dataRangeDays,
  error,
  isLoading,
  items,
  metric,
  onMetricChange,
  onRangeChange,
  onToggleRegionPicker,
  region,
  regionPickerContent,
  showRegionPicker,
}: {
  accentBorderTone: string;
  accentSoftTone: string;
  accentTone: string;
  currentWeather: WeatherState | null;
  dataRangeDays: number;
  error: string;
  isLoading: boolean;
  items: WeatherDailyItem[];
  metric: WeatherDataMetricKey;
  onMetricChange: (metric: WeatherDataMetricKey) => void;
  onRangeChange: (days: number) => void;
  onToggleRegionPicker: () => void;
  region: RegionState;
  regionPickerContent?: ReactNode;
  showRegionPicker: boolean;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>('line');
  const [isListExpanded, setIsListExpanded] = useState(false);
  const [listPageIndex, setListPageIndex] = useState(0);
  const activeMetric = weatherMetrics.find((item) => item.key === metric) ?? weatherMetrics[0];
  const chartItems = useMemo(() => items.filter((item) => typeof weatherValue(item, metric) === 'number').slice(-180), [items, metric]);
  const reversedItems = useMemo(() => [...items].reverse(), [items]);
  const listPageCount = Math.max(1, Math.ceil(reversedItems.length / DATA_LIST_PAGE_SIZE));
  const currentListPage = Math.min(listPageIndex, listPageCount - 1);
  const visibleItems = isListExpanded
    ? reversedItems.slice(currentListPage * DATA_LIST_PAGE_SIZE, currentListPage * DATA_LIST_PAGE_SIZE + DATA_LIST_PAGE_SIZE)
    : [];
  const values = chartItems.map((item) => weatherValue(item, metric)).filter((value): value is number => typeof value === 'number');
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
  const selectedPointIndex = selectedIndex !== null && chartItems[selectedIndex] ? selectedIndex : chartItems.length - 1;
  const selectedItem = chartItems[selectedPointIndex];
  const selectedValue = selectedItem ? weatherValue(selectedItem, metric) : undefined;
  const latestWeatherDate = chartItems[chartItems.length - 1]?.date ?? items[items.length - 1]?.date ?? '-';
  const chartWidth = Math.max(320, chartItems.length * 34);
  const compactBarChart = chartItems.length <= 10;
  const barChartWidth = compactBarChart ? 320 : Math.max(320, chartItems.length * 24);
  const chartHeight = 188;
  const chartPaddingX = 28;
  const chartPaddingTop = 18;
  const chartPaddingBottom = 28;
  const chartInnerHeight = chartHeight - chartPaddingTop - chartPaddingBottom;
  const { min: chartMin, mid: chartMid, max: chartMax } = weatherAxisRange(metric);
  const chartRange = Math.max(1, chartMax - chartMin);
  const chartStep = chartItems.length > 1 ? (chartWidth - chartPaddingX * 2) / (chartItems.length - 1) : 0;
  const chartPoints = chartItems.map((item, index) => {
    const value = weatherValue(item, metric);
    const x = chartPaddingX + chartStep * index;
    const y = typeof value === 'number'
      ? chartPaddingTop + chartInnerHeight - ((value - chartMin) / chartRange) * chartInnerHeight
      : undefined;
    return { item, value, x, y };
  });
  const drawablePoints = chartPoints.filter((point): point is typeof chartPoints[number] & { y: number; value: number } => typeof point.y === 'number' && typeof point.value === 'number');
  const linePath = buildSmoothLinePath(drawablePoints);
  const selectedLinePoint = chartPoints[selectedPointIndex];
  const selectedLineTooltipLeft = selectedLinePoint ? Math.max(54, Math.min(chartWidth - 54, selectedLinePoint.x)) : 54;
  const selectedLineTooltipTop = typeof selectedLinePoint?.y === 'number' ? Math.max(6, selectedLinePoint.y - 48) : 8;
  const lineTone = weatherMetricLineTone(metric);

  useEffect(() => {
    setChartMode('line');
    setIsListExpanded(false);
    setListPageIndex(0);
    setSelectedIndex(null);
  }, [dataRangeDays, metric, items.length]);

  const handleChartPress = (event: GestureResponderEvent) => {
    const touchX = event.nativeEvent.locationX;
    const nearestPoint = chartPoints
      .filter((point) => typeof point.value === 'number')
      .reduce<(typeof chartPoints)[number] | null>((nearest, point) => {
        if (!nearest) return point;
        return Math.abs(point.x - touchX) < Math.abs(nearest.x - touchX) ? point : nearest;
      }, null);
    const nextIndex = nearestPoint ? chartPoints.findIndex((point) => point.item === nearestPoint.item) : -1;
    if (nextIndex >= 0) setSelectedIndex(nextIndex);
  };

  const renderLineChart = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chartScroll} contentContainerStyle={styles.chartScrollContent}>
      <View style={[styles.detailLineChartArea, { width: chartWidth, shadowColor: accentTone }]}>
        <Svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
          <Line x1={chartPaddingX} x2={chartWidth - chartPaddingX} y1={chartPaddingTop + chartInnerHeight} y2={chartPaddingTop + chartInnerHeight} stroke="#eef1f5" strokeWidth={2} />
          <Line x1={chartPaddingX} x2={chartWidth - chartPaddingX} y1={chartPaddingTop + chartInnerHeight / 2} y2={chartPaddingTop + chartInnerHeight / 2} stroke="#eef1f5" strokeDasharray="5 6" strokeWidth={1.5} />
          {[{ value: chartMax, y: chartPaddingTop + 3 }, { value: chartMid, y: chartPaddingTop + chartInnerHeight / 2 + 3 }, { value: chartMin, y: chartPaddingTop + chartInnerHeight + 3 }].map((label) => (
            <SvgText key={label.value} fill="#8a94a3" fontSize="10" fontWeight="900" textAnchor="start" x={2} y={label.y}>{label.value}</SvgText>
          ))}
          {!!linePath && <Path d={linePath} fill="none" stroke={lineTone} strokeLinecap="round" strokeLinejoin="round" strokeWidth={4.4} />}
          {chartPoints.map((point, index) => typeof point.y === 'number' && (
            <Circle key={`${weatherDateLabel(point.item)}-${metric}`} cx={point.x} cy={point.y} fill="#ffffff" onPress={() => setSelectedIndex(index)} r={index === selectedPointIndex ? 7 : 5} stroke={weatherMetricChartTone(metric, point.value)} strokeWidth={index === selectedPointIndex ? 4 : 3} />
          ))}
          {chartPoints.map((point, index) => {
            if (index % Math.ceil(chartItems.length / 6 || 1) !== 0 && index !== chartItems.length - 1) return null;
            return <SvgText key={`${weatherDateLabel(point.item)}-${metric}-label`} fill="#8a94a3" fontSize="10" fontWeight="900" textAnchor="middle" x={point.x} y={chartHeight - 8}>{(point.item.date ?? '').slice(5).replace('-', '.')}</SvgText>;
          })}
        </Svg>
        {selectedIndex !== null && selectedLinePoint && typeof selectedLinePoint.value === 'number' && (
          <View pointerEvents="none" style={[styles.detailLineChartTooltip, { left: selectedLineTooltipLeft, top: selectedLineTooltipTop }]}>
            <Text style={styles.detailLineChartTooltipDate}>{weatherDateLabel(selectedLinePoint.item)}</Text>
            <Text style={styles.detailLineChartTooltipValue}>{formatWeatherValue(selectedLinePoint.value, activeMetric.decimals)} {activeMetric.unit}</Text>
          </View>
        )}
        <Pressable accessibilityLabel={`${activeMetric.label} 일자료 수치 보기`} onPress={handleChartPress} style={styles.detailLineChartTouchSurface} />
      </View>
    </ScrollView>
  );

  const renderBarChart = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chartScroll} contentContainerStyle={styles.chartScrollContent}>
      <View style={[styles.chartArea, compactBarChart ? styles.weatherChartAreaCompact : { width: barChartWidth }]}>
        {chartItems.map((item, index) => {
          const value = weatherValue(item, metric);
          const height = typeof value === 'number' ? Math.max(8, ((value - chartMin) / chartRange) * 108) : 4;
          const selected = index === selectedPointIndex;
          const barTone = weatherMetricChartTone(metric, value);
          return (
            <Pressable key={`${weatherDateLabel(item)}-${metric}-bar`} onPress={() => setSelectedIndex(index)} style={({ pressed }) => [styles.chartColumn, compactBarChart && styles.weatherChartColumnCompact, pressed && styles.pressedFeedback]}>
              <View style={styles.chartTrackWrap}>
                {selected && <View style={[styles.chartSelectedCap, { backgroundColor: barTone }]} />}
                <View style={styles.chartTrack}>
                  <View style={[styles.chartBar, selected && styles.chartBarSelected, { borderColor: selected ? barTone : 'transparent', height, backgroundColor: barTone }]} />
                </View>
              </View>
              <Text style={[styles.chartDate, compactBarChart && styles.chartDateCompact]}>{(item.date ?? '').slice(5).replace('-', '.')}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderWeatherRow = (item: WeatherDailyItem, index: number) => {
    const value = weatherValue(item, metric);
    const maxTemperature = toNumber(item.maxTemperature);
    const minTemperature = toNumber(item.minTemperature);
    return (
      <View key={`${weatherDateLabel(item)}-${index}`} style={styles.flowRow}>
        <View>
          <Text style={styles.flowDate}>{weatherDateLabel(item)}</Text>
          <View style={styles.flowMetricRow}>
            <Text style={styles.flowPhaseBadge}>ASOS</Text>
            {!!item.stationName && <Text style={styles.flowMetric}>{item.stationName}</Text>}
          </View>
        </View>
        <View style={styles.flowValueGroup}>
          <Text style={styles.flowValue}>{formatWeatherValue(value, activeMetric.decimals)} {activeMetric.unit}</Text>
          {metric === 'temperature' && (
            <Text style={styles.flowGrade}>
              <Text style={{ color: highTemperatureTone(maxTemperature) }}>최고 {formatWeatherValue(maxTemperature, 0)}</Text>
              <Text> / </Text>
              <Text style={{ color: WEATHER_TEMP_LOW_TONE }}>최저 {formatWeatherValue(minTemperature, 0)}</Text>
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <View onTouchStart={() => selectedIndex !== null && setSelectedIndex(null)}>
      <Pressable onPress={onToggleRegionPicker} style={({ pressed }) => [styles.detailRegionSelector, { borderColor: accentBorderTone, shadowColor: accentTone }, pressed && styles.pressedFeedback]}>
        <View>
          <Text style={styles.detailRegionSelectorLabel}>보고 있는 지역</Text>
          <Text style={styles.detailRegionTitle}>{region.city} {region.region}</Text>
        </View>
        <View style={[styles.detailRegionSelectorIconWrap, showRegionPicker && { backgroundColor: accentSoftTone, borderColor: accentTone }]}>
          <Ionicons name={showRegionPicker ? 'chevron-up' : 'chevron-down'} size={18} color={showRegionPicker ? accentTone : '#687180'} />
        </View>
      </Pressable>
      {regionPickerContent}

      <View style={[styles.segmentCard, { borderColor: '#d9dee5', shadowColor: accentTone }]}>
        <Text style={styles.sectionLabel}>기간</Text>
        <View style={styles.segmentRow}>
          {dataRanges.map((range) => (
            <Pressable key={range.days} onPress={() => onRangeChange(range.days)} style={({ pressed }) => [styles.segmentButton, dataRangeDays === range.days && { backgroundColor: accentTone, borderColor: accentTone }, pressed && styles.pressedFeedback]}>
              <Text style={[styles.segmentText, dataRangeDays === range.days && styles.segmentTextActive]}>{range.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.sectionLabel}>항목</Text>
        <View style={styles.metricSelectGrid}>
          {weatherMetrics.map((item) => (
            <Pressable key={item.key} onPress={() => onMetricChange(item.key)} style={({ pressed }) => [styles.metricSelectButton, metric === item.key && { backgroundColor: accentSoftTone, borderColor: accentTone }, pressed && styles.pressedFeedback]}>
              <Text style={[styles.metricSelectLabel, metric === item.key && { color: accentTone }]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.card, { borderColor: '#d9dee5', shadowColor: accentTone }]}>
        <View style={styles.cardHeader}>
          <View style={styles.detailChartTitleGroup}>
            <Text style={styles.cardTitle}>{activeMetric.label} 일별 기록</Text>
            <Text numberOfLines={1} style={styles.cardHint}>최근 {dataRangeDays}일의 일평균 기록을 볼 수 있어요.</Text>
          </View>
          <View style={[styles.chartModeRow, styles.chartModeRowInline]}>
            {[{ key: 'line' as const, label: '선형' }, { key: 'bar' as const, label: '막대' }].map((mode) => (
              <Pressable key={mode.key} onPress={() => setChartMode(mode.key)} style={({ pressed }) => [styles.chartModeButton, styles.chartModeButtonInline, chartMode === mode.key && { backgroundColor: accentSoftTone, borderColor: accentTone }, pressed && styles.pressedFeedback]}>
                <Text style={[styles.chartModeText, styles.chartModeTextInline, chartMode === mode.key && { color: accentTone }]}>{mode.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        {isLoading && <View style={styles.loadingRow}><ActivityIndicator color={accentTone} /><Text style={styles.mutedText}>기상 데이터를 불러오는 중입니다.</Text></View>}
        {!!error && <Text style={styles.errorText}>{error}</Text>}
        {!isLoading && chartItems.length === 0 && <Text style={styles.mutedText}>표시할 기상 데이터가 없습니다.</Text>}
        {!isLoading && chartItems.length > 0 && (
          <>
            {chartMode === 'line' ? renderLineChart() : renderBarChart()}
            {chartMode === 'bar' && (
            <View style={styles.chartSelectedSummary}>
              <Text style={styles.chartSelectedDate}>{selectedItem ? weatherDateLabel(selectedItem) : '-'}</Text>
              <Text style={styles.chartSelectedDivider}>·</Text>
              <Text style={styles.chartSelectedValue}>
                {activeMetric.label}{' '}
                <Text style={{ color: weatherMetricValueTone(metric, selectedValue) }}>
                  {formatWeatherValue(selectedValue, activeMetric.decimals)} {activeMetric.unit}
                </Text>
              </Text>
              {chartMode === 'bar' && selectedItem?.maxTemperature != null && metric === 'temperature' && (
                <>
                  <Text style={styles.chartSelectedDivider}>·</Text>
                  <Text style={styles.chartSelectedGrade}>
                    최고{' '}
                    <Text style={{ color: highTemperatureTone(toNumber(selectedItem.maxTemperature)) }}>
                      {formatWeatherValue(toNumber(selectedItem.maxTemperature), activeMetric.decimals)}
                    </Text>
                  </Text>
                  <Text style={styles.chartSelectedDivider}>/</Text>
                  <Text style={styles.chartSelectedGrade}>
                    최저{' '}
                    <Text style={{ color: temperatureValueTone(toNumber(selectedItem.minTemperature)) }}>
                      {formatWeatherValue(toNumber(selectedItem.minTemperature), activeMetric.decimals)}
                    </Text>
                  </Text>
                </>
              )}
            </View>
            )}
            <View style={styles.dataMetaRow}>
              <Text style={styles.dataMetaText}>평균 {formatWeatherValue(average, activeMetric.decimals)} {activeMetric.unit}</Text>
              <Text style={styles.dataMetaText}>최신 {latestWeatherDate}</Text>
            </View>
          </>
        )}
      </View>

      <View style={[styles.card, { borderColor: '#d9dee5', shadowColor: accentTone }]}>
        <Pressable onPress={() => { setIsListExpanded((current) => !current); setListPageIndex(0); }} style={({ pressed }) => [styles.listHeader, { borderColor: accentBorderTone }, pressed && styles.pressedFeedback]}>
          <View>
            <Text style={styles.cardTitle}>일평균 기록 목록</Text>
            <Text style={styles.cardHint}>전체 {items.length}개</Text>
          </View>
          <View style={styles.listHeaderAction}>
            <View style={[styles.listChevron, { borderColor: accentBorderTone }]}>
              <View style={[styles.chevronLine, styles.chevronLeft, isListExpanded && styles.chevronLeftOpen]} />
              <View style={[styles.chevronLine, styles.chevronRight, isListExpanded && styles.chevronRightOpen]} />
            </View>
          </View>
        </Pressable>
        {isListExpanded && (
          <>
            <View style={styles.flowList}>{visibleItems.map(renderWeatherRow)}</View>
            <View style={[styles.listPager, { borderColor: accentBorderTone, shadowColor: accentTone }]}>
              <Pressable disabled={currentListPage <= 0} onPress={() => setListPageIndex((page) => Math.max(0, page - 1))} style={({ pressed }) => [styles.listPagerButton, currentListPage <= 0 && styles.listPagerButtonDisabled, pressed && currentListPage > 0 && styles.pressedFeedback]}>
                <Text style={[styles.listPagerIcon, currentListPage <= 0 && styles.listPagerIconDisabled]}>‹</Text>
              </Pressable>
              <View style={styles.listPagerCenter}>
                <Text style={styles.listPagerTitle}>{currentListPage + 1} / {listPageCount}</Text>
                <Text style={styles.listPagerMeta}>{visibleItems[visibleItems.length - 1]?.date ?? '-'} - {visibleItems[0]?.date ?? '-'}</Text>
              </View>
              <Pressable disabled={currentListPage >= listPageCount - 1} onPress={() => setListPageIndex((page) => Math.min(listPageCount - 1, page + 1))} style={({ pressed }) => [styles.listPagerButton, currentListPage >= listPageCount - 1 && styles.listPagerButtonDisabled, pressed && currentListPage < listPageCount - 1 && styles.pressedFeedback]}>
                <Text style={[styles.listPagerIcon, currentListPage >= listPageCount - 1 && styles.listPagerIconDisabled]}>›</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

export type { WeatherDataMetricKey };
