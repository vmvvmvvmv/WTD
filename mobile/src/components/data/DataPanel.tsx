import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { DATA_LIST_PAGE_SIZE, dataMetrics, dataRanges } from '../../constants/dust';
import { styles } from '../../styles/appStyles';
import type { DataMetricKey, PastDustItem } from '../../types/dust';
import { formatValue, getMetricLabel, getMetricTone, getMetricValue } from '../../utils/dust';
import { FlowRow } from '../shared/DustWidgets';

type ChartMode = 'line' | 'bar';

function dustChartMax(metric: DataMetricKey, maxValue: number) {
  if (metric === 'o3' || metric === 'no2') {
    return Math.max(0.03, Math.ceil(maxValue * 1.2 * 1000) / 1000);
  }
  return Math.max(1, Math.ceil(maxValue * 1.15));
}

function dustChartAxisLabel(metric: DataMetricKey, value: number) {
  if (metric === 'o3' || metric === 'no2') return value.toFixed(3);
  return String(Math.round(value));
}

// 상세 데이터 화면에서 기간, 항목, 차트, CSV 다운로드, 일평균 목록을 보여줍니다.
export function DataPanel({
  dataMetric,
  dataRangeDays,
  error,
  accentBorderTone,
  accentSoftTone,
  accentTone,
  isLoadingPast,
  items,
  onMetricChange,
  onRangeChange,
  onSelectChartDate,
  onToggleRegionPicker,
  regionPickerContent,
  region,
  selectedChartDate,
  showRegionPicker,
}: {
  dataMetric: DataMetricKey;
  dataRangeDays: number;
  error: string;
  accentBorderTone: string;
  accentSoftTone: string;
  accentTone: string;
  isLoadingPast: boolean;
  items: PastDustItem[];
  onMetricChange: (metric: DataMetricKey) => void;
  onRangeChange: (days: number) => void;
  onSelectChartDate: (date: string | null) => void;
  onToggleRegionPicker: () => void;
  regionPickerContent?: ReactNode;
  region: { city: string; region: string };
  selectedChartDate: string | null;
  showRegionPicker: boolean;
}) {
  const [isListExpanded, setIsListExpanded] = useState(false);
  const [listPageIndex, setListPageIndex] = useState(0);
  const [chartMode, setChartMode] = useState<ChartMode>('line');
  const activeMetric = dataMetrics.find((metric) => metric.key === dataMetric) ?? dataMetrics[0];
  const chartItems = items.slice(-Math.min(items.length, 180));
  const reversedItems = useMemo(() => [...items].reverse(), [items]);
  const listPageCount = Math.max(1, Math.ceil(reversedItems.length / DATA_LIST_PAGE_SIZE));
  const currentListPage = Math.min(listPageIndex, listPageCount - 1);
  const pageStartIndex = currentListPage * DATA_LIST_PAGE_SIZE;
  const visibleItems = isListExpanded ? reversedItems.slice(pageStartIndex, pageStartIndex + DATA_LIST_PAGE_SIZE) : [];
  const canGoPrevListPage = isListExpanded && currentListPage > 0;
  const canGoNextListPage = isListExpanded && currentListPage < listPageCount - 1;
  const values = chartItems.map((item) => getMetricValue(item, dataMetric)).filter((value): value is number => typeof value === 'number');
  const latestItem = [...items].reverse().find((item) => typeof getMetricValue(item, dataMetric) === 'number');
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
  const maxValue = values.length ? Math.max(...values) : 0;
  const compactChart = chartItems.length <= 10;
  const selectedChartItem = chartItems.find((item) => item.msurDt === selectedChartDate) ?? chartItems[chartItems.length - 1];
  const selectedChartValue = selectedChartItem ? getMetricValue(selectedChartItem, dataMetric) : undefined;
  const chartWidth = compactChart ? 320 : Math.max(320, chartItems.length * 34);
  const lineChartHeight = 188;
  const chartPaddingX = 28;
  const chartPaddingTop = 18;
  const chartPaddingBottom = 28;
  const chartInnerHeight = lineChartHeight - chartPaddingTop - chartPaddingBottom;
  const chartMax = dustChartMax(dataMetric, maxValue);
  const chartMid = chartMax / 2;
  const chartStep = chartItems.length > 1 ? (chartWidth - chartPaddingX * 2) / (chartItems.length - 1) : 0;
  const chartPoints = chartItems.map((item, index) => {
    const value = getMetricValue(item, dataMetric);
    const x = chartPaddingX + chartStep * index;
    const y = typeof value === 'number'
      ? chartPaddingTop + chartInnerHeight - (value / chartMax) * chartInnerHeight
      : undefined;
    return { item, value, x, y };
  });
  const selectedLinePoint = selectedChartDate ? chartPoints.find((point) => point.item.msurDt === selectedChartDate) : undefined;
  const selectedLineTooltipLeft = selectedLinePoint ? Math.max(54, Math.min(chartWidth - 54, selectedLinePoint.x)) : 54;
  const selectedLineTooltipTop = typeof selectedLinePoint?.y === 'number' ? Math.max(6, selectedLinePoint.y - 44) : 8;
  const linePath = chartPoints
    .filter((point): point is typeof chartPoints[number] & { y: number; value: number } => typeof point.y === 'number' && typeof point.value === 'number')
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  useEffect(() => {
    setIsListExpanded(false);
    setListPageIndex(0);
    setChartMode('line');
  }, [dataMetric, dataRangeDays, items.length]);

  const handleLineChartPress = (event: { nativeEvent: { locationX: number } }) => {
    if (chartPoints.length === 0) return;
    const touchX = event.nativeEvent.locationX;
    const nearestPoint = chartPoints
      .filter((point) => typeof point.value === 'number')
      .reduce<(typeof chartPoints)[number] | null>((nearest, point) => {
        if (!nearest) return point;
        return Math.abs(point.x - touchX) < Math.abs(nearest.x - touchX) ? point : nearest;
      }, null);
    if (nearestPoint) onSelectChartDate(nearestPoint.item.msurDt);
  };

  const renderLineChart = () => (
    <ScrollView horizontal={!compactChart} scrollEnabled={!compactChart} showsHorizontalScrollIndicator={false} style={styles.chartScroll} contentContainerStyle={styles.chartScrollContent}>
      <View style={[styles.detailLineChartArea, { width: chartWidth, shadowColor: accentTone }]}>
        <Svg width={chartWidth} height={lineChartHeight} viewBox={`0 0 ${chartWidth} ${lineChartHeight}`}>
          <Line x1={chartPaddingX} x2={chartWidth - chartPaddingX} y1={chartPaddingTop + chartInnerHeight} y2={chartPaddingTop + chartInnerHeight} stroke="#eef1f5" strokeWidth={2} />
          <Line x1={chartPaddingX} x2={chartWidth - chartPaddingX} y1={chartPaddingTop + chartInnerHeight / 2} y2={chartPaddingTop + chartInnerHeight / 2} stroke="#eef1f5" strokeDasharray="5 6" strokeWidth={1.5} />
          <SvgText fill="#8a94a3" fontSize="10" fontWeight="900" textAnchor="start" x={2} y={chartPaddingTop + 3}>{dustChartAxisLabel(dataMetric, chartMax)}</SvgText>
          <SvgText fill="#8a94a3" fontSize="10" fontWeight="900" textAnchor="start" x={2} y={chartPaddingTop + chartInnerHeight / 2 + 3}>{dustChartAxisLabel(dataMetric, chartMid)}</SvgText>
          <SvgText fill="#8a94a3" fontSize="10" fontWeight="900" textAnchor="start" x={2} y={chartPaddingTop + chartInnerHeight + 3}>0</SvgText>
          {!!linePath && <Path d={linePath} fill="none" stroke={accentTone} strokeLinecap="round" strokeLinejoin="round" strokeWidth={4.4} />}
          {chartPoints.map((point) => {
            if (typeof point.y !== 'number' || typeof point.value !== 'number') return null;
            const selected = point.item.msurDt === selectedChartDate;
            const tone = getMetricTone(dataMetric, point.value);
            const label = point.item.msurDt.slice(5).replace('-', '.');
            return (
              <Circle
                key={`${point.item.msurDt}-${dataMetric}-line`}
                cx={point.x}
                cy={point.y}
                fill="#ffffff"
                onPress={() => onSelectChartDate(point.item.msurDt)}
                r={selected ? 7 : 5}
                stroke={selected ? accentTone : tone}
                strokeWidth={selected ? 4 : 3}
              />
            );
          })}
          {chartPoints.map((point, index) => {
            if (index % Math.ceil(chartItems.length / 8 || 1) !== 0 && index !== chartItems.length - 1) return null;
            return (
              <SvgText
                key={`${point.item.msurDt}-${dataMetric}-label`}
                fill="#8a94a3"
                fontSize="10"
                fontWeight="900"
                textAnchor="middle"
                x={point.x}
                y={lineChartHeight - 8}
              >
                {point.item.msurDt.slice(5).replace('-', '.')}
              </SvgText>
            );
          })}
        </Svg>
        {selectedLinePoint && typeof selectedLinePoint.value === 'number' && (
          <View pointerEvents="none" style={[styles.detailLineChartTooltip, { left: selectedLineTooltipLeft, top: selectedLineTooltipTop }]}>
            <Text style={styles.detailLineChartTooltipDate}>{selectedLinePoint.item.msurDt}</Text>
            <Text style={styles.detailLineChartTooltipValue}>
              {formatValue(selectedLinePoint.value, activeMetric.decimals)} {activeMetric.unit}
            </Text>
          </View>
        )}
        <Pressable
          accessibilityLabel={`${activeMetric.label} 일평균 수치 보기`}
          onPress={handleLineChartPress}
          style={styles.detailLineChartTouchSurface}
        />
      </View>
    </ScrollView>
  );

  const renderBarChart = () => (
    <ScrollView horizontal={!compactChart} scrollEnabled={!compactChart} showsHorizontalScrollIndicator={false} style={styles.chartScroll} contentContainerStyle={styles.chartScrollContent}>
      <View style={[styles.chartArea, compactChart ? styles.chartAreaCompact : { width: Math.max(320, chartItems.length * 24) }]}>
        {chartItems.map((item) => {
          const value = getMetricValue(item, dataMetric);
          const height = typeof value === 'number' ? Math.max(8, (value / chartMax) * 108) : 4;
          const selected = item.msurDt === selectedChartItem?.msurDt;
          return (
            <Pressable key={`${item.msurDt}-${dataMetric}`} onPress={() => onSelectChartDate(item.msurDt)} style={({ pressed }) => [styles.chartColumn, compactChart && styles.chartColumnCompact, pressed && styles.pressedFeedback]}>
              <View style={styles.chartTrackWrap}>
                {selected && <View style={[styles.chartSelectedCap, { backgroundColor: getMetricTone(dataMetric, value) }]} />}
                <View style={styles.chartTrack}>
                  <View
                    style={[
                      styles.chartBar,
                      selected && styles.chartBarSelected,
                      {
                        borderColor: selected ? getMetricTone(dataMetric, value) : 'transparent',
                        height,
                        backgroundColor: getMetricTone(dataMetric, value),
                        opacity: 1,
                      },
                    ]}
                  />
                </View>
              </View>
              <Text style={[styles.chartDate, compactChart && styles.chartDateCompact]}>{item.msurDt.slice(5).replace('-', '.')}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );

  return (
    <View onTouchStart={() => selectedChartDate && onSelectChartDate(null)}>
      <Pressable
        onPress={onToggleRegionPicker}
        style={({ pressed }) => [styles.detailRegionSelector, { borderColor: accentBorderTone, shadowColor: accentTone }, pressed && styles.pressedFeedback]}
      >
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
            <Pressable
              key={range.days}
              onPress={() => onRangeChange(range.days)}
              style={({ pressed }) => [styles.segmentButton, dataRangeDays === range.days && { backgroundColor: accentTone, borderColor: accentTone }, pressed && styles.pressedFeedback]}
            >
              <Text style={[styles.segmentText, dataRangeDays === range.days && styles.segmentTextActive]}>{range.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.sectionLabel}>항목</Text>
        <View style={styles.metricSelectGrid}>
          {dataMetrics.map((metric) => (
            <Pressable
              key={metric.key}
              onPress={() => onMetricChange(metric.key)}
              style={({ pressed }) => [styles.metricSelectButton, dataMetric === metric.key && { backgroundColor: accentSoftTone, borderColor: accentTone }, pressed && styles.pressedFeedback]}
            >
              <Text style={[styles.metricSelectLabel, dataMetric === metric.key && { color: accentTone }]}>{metric.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.card, { borderColor: '#d9dee5', shadowColor: accentTone }]}>
        <View style={styles.cardHeader}>
          <View style={styles.detailChartTitleGroup}>
            <Text style={styles.cardTitle}>{activeMetric.label} 기록</Text>
            <Text numberOfLines={1} style={styles.cardHint}>최근 {chartItems.length}일의 일평균 기록을 볼 수 있어요.</Text>
          </View>
          <View style={[styles.chartModeRow, styles.chartModeRowInline]}>
            {[
              { key: 'line' as const, label: '선형' },
              { key: 'bar' as const, label: '막대' },
            ].map((mode) => (
              <Pressable
                key={mode.key}
                onPress={() => setChartMode(mode.key)}
                style={({ pressed }) => [
                  styles.chartModeButton,
                  styles.chartModeButtonInline,
                  chartMode === mode.key && { backgroundColor: accentSoftTone, borderColor: accentTone },
                  pressed && styles.pressedFeedback,
                ]}
              >
                <Text style={[styles.chartModeText, styles.chartModeTextInline, chartMode === mode.key && { color: accentTone }]}>{mode.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        {isLoadingPast && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={accentTone} />
            <Text style={styles.mutedText}>상세 데이터를 불러오는 중입니다.</Text>
          </View>
        )}
        {!!error && <Text style={styles.errorText}>{error}</Text>}
        {!isLoadingPast && chartItems.length === 0 && <Text style={styles.mutedText}>선택한 기간의 데이터가 없습니다.</Text>}
        {!isLoadingPast && chartItems.length > 0 && (
          <>
            {chartMode === 'line' ? renderLineChart() : renderBarChart()}
            {chartMode === 'bar' && (
              <View style={styles.chartSelectedSummary}>
                <Text style={styles.chartSelectedDate}>{selectedChartItem?.msurDt ?? '-'}</Text>
                <Text style={styles.chartSelectedDivider}>·</Text>
                <Text style={styles.chartSelectedValue}>{activeMetric.label} {formatValue(selectedChartValue, activeMetric.decimals)} {activeMetric.unit}</Text>
                <Text style={styles.chartSelectedDivider}>·</Text>
                <Text style={[styles.chartSelectedGrade, { color: getMetricTone(dataMetric, selectedChartValue) }]}>
                  {getMetricLabel(dataMetric, selectedChartValue)}
                </Text>
              </View>
            )}
            <View style={styles.dataMetaRow}>
              <Text style={styles.dataMetaText}>평균 {formatValue(average, activeMetric.decimals)} {activeMetric.unit}</Text>
              <Text style={styles.dataMetaText}>최신 {latestItem?.msurDt ?? '-'}</Text>
            </View>
          </>
        )}
      </View>

      <View style={[styles.card, { borderColor: '#d9dee5', shadowColor: accentTone }]}>
        <Pressable
          onPress={() => {
            setIsListExpanded((current) => !current);
            setListPageIndex(0);
          }}
          style={({ pressed }) => [styles.listHeader, { borderColor: accentBorderTone }, pressed && styles.pressedFeedback]}
        >
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
            <View style={styles.flowList}>
              {visibleItems.map((item) => {
                const value = getMetricValue(item, dataMetric);
                return (
                  <FlowRow
                    key={`${item.msurDt}-${dataMetric}-row`}
                    decimals={activeMetric.decimals}
                    label={item.msurDt}
                    metric={dataMetric}
                    metricCode={activeMetric.code}
                    unit={activeMetric.unit}
                    value={value}
                  />
                );
              })}
            </View>
            <View style={[styles.listPager, { borderColor: accentBorderTone, shadowColor: accentTone }]}>
              <Pressable
                disabled={!canGoPrevListPage}
                onPress={() => setListPageIndex((page) => Math.max(0, page - 1))}
                style={({ pressed }) => [styles.listPagerButton, !canGoPrevListPage && styles.listPagerButtonDisabled, pressed && canGoPrevListPage && styles.pressedFeedback]}
              >
                <Text style={[styles.listPagerIcon, !canGoPrevListPage && styles.listPagerIconDisabled]}>‹</Text>
              </Pressable>
              <View style={styles.listPagerCenter}>
                <Text style={styles.listPagerTitle}>{currentListPage + 1} / {listPageCount}</Text>
                <Text style={styles.listPagerMeta}>
                  {visibleItems[visibleItems.length - 1]?.msurDt ?? '-'} - {visibleItems[0]?.msurDt ?? '-'}
                </Text>
              </View>
              <Pressable
                disabled={!canGoNextListPage}
                onPress={() => setListPageIndex((page) => Math.min(listPageCount - 1, page + 1))}
                style={({ pressed }) => [styles.listPagerButton, !canGoNextListPage && styles.listPagerButtonDisabled, pressed && canGoNextListPage && styles.pressedFeedback]}
              >
                <Text style={[styles.listPagerIcon, !canGoNextListPage && styles.listPagerIconDisabled]}>›</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}
