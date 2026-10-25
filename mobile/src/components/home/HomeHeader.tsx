import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';

import { styles } from '../../styles/appStyles';
import { bauhausColors, textColors } from '../../theme/bauhaus';
import type { CurrentDustItem } from '../../types/dust';
import type { RegionState } from '../../types/region';
import type { WeatherState } from '../../types/weather';
import { formatCurrentBasis } from '../../features/dashboard/currentBasis';
import { isSameRegion } from '../../features/region/regionUtils';
import { AppActionIcon } from '../shared/AppActionIcon';
import { WeatherIcon, weatherIconKind } from '../shared/WeatherIcon';
import { tutorialTarget } from '../shared/TutorialTour';
import { accentTone } from '../../theme/appTheme';

type PanelAnimation = { opacity: Animated.Value; translateY: Animated.Value };

type Props = {
  currentItem: CurrentDustItem | null;
  error: string;
  favoriteRegions: RegionState[];
  gpsRegion: RegionState | null;
  isSearchOpen: boolean;
  onApplyRegion: (region: RegionState, message: string) => void;
  onOpenSearch: () => void;
  onRemoveFavorite: (region: RegionState) => void;
  onRetry: () => void;
  onToggleFavoritePicker: () => void;
  panelAnimation: PanelAnimation;
  selectedRegion: RegionState;
  showFavoritePicker: boolean;
  weather: WeatherState | null;
};

