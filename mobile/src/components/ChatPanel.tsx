import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

export function ChatPanel() {
  const { colors } = useTheme();

  return (
    <View style={[styles.message, { backgroundColor: colors.card, borderColor: colors.primaryBorder }]}>
      <Text style={[styles.messageText, { color: colors.text }]}>
        오늘 공기 상태를 물어볼 수 있도록 준비 중입니다.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  message: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: '86%',
    padding: 14,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
});
