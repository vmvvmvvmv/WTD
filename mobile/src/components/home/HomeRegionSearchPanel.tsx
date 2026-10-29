import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Animated, Pressable, Text, TextInput, View } from 'react-native';

import { styles } from '../../styles/appStyles';
import { textColors } from '../../theme/bauhaus';
import type { StationDustItem } from '../../types/dust';
import type { RegionState } from '../../types/region';
import { formatDistanceKm, stationLabel, type RegionSearchResult } from '../../features/region/regionPlaceSearch';
import { isSameRegion } from '../../features/region/regionUtils';
import { accentTone } from '../../theme/appTheme';

type Props = {
  favoriteRegions: RegionState[];
  gpsRegion: RegionState | null;
  isLoadingStations: boolean;
  isSearching: boolean;
  onApplyRegion: (region: RegionState, message: string) => void;
  onChangeText: (value: string) => void;
  onSelectResult: (result: RegionSearchResult) => void;
  onToggleFavorite: (station: StationDustItem) => void;
  panelAnimation: { opacity: Animated.Value; translateY: Animated.Value };
  searchText: string;
  selectedRegion: RegionState;
  suggestions: RegionSearchResult[];
};

// 홈 '지역 검색' 패널: 아무 장소·주소·지역이나 찾고, 고르면 그 근처 측정소를 기준 지역으로 씁니다. 별표는 그 측정소 지역을 즐겨찾기에 넣습니다.
export function HomeRegionSearchPanel({
  favoriteRegions,
  gpsRegion,
  isLoadingStations,
  isSearching,
  onApplyRegion,
  onChangeText,
  onSelectResult,
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
          placeholder="장소, 주소, 지역 이름"
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
      {!!searchText.trim() && isSearching && suggestions.length === 0 && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={accentTone} />
          <Text style={styles.mutedText}>찾는 중입니다.</Text>
        </View>
      )}
      {!!searchText.trim() && !isSearching && suggestions.length === 0 && !isLoadingStations && (
        <Text style={styles.homeRegionSearchEmpty}>찾는 장소가 없습니다. 다른 이름이나 주소로 찾아보세요.</Text>
      )}
      {suggestions.length > 0 && (
        // 결과는 많아야 6개라 따로 스크롤하지 않습니다. 목록 안 스크롤이 끝에 닿으면 홈 화면 전체가 같이 움직였습니다.
        <View style={styles.homeRegionSuggestionList}>
          {suggestions.map((result) => {
            const { station } = result;
            const regionName = stationLabel(station);
            const alreadyFavorite = favoriteRegions.some((region) => isSameRegion(region, { city: station.sido ?? '', region: regionName }));
            return (
              <View key={result.key} style={styles.homeRegionSuggestionItem}>
                <Pressable
                  onPress={() => onSelectResult(result)}
                  style={({ pressed }) => [styles.homeRegionSuggestionTextGroup, pressed && styles.pressedFeedback]}
                >
                  <Text numberOfLines={1} style={styles.homeRegionSuggestionTitle}>{result.title}</Text>
                  {!!result.meta && <Text numberOfLines={1} style={styles.homeRegionSuggestionMeta}>{result.meta}</Text>}
                  {result.distanceKm !== null && (
                    <Text numberOfLines={1} style={[styles.homeRegionSuggestionMeta, { color: accentTone }]}>
                      {`근처 측정소 ${station.sido ?? ''} ${regionName} · ${formatDistanceKm(result.distanceKm)}`}
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  accessibilityLabel={alreadyFavorite ? `${regionName} 즐겨찾기 해제` : `${regionName} 즐겨찾기 추가`}
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
