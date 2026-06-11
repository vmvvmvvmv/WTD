import { StyleSheet, Text, View } from 'react-native';

import { ChatPanel } from '../components/ChatPanel';
import { useTheme } from '../theme/ThemeProvider';

export function BriefingScreen() {
  const { colors } = useTheme();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>대기 챗봇</Text>
      <Text style={[styles.caption, { color: colors.textMuted }]}>
        현재 상태, 내일 예측, 정확도 질문을 챗봇 API에 연결합니다.
      </Text>
      <ChatPanel />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
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
    marginBottom: 22,
    marginTop: 8,
  },
});
