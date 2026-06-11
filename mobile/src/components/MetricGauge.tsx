import { DimensionValue, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

type MetricGaugeProps = {
  label: string;
  value?: number | null;
  unit: string;
};

export function MetricGauge({ label, value, unit }: MetricGaugeProps) {
  const { colors } = useTheme();
  const fillWidth = `${Math.min(Math.max(value ?? 0, 0), 100)}%` as DimensionValue;

  return (
    <View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.value, { color: colors.text }]}>
          {value ?? '-'} {unit}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.cardMuted }]}>
        <View style={[styles.fill, { backgroundColor: colors.primary, width: fillWidth }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
  },
  value: {
    fontSize: 15,
    fontWeight: '700',
  },
  track: {
    borderRadius: 999,
    height: 8,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: 999,
    height: 8,
  },
});
