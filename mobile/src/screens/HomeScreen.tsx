import { StyleSheet, Text, View } from 'react-native';

import { AppCard } from '../components/AppCard';
import { MetricGauge } from '../components/MetricGauge';
import { ThemeToggle } from '../components/ThemeToggle';
import { DEFAULT_REGION } from '../api/dust';
import { useTheme } from '../theme/ThemeProvider';

export function HomeScreen() {
  const { colors } = useTheme();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.kicker, { color: colors.primaryStrong }]}>AIR STATUS</Text>
          <Text style={[styles.title, { color: colors.text }]}>
            {DEFAULT_REGION.city} {DEFAULT_REGION.region}
          </Text>
        </View>
        <ThemeToggle />
      </View>
      <Text style={[styles.caption, { color: colors.textMuted }]}>
        비회원 기본 데이터는 서울 송파구 기준입니다.
      </Text>

      <AppCard>
        <Text style={[styles.panelLabel, { color: colors.textMuted }]}>현재 대시보드</Text>
        <Text style={[styles.metric, { color: colors.text }]}>미세먼지 데이터를 불러올 준비가 됐습니다.</Text>
        <Text style={[styles.helper, { color: colors.textMuted }]}>
          백엔드 API 연결 후 PM10, PM2.5, AQI와 예측 흐름을 이 영역에 표시합니다.
        </Text>
        <View style={styles.gaugeStack}>
          <MetricGauge label="PM10" value={32} unit="µg/m³" />
          <MetricGauge label="PM2.5" value={18} unit="µg/m³" />
        </View>
      </AppCard>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  caption: {
    fontSize: 13,
    marginBottom: 22,
    marginTop: 8,
  },
  panelLabel: {
    fontSize: 13,
    marginBottom: 10,
  },
  metric: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
  },
  helper: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  gaugeStack: {
    gap: 14,
    marginTop: 18,
  },
});