// 홈 맨 위(스크롤해도 붙어 있음): 지역 이름·지역 검색·날씨 칩, 기준 시각(또는 오류), 즐겨찾기 지역 바꾸기.
export function HomeHeader({
  currentItem,
  error,
  favoriteRegions,
  gpsRegion,
  isSearchOpen,
  onApplyRegion,
  onOpenSearch,
  onRemoveFavorite,
  onRetry,
  onToggleFavoritePicker,
  panelAnimation,
  selectedRegion,
  showFavoritePicker,
  weather,
}: Props) {
  return (
    <View style={styles.homeHeader}>
      <View ref={tutorialTarget('homeRegion')} style={styles.homeTitleRow}>
        <Pressable
          accessibilityLabel={favoriteRegions.length === 0 ? '지역 검색 열기' : '즐겨찾기 지역 선택'}
          onPress={favoriteRegions.length === 0 ? onOpenSearch : onToggleFavoritePicker}
          style={({ pressed }) => [styles.homeTitleButton, pressed && styles.pressedFeedback]}
        >
          <View style={styles.homeTitleInline}>
            <Text numberOfLines={1} style={[styles.title, styles.homeRegionTitle]}>{selectedRegion.city} {selectedRegion.region}</Text>
            <Ionicons color="#141821" name="chevron-down" size={20} style={styles.homeTitleChevron} />
          </View>
        </Pressable>
        <Pressable
          accessibilityLabel="홈에서 지역 검색"
          onPress={onOpenSearch}
          style={({ pressed }) => [styles.regionAddButton, pressed && styles.pressedFeedback]}
        >
          <AppActionIcon name="search" size={22} />
          <Text style={[styles.regionAddText, isSearchOpen && { color: accentTone }]}>지역 검색</Text>
        </Pressable>
        {/* 기온을 아직 모르면 "--° 날씨" 같은 빈 칩 대신 아예 숨깁니다. */}
        {typeof weather?.temperature === 'number' && (
          <View
            accessibilityLabel={`현재 ${Math.round(weather.temperature)}도${weather.label ? `, ${weather.label}` : ''}`}
            accessible
            style={styles.homeWeatherChip}
          >
            <WeatherIcon kind={weatherIconKind(weather.label, weather.windSpeed)} size={24} />
            <View>
              <Text style={styles.homeWeatherValue}>{Math.round(weather.temperature)}°</Text>
              {!!weather.label && <Text style={styles.homeWeatherLabel}>{weather.label}</Text>}
            </View>
          </View>
        )}
      </View>
      {error && !currentItem ? (
        <Pressable
          accessibilityLabel={`${error} 다시 시도`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onRetry}
          style={({ pressed }) => [styles.homeErrorRow, pressed && styles.pressedFeedback]}
        >
          <Ionicons color={bauhausColors.red} name="cloud-offline-outline" size={14} />
          <Text style={styles.homeErrorText}>{error}</Text>
          <Text style={[styles.homeErrorRetry, { color: accentTone }]}>다시 시도</Text>
        </Pressable>
      ) : (
        <Text style={[styles.homeBasisText, currentItem?.source === 'stored_daily_latest' && styles.homeBasisTextFallback]}>
          {formatCurrentBasis(currentItem)}
        </Text>
      )}
      {/* 즐겨찾기 지역 바꾸기: 머리 안에 있어서 화면을 내려도 머리와 함께 위에 붙어 있습니다. */}
      {showFavoritePicker && (
        <Animated.View style={[styles.favoritePicker, { opacity: panelAnimation.opacity, transform: [{ translateY: panelAnimation.translateY }] }]}>
          <View style={styles.favoritePickerHeader}>
            <Text style={styles.favoritePickerTitle}>지역 바꾸기</Text>
            <Text style={styles.favoritePickerCount}>즐겨찾기 {favoriteRegions.length}곳</Text>
          </View>
          <ScrollView nestedScrollEnabled style={styles.favoritePickerScroll}>
            {gpsRegion && (() => {
              const selected = isSameRegion(gpsRegion, selectedRegion);
              return (
                <Pressable
                  accessibilityLabel={`현재 지역 ${gpsRegion.city} ${gpsRegion.region}${selected ? ', 보는 중' : ''}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  disabled={selected}
                  onPress={() => onApplyRegion(gpsRegion, `${gpsRegion.city} ${gpsRegion.region} 기준으로 돌아왔습니다.`)}
                  style={({ pressed }) => [styles.favoritePickerRow, pressed && styles.pressedFeedback]}
                >
                  <View style={styles.favoritePickerIconBox}><AppActionIcon name="location" size={22} /></View>
                  <Text numberOfLines={1} style={styles.favoritePickerName}>
                    <Text style={selected && { color: accentTone }}>{gpsRegion.region}</Text>
                    <Text style={styles.favoritePickerCity}>{`  ${gpsRegion.city}`}</Text>
                  </Text>
                  {selected ? (
                    <Text style={[styles.favoritePickerStatus, { color: accentTone }]}>✓ 보는 중</Text>
                  ) : (
                    <Text style={styles.favoritePickerStatus}>현재 지역</Text>
                  )}
                </Pressable>
              );
            })()}
            {favoriteRegions.map((region) => {
              const selected = isSameRegion(region, selectedRegion);
              return (
                <View key={`${region.city}-${region.region}`} style={styles.favoritePickerRow}>
                  <Pressable
                    accessibilityLabel={`${region.city} ${region.region}${selected ? ', 보는 중' : ''}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => onApplyRegion(region, `${region.city} ${region.region} 기준으로 변경했습니다.`)}
                    style={({ pressed }) => [styles.favoritePickerSelectArea, pressed && styles.pressedFeedback]}
                  >
                    <Ionicons color="#E2B93B" name="star" size={17} style={styles.favoritePickerIcon} />
                    <Text numberOfLines={1} style={styles.favoritePickerName}>
                      <Text style={selected && { color: accentTone }}>{region.region}</Text>
                      <Text style={styles.favoritePickerCity}>{`  ${region.city}`}</Text>
                    </Text>
                    {selected && <Text style={[styles.favoritePickerStatus, { color: accentTone }]}>✓ 보는 중</Text>}
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`${region.city} ${region.region} 즐겨찾기 삭제`}
                    hitSlop={8}
                    onPress={() => onRemoveFavorite(region)}
                    style={({ pressed }) => [styles.favoritePickerRemoveButton, pressed && styles.pressedFeedback]}
                  >
                    <Ionicons color={textColors.disabled} name="close" size={17} />
                  </Pressable>
                </View>
              );
            })}
            {favoriteRegions.length === 0 && (
              <Text style={styles.homeRegionSearchEmpty}>지역 검색 결과의 별을 눌러 즐겨찾기를 추가해 보세요.</Text>
            )}
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}
