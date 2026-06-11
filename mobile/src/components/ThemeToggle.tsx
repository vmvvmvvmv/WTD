import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

export function ThemeToggle() {
  const { colors, mode, setMode } = useTheme();
  const nextMode = mode === 'dark' ? 'light' : 'dark';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => setMode(nextMode)}
      style={[styles.button, { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder }]}
    >
      <Text style={[styles.text, { color: colors.primaryStrong }]}>
        {mode === 'dark' ? '라이트' : '다크'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
  },
});
