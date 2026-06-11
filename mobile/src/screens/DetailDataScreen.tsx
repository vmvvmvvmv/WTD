import { StyleSheet, Text, View } from 'react-native';

import { AppCard } from '../components/AppCard';
import { useTheme } from '../theme/ThemeProvider';

export function DetailDataScreen() {
  const { colors } = useTheme();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>상세 데이터</Text>
      <Text style={[styles.caption, { color: colors.textMuted }]}>상세 데이터는 과거 일평균 집계 기준입니다.</Text>
      <AppCard>
        <Text style={[styles.panelTitle, { color: colors.text }]}>일평균 추이</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          PM10, PM2.5, AQI 순서로 기간 선택과 CSV 공유를 구성합니다.
        </Text>
      </AppCard>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    gap: 18,
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
  },
  caption: {
    fontSize: 13,
    marginTop: -10,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
});
