import { StyleSheet, Text, View } from 'react-native';

import { AppCard } from '../components/AppCard';
import { useTheme } from '../theme/ThemeProvider';

export function MyPageScreen() {
  const { colors } = useTheme();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>마이페이지</Text>
      <Text style={[styles.caption, { color: colors.textMuted }]}>
        로그인하면 사용자가 선택한 지역 기준으로 대시보드가 바뀝니다.
      </Text>
      <AppCard>
        <Text style={[styles.panelTitle, { color: colors.text }]}>계정 로그인</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          지역 저장, 맞춤 대시보드, 관심 지역 기능을 이곳에 연결합니다.
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
    lineHeight: 20,
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
