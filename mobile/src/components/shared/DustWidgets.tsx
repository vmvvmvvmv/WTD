import { Pressable, Switch, Text, View } from 'react-native';
import type { DimensionValue } from 'react-native';

import { styles } from '../../styles/appStyles';
import type { DataMetricKey } from '../../types/dust';
import { formatValue, getMetricLabel, getMetricTone, getPm10Label, getPm10SoftTone, getPm10Tone } from '../../utils/dust';

// 설정 탭에서 반복해서 쓰는 알림 토글 행입니다.
export function NotificationToggleRow({ accentTone, disabled, label, onValueChange, value }: {
  accentTone: string;
  disabled?: boolean;
  label: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <View style={[styles.notificationRow, disabled && styles.notificationRowDisabled]}>
      <Text style={styles.notificationLabel}>{label}</Text>
      <Switch
        disabled={disabled}
        onValueChange={onValueChange}
        thumbColor={value ? '#ffffff' : '#f8f9fa'}
        trackColor={{ false: '#d9dee5', true: accentTone }}
        value={value}
      />
    </View>
  );
}

// 홈 화면의 PM10/PM2.5/O3 요약 카드입니다.
export function MetricCard({ label, code, value, unit, grade, tone, decimals = 0 }: {
  label: string;
  code: string;
  value?: number;
  unit: string;
  grade: string;
  tone: string;
  decimals?: number;
}) {
  const progressMax = code === 'O3' ? 0.15 : code === 'PM2.5' ? 75 : 150;
  const progressPercent = (typeof value === 'number' ? `${Math.max(4, Math.min(100, (value / progressMax) * 100))}%` : '0%') as DimensionValue;
  return (
    <View style={[styles.metricPill, { borderTopColor: tone }]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricCode, { color: tone }]}>{code}</Text>
      <Text style={styles.metricValue}>{typeof value === 'number' ? value.toFixed(decimals) : '-'}</Text>
      <Text style={styles.metricUnit}>{unit}</Text>
      <View style={styles.metricMiniTrack}>
        <View style={[styles.metricMiniFill, { backgroundColor: tone, width: progressPercent }]} />
      </View>
      <Text style={[styles.metricGrade, { color: tone }]}>{grade}</Text>
    </View>
  );
}

// 홈 흐름과 상세 데이터 목록에서 함께 쓰는 한 줄짜리 수치 표시 행입니다.
export function FlowRow({
  active = false,
  activeBorderTone,
  activeSoftTone,
  decimals = 0,
  label,
  metric = 'pm10',
  metricCode = 'PM10',
  phase,
  unit = 'µg/m³',
  value,
}: {
  active?: boolean;
  activeBorderTone?: string;
  activeSoftTone?: string;
  decimals?: number;
  label: string;
  metric?: DataMetricKey;
  metricCode?: string;
  phase?: string;
  unit?: string;
  value?: number;
}) {
  const tone = getMetricTone(metric, value);
  return (
    <View
      style={[
        styles.flowRow,
        active && styles.todayFlowRow,
        active && activeSoftTone && { backgroundColor: activeSoftTone },
        active && activeBorderTone && { borderColor: activeBorderTone },
      ]}
    >
      <View>
        <View style={styles.flowMetricRow}>
          {!!phase && <Text style={[styles.flowPhaseBadge, active && { backgroundColor: activeBorderTone ?? tone, color: '#ffffff' }]}>{phase}</Text>}
          <Text style={[styles.flowMetric, { color: active ? activeBorderTone ?? tone : tone }]}>{metricCode}</Text>
        </View>
        <Text style={styles.flowDate}>{label}</Text>
      </View>
      <View style={styles.flowValueGroup}>
        <Text style={styles.flowValue}>{formatValue(value, decimals)} {unit}</Text>
        <Text style={[styles.flowGrade, { color: tone }]}>{getMetricLabel(metric, value)}</Text>
      </View>
    </View>
  );
}
