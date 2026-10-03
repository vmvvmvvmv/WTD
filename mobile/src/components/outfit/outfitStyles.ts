import { StyleSheet } from 'react-native';

import { semanticColors } from '../../theme/semanticColors';

const token = semanticColors.outfit;

export const outfitStyles = StyleSheet.create({
  card: { backgroundColor: token.card, borderColor: token.border, borderRadius: 20, borderWidth: 1, overflow: 'hidden', padding: 14 },
  cardHeader: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  cardHeaderIcon: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, height: 46, justifyContent: 'center', width: 46 },
  cardHeaderText: { flex: 1, minWidth: 0 },
  eyebrow: { color: token.accent, fontSize: 10, fontWeight: '900' },
  source: { color: '#718096', fontSize: 9, fontWeight: '800' },
  sourcePill: { backgroundColor: '#FFFFFF', borderColor: token.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 4 },
  summary: { color: '#23324D', fontSize: 15, fontWeight: '900', lineHeight: 21, marginTop: 10 },
  note: { color: '#53657D', fontSize: 11, fontWeight: '800', lineHeight: 17, marginTop: 6 },
  layerTip: { color: token.accent, fontSize: 10, fontWeight: '800', lineHeight: 15, marginTop: 5 },
  temperatureRow: { alignItems: 'center', flexDirection: 'row', gap: 9, marginTop: 11 },
  temperatureText: { color: '#53657D', fontSize: 10, fontWeight: '900', minWidth: 58 },
  temperatureTrack: { backgroundColor: '#DDE9F8', borderRadius: 999, flex: 1, height: 6, overflow: 'hidden' },
  temperatureFill: { backgroundColor: token.accent, borderRadius: 999, height: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 11 },
  chip: { alignItems: 'center', backgroundColor: token.soft, borderColor: token.border, borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 4, minHeight: 32, paddingHorizontal: 9 },
  chipRequired: { backgroundColor: token.requiredSoft, borderColor: semanticColors.weather.caution.border },
  chipText: { color: token.accent, fontSize: 10, fontWeight: '900' },
  chipTextRequired: { color: token.required },
  mustIcon: { alignItems: 'center', height: 17, justifyContent: 'center', width: 17 },
  outfitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  outfitItem: { backgroundColor: '#FFFFFF', borderRadius: 10, color: '#53657D', fontSize: 10, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 6 },
  skeleton: { backgroundColor: token.card, borderColor: token.border, borderRadius: 20, borderWidth: 1, gap: 9, padding: 14 },
  skeletonLine: { backgroundColor: '#DCE8F7', borderRadius: 999, height: 11 },
  empty: { alignItems: 'center', backgroundColor: token.card, borderColor: token.border, borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 9, minHeight: 58, paddingHorizontal: 12 },
  emptyText: { color: '#718096', flex: 1, fontSize: 11, fontWeight: '800', lineHeight: 16 },
  retry: { alignItems: 'center', borderRadius: 10, justifyContent: 'center', minHeight: 44, minWidth: 58, paddingHorizontal: 8 },
  retryText: { color: token.accent, fontSize: 11, fontWeight: '900' },
});
