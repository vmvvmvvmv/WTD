import { StyleSheet, Text, View } from 'react-native';

import { NAVER_MAP_CLIENT_ID } from '../api/client';
import { useTheme } from '../theme/ThemeProvider';

export function MapScreen() {
  const { colors } = useTheme();
  const mapStatus = NAVER_MAP_CLIENT_ID
    ? '네이버 지도 연동과 측정소 마커를 여기에 연결합니다.'
    : '네이버 지도 클라이언트 ID 변수명을 준비했습니다.';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>전국 지도</Text>
      <Text style={[styles.caption, { color: colors.textMuted }]}>
        전국 지도 미세먼지 데이터는 로그인 없이도 볼 수 있습니다.
      </Text>
      <View
        style={[
          styles.mapPlaceholder,
          { backgroundColor: colors.cardMuted, borderColor: colors.primaryBorder },
        ]}
      >
        <Text style={[styles.placeholderTitle, { color: colors.text }]}>지도 영역</Text>
        <Text style={[styles.placeholderText, { color: colors.textMuted }]}>{mapStatus}</Text>
      </View>
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
    marginTop: 8,
  },
  mapPlaceholder: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    marginTop: 18,
    padding: 24,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  placeholderText: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
});
