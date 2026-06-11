import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

export function ProfileEditScreen() {
  const { colors } = useTheme();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>계정 정보 수정</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
});
