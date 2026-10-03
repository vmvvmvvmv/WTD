import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';

type MetricGaugeProps = {
  label: string;
  value?: number | null;
  unit: string;
};

export function MetricGauge({ label, value, unit }: MetricGaugeProps) {
  const { colors } = useTheme();
  const size = 112;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = typeof value === 'number' ? Math.max(0.04, Math.min(value / 100, 1)) : 0.04;
  const arc = circumference * 0.78;

  return (
    <View style={styles.container}>
      <View style={styles.gauge}>
        <Svg height={size} width={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle cx={size / 2} cy={size / 2} fill="none" r={radius} stroke={colors.cardMuted} strokeDasharray={`${arc} ${circumference}`} strokeLinecap="round" strokeWidth={stroke} transform={`rotate(130 ${size / 2} ${size / 2})`} />
          <Circle cx={size / 2} cy={size / 2} fill="none" r={radius} stroke={colors.primary} strokeDasharray={`${arc * progress} ${circumference}`} strokeLinecap="round" strokeWidth={stroke} transform={`rotate(130 ${size / 2} ${size / 2})`} />
        </Svg>
        <View style={styles.center}>
          <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
          <Text style={[styles.value, { color: colors.text }]}>{value ?? '-'}</Text>
          <Text style={[styles.unit, { color: colors.textMuted }]}>{unit}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  gauge: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#2D2D2D',
    borderRadius: 22,
    borderWidth: 1,
    height: 128,
    justifyContent: 'center',
    shadowColor: '#2D2D2D',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    width: 128,
  },
  label: {
    fontSize: 13,
  },
  value: {
    fontSize: 16,
    fontWeight: '900',
  },
  unit: {
    fontSize: 9,
    fontWeight: '800',
  },
  center: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
