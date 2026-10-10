import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Animated, Pressable, Text, TextInput, View } from 'react-native';

import { styles } from '../../styles/appStyles';
import { textColors } from '../../theme/bauhaus';
import type { RegionState, StationDustItem } from '../../types/dust';
import { isSameRegion, stationIdentity } from '../../utils/dust';

type Props = {
  accentTone: string;
  favoriteRegions: RegionState[];
  gpsRegion: RegionState | null;
  isLoadingStations: boolean;
  onApplyRegion: (region: RegionState, message: string) => void;
  onChangeText: (value: string) => void;
  onSelectStation: (station: StationDustItem) => void;
  onToggleFavorite: (station: StationDustItem) => void;
  panelAnimation: { opacity: Animated.Value; translateY: Animated.Value };
  searchText: string;
  selectedRegion: RegionState;
  suggestions: StationDustItem[];
};

// 홈 '지역 검색' 패널: 검색어로 측정소(지역)를 찾아 기준 지역으로 바꾸거나 즐겨찾기에 넣습니다.
export function HomeRegionSearchPanel({
  accentTone,
  favoriteRegions,
  gpsRegion,
  isLoadingStations,
  onApplyRegion,
  onChangeText,
  onSelectStation,
  onToggleFavorite,
  panelAnimation,
  searchText,
  selectedRegion,
  suggestions,
}: Props) {
  const isGpsSelected = !!gpsRegion && isSameRegion(gpsRegion, selectedRegion);
  return (
    <Animated.View style={[styles.homeRegionSearchPanel, { opacity: panelAnimation.opacity, transform: [{ translateY: panelAnimation.translateY }] }]}>
      <Text style={styles.favoritePickerTitle}>지역 검색</Text>
      <View style={styles.homeRegionSearchInputRow}>
        <TextInput
          autoFocus
          value={searchText}
          onChangeText={onChangeText}
          placeholder="시군구, 읍면동, 측정소 이름"
          placeholderTextColor="#8a94a3"
          returnKeyType="search"
          style={styles.homeRegionSearchInput}
        />
        {gpsRegion && (
          <Pressable
            accessibilityLabel="GPS 기준 지역으로 설정"
            disabled={isGpsSelected}
            onPress={() => onApplyRegion(gpsRegion, `${gpsRegion.city} ${gpsRegion.region} 기준으로 설정했습니다.`)}
            style={({ pressed }) => [
              styles.homeRegionSearchGpsButton,
              isGpsSelected && styles.homeGpsButtonDisabled,
              pressed && !isGpsSelected && styles.pressedFeedback,
            ]}
          >
            <Ionicons color={isGpsSelected ? textColors.disabled : accentTone} name="locate" size={20} />
          </Pressable>
        )}
      </View>
      {isLoadingStations && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={accentTone} />
          <Text style={styles.mutedText}>지역 목록을 불러오는 중입니다.</Text>
        </View>
      )}
      {!!searchText.trim() && suggestions.length === 0 && !isLoadingStations && (
        <Text style={styles.homeRegionSearchEmpty}>일치하는 지역을 찾지 못했습니다. 시군구나 읍면동 이름을 조금 다르게 입력해보세요.</Text>
      )}
      {suggestions.length > 0 && (
        <View style={styles.homeRegionSuggestionList}>
          {suggestions.map((station, index) => {
            const regionName = station.city || station.name || '';
            const alreadyFavorite = favoriteRegions.some((region) => isSameRegion(region, { city: station.sido ?? '', region: regionName }));
            return (
              <View key={`${stationIdentity(station)}-${index}-home`} style={styles.homeRegionSuggestionItem}>
                <Pressable
                  onPress={() => onSelectStation(station)}
                  style={({ pressed }) => [styles.homeRegionSuggestionTextGroup, pressed && styles.pressedFeedback]}
                >
                  <Text style={styles.homeRegionSuggestionTitle}>{station.sido} {regionName}</Text>
                  <Text style={styles.homeRegionSuggestionMeta}>{[station.name, station.addr].filter(Boolean).join(' / ')}</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={alreadyFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                  onPress={() => onToggleFavorite(station)}
                  style={({ pressed }) => [styles.homeRegionSuggestionStarButton, pressed && styles.pressedFeedback]}
                >
                  <Ionicons color={alreadyFavorite ? '#E2B93B' : textColors.disabled} name={alreadyFavorite ? 'star' : 'star-outline'} size={22} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </Animated.View>
  );
}
