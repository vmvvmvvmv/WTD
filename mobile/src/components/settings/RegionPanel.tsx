import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';

import { API_URL } from '../../config/runtime';

import { styles } from '../../styles/appStyles';
import { textColors } from '../../theme/bauhaus';
import type { OutfitSettings } from '../../types/outfit';
import type { RegionState } from '../../types/region';
import type { NotificationSettings } from '../../types/settings';
import { isSameRegion } from '../../features/region/regionUtils';
import { NotificationToggleRow } from '../shared/DustWidgets';
import { AppActionIcon } from '../shared/AppActionIcon';
import { accentTone } from '../../theme/appTheme';

// 서버가 공개로 내려주는 개인정보 처리방침 페이지(스토어에 등록하는 주소와 같음).
const PRIVACY_POLICY_URL = `${API_URL.replace(/\/$/, '')}/privacy/`;

// Manages location, notification options, and favorite regions on the settings screen.
export function RegionPanel({
  favoriteRegions,
  gpsRegion,
  isLocating,
  isSavingNotificationSettings,
  locationMessage,
  notificationsUnavailable,
  notificationSettings,
  outfitSettings,
  onOpenTutorial,
  onRemoveFavorite,
  onToggleNotificationSetting,
  onUpdateOutfitSetting,
  onUseCurrentLocation,
  selectedRegion,
}: {
  favoriteRegions: RegionState[];
  gpsRegion: RegionState | null;
  isLocating: boolean;
  isSavingNotificationSettings: boolean;
  locationMessage: string;
  notificationsUnavailable: boolean;
  notificationSettings: NotificationSettings;
  outfitSettings: OutfitSettings;
  onOpenTutorial: () => void;
  onRemoveFavorite: (region: RegionState) => void;
  onToggleNotificationSetting: (key: keyof NotificationSettings, value: boolean | number) => void;
  onUpdateOutfitSetting: <K extends keyof OutfitSettings>(key: K, value: OutfitSettings[K]) => void;
  onUseCurrentLocation: () => void;
  selectedRegion: RegionState;
}) {
  const favoritePageSize = 5;
  const [favoritePageIndex, setFavoritePageIndex] = useState(0);
  const favoritePageCount = Math.max(1, Math.ceil(favoriteRegions.length / favoritePageSize));
  const currentFavoritePage = Math.min(favoritePageIndex, favoritePageCount - 1);
  const visibleFavoriteRegions = favoriteRegions.slice(
    currentFavoritePage * favoritePageSize,
    currentFavoritePage * favoritePageSize + favoritePageSize,
  );
  const canGoPrevFavoritePage = currentFavoritePage > 0;
  const canGoNextFavoritePage = currentFavoritePage < favoritePageCount - 1;

  useEffect(() => {
    setFavoritePageIndex((page) => Math.min(page, Math.max(0, favoritePageCount - 1)));
  }, [favoritePageCount]);

  return (
    <>
      <View style={styles.settingsHero}>
        <View style={styles.settingsHeroTextGroup}>
          <Text style={styles.settingsHeroMeta}>현재 기준 지역</Text>
          <Text style={styles.settingsHeroTitle}>{selectedRegion.city} {selectedRegion.region}</Text>
        </View>
        <Pressable disabled={isLocating} onPress={onUseCurrentLocation} style={({ pressed }) => [styles.locationButton, pressed && styles.pressedFeedback]}>
          {isLocating ? (
            <ActivityIndicator color={accentTone} />
          ) : (
            <>
              <AppActionIcon name="location" size={24} />
              <Text style={[styles.locationButtonText, { color: accentTone }]}>{'현재 위치로 지역 설정'}</Text>
              <Ionicons color={accentTone} name="chevron-forward" size={17} />
            </>
          )}
        </Pressable>
        {!!locationMessage && <Text style={styles.accountMessage}>{locationMessage}</Text>}
      </View>

      <View style={styles.settingsSection}>
        <View style={styles.settingsSectionHeader}>
          <View style={styles.settingsSectionIcon}>
            <AppActionIcon name="outfit" size={25} />
          </View>
          <View style={styles.settingsSectionTitleGroup}>
            <Text style={styles.settingsSectionTitle}>옷차림 추천</Text>
          </View>
        </View>
        <NotificationToggleRow
          description="오늘 날씨와 일정 시간 날씨로 추천해요"
          label="옷차림 추천 보기"
          value={outfitSettings.enabled}
          onValueChange={(value) => onUpdateOutfitSetting('enabled', value)}
        />
        {outfitSettings.enabled && (
          <View style={styles.outfitSensitivitySection}>
            <Text style={styles.outfitSensitivityLabel}>코디 이미지</Text>
            <View style={styles.outfitSensitivityOptions}>
              {([['male', '남성'], ['female', '여성']] as const).map(([value, label]) => {
                const selected = outfitSettings.figure === value;
                return (
                  <Pressable
                    accessibilityLabel={`코디 이미지 ${label}`}
                    accessibilityState={{ selected }}
                    key={value}
                    onPress={() => onUpdateOutfitSetting('figure', value)}
                    style={({ pressed }) => [styles.outfitSensitivityButton, selected && styles.outfitSensitivityButtonSelected, selected && { borderBottomColor: accentTone }, pressed && styles.pressedFeedback]}
                  >
                    <Text style={[styles.outfitSensitivityButtonText, selected && { color: accentTone }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.outfitSensitivityLabel}>체감 성향</Text>
            <View style={styles.outfitSensitivityOptions}>
              {([['cold', '추위 많이 탐'], ['normal', '보통'], ['hot', '더위 많이 탐']] as const).map(([value, label]) => {
                const selected = outfitSettings.sensitivity === value;
                return (
                  <Pressable
                    accessibilityLabel={`체감 성향 ${label}`}
                    accessibilityState={{ selected }}
                    key={value}
                    onPress={() => onUpdateOutfitSetting('sensitivity', value)}
                    style={({ pressed }) => [styles.outfitSensitivityButton, selected && styles.outfitSensitivityButtonSelected, selected && { borderBottomColor: accentTone }, pressed && styles.pressedFeedback]}
                  >
                    <Text style={[styles.outfitSensitivityButtonText, selected && { color: accentTone }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </View>

      <View style={styles.settingsSection}>
        <View style={styles.settingsSectionHeader}>
          <View style={styles.settingsSectionIcon}>
            <Ionicons color={accentTone} name="heart-outline" size={24} />
          </View>
          <View style={styles.settingsSectionTitleGroup}>
            <Text style={styles.settingsSectionTitle}>건강</Text>
          </View>
        </View>
        <NotificationToggleRow
          description="미세먼지 '보통'부터 조심하라고 알려 드려요"
          label="민감군 모드"
          value={outfitSettings.sensitiveMode}
          onValueChange={(value) => onUpdateOutfitSetting('sensitiveMode', value)}
        />
      </View>

      <View style={styles.settingsSection}>
        <View style={styles.settingsSectionHeader}>
          <View style={styles.settingsSectionIcon}>
            <AppActionIcon name="notification" size={25} />
          </View>
          <View style={styles.settingsSectionTitleGroup}>
            <Text style={styles.settingsSectionTitle}>{'알림 설정'}</Text>
            {notificationsUnavailable && <Text style={styles.settingsUnavailableText}>{'개발 빌드에서 알림을 사용할 수 있어요.'}</Text>}
            {/* 알림은 현재 위치 지역 기준이라, 홈에서 다른 지역을 보고 있어도 헷갈리지 않게 보여 준다. */}
            <Text style={styles.settingsUnavailableText}>
              알림 지역: {(gpsRegion ?? selectedRegion).city} {(gpsRegion ?? selectedRegion).region}{gpsRegion ? ' · 현재 위치' : ''}
            </Text>
          </View>
          {isSavingNotificationSettings && <ActivityIndicator color={accentTone} />}
        </View>
        <NotificationToggleRow
          disabled={isSavingNotificationSettings || notificationsUnavailable}
          description="앱의 모든 알림을 켜고 꺼요"
          label={'알림 받기'}
          value={notificationSettings.enabled}
          onValueChange={(value) => onToggleNotificationSetting('enabled', value)}
        />
        <NotificationToggleRow
          disabled={isSavingNotificationSettings || notificationsUnavailable || !notificationSettings.enabled}
          description="일정 전에 그 시간 날씨와 함께 알려 줘요"
          label={'일정 알림'}
          value={notificationSettings.calendarReminders}
          onValueChange={(value) => onToggleNotificationSetting('calendarReminders', value)}
        />
        <NotificationToggleRow
          disabled={isSavingNotificationSettings || notificationsUnavailable || !notificationSettings.enabled}
          description="매일 아침 7시에 오늘 날씨를 알려 줘요"
          label={'아침 날씨 알림'}
          value={notificationSettings.weatherMorningAlerts}
          onValueChange={(value) => onToggleNotificationSetting('weatherMorningAlerts', value)}
        />
        <NotificationToggleRow
          disabled={isSavingNotificationSettings || notificationsUnavailable || !notificationSettings.enabled}
          description="미세먼지가 나쁜 날 한 번 알려 줘요"
          label="미세먼지 나쁨 알림"
          value={notificationSettings.dustSpikeAlerts}
          onValueChange={(value) => onToggleNotificationSetting('dustSpikeAlerts', value)}
        />
        <NotificationToggleRow
          disabled={isSavingNotificationSettings || notificationsUnavailable || !notificationSettings.enabled}
          description="내 지역에 호우·대설·강풍 같은 특보가 나오면 알려 줘요"
          label="기상특보 알림"
          value={notificationSettings.weatherWarningAlerts}
          onValueChange={(value) => onToggleNotificationSetting('weatherWarningAlerts', value)}
        />
        {/* 아침 날씨·미세먼지·기상특보는 서버가 보내는 알림이라, 서버에 저장하는 정보를 토글 바로 아래에 알린다. */}
        <Text style={styles.settingsUnavailableText}>
          아침 날씨·미세먼지·특보 알림을 보내려고 알림 주소·지역·일정 날짜/시간을 서버에 저장해요.{' '}
          <Text
            accessibilityRole="link"
            onPress={() => { Linking.openURL(PRIVACY_POLICY_URL).catch(() => {}); }}
            style={{ color: accentTone, fontWeight: '700' }}
          >
            처리방침 보기
          </Text>
        </Text>
      </View>

      <View style={styles.settingsSection}>
        <View style={styles.settingsSectionHeader}>
          <View style={styles.settingsSectionIcon}>
            <AppActionIcon name="favorite" size={25} />
          </View>
          <View style={styles.settingsSectionTitleGroup}>
            <Text style={styles.settingsSectionTitle}>{'즐겨찾기 지역'}</Text>
          </View>
        </View>

        {favoriteRegions.length === 0 ? (
          <View style={styles.emptyFavoriteBox}>
            <Text style={styles.mutedText}>{'저장된 지역이 없어요.'}</Text>
          </View>
        ) : (
          <>
            <View style={styles.favoriteList}>
              {visibleFavoriteRegions.map((region) => {
                const selected = isSameRegion(region, selectedRegion);
                return (
                  <View key={`${region.city}-${region.region}`} style={styles.settingsFavoriteRow}>
                    <View style={styles.favoriteSelectArea}>
                      <View style={styles.settingsFavoriteTitleRow}>
                        {selected && <View style={[styles.settingsFavoriteActiveDot, { backgroundColor: accentTone }]} />}
                        <Text style={[styles.favoriteTitle, selected && { color: accentTone }]}>{region.city} {region.region}</Text>
                      </View>
                      <Text style={styles.favoriteMeta}>{region.label ? `${region.label} ${'측정소 기준'}` : '저장된 지역'}</Text>
                    </View>
                    <Pressable accessibilityLabel={`${region.city} ${region.region} 즐겨찾기 삭제`} onPress={() => onRemoveFavorite(region)} style={({ pressed }) => [styles.settingsFavoriteRemoveButton, pressed && styles.pressedFeedback]}>
                      <AppActionIcon name="delete" size={21} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
            {favoritePageCount > 1 && (
              <View style={styles.favoritePager}>
                <Pressable
                  disabled={!canGoPrevFavoritePage}
                  onPress={() => setFavoritePageIndex((page) => Math.max(0, page - 1))}
                  style={({ pressed }) => [styles.settingsPagerButton, pressed && canGoPrevFavoritePage && styles.pressedFeedback]}
                >
                  <Ionicons accessibilityLabel="이전 즐겨찾기" color={canGoPrevFavoritePage ? accentTone : textColors.disabled} name="chevron-back" size={20} />
                </Pressable>
                <Text style={styles.favoritePagerText}>{currentFavoritePage + 1} / {favoritePageCount}</Text>
                <Pressable
                  disabled={!canGoNextFavoritePage}
                  onPress={() => setFavoritePageIndex((page) => Math.min(favoritePageCount - 1, page + 1))}
                  style={({ pressed }) => [styles.settingsPagerButton, pressed && canGoNextFavoritePage && styles.pressedFeedback]}
                >
                  <Ionicons accessibilityLabel="다음 즐겨찾기" color={canGoNextFavoritePage ? accentTone : textColors.disabled} name="chevron-forward" size={20} />
                </Pressable>
              </View>
            )}
          </>
        )}
      </View>

      <View style={styles.settingsSection}>
        <View style={styles.settingsSectionHeader}>
          <View style={styles.settingsSectionIcon}>
            <Ionicons color={accentTone} name="information-circle" size={24} />
          </View>
          <View style={styles.settingsSectionTitleGroup}>
            <Text style={styles.settingsSectionTitle}>앱 정보</Text>
          </View>
        </View>
        <View style={styles.settingsInfoRow}>
          <Text style={styles.settingsInfoLabel}>데이터 출처</Text>
          <Text style={styles.settingsInfoValue}>대기질: 한국환경공단 에어코리아{'\n'}날씨: 기상청 단기·중기예보{'\n'}제공: 공공데이터포털(data.go.kr)</Text>
        </View>
        <Pressable
          accessibilityLabel="개인정보 처리방침 열기"
          accessibilityRole="link"
          onPress={() => { Linking.openURL(PRIVACY_POLICY_URL).catch(() => {}); }}
          style={({ pressed }) => [styles.settingsInfoRow, pressed && styles.pressedFeedback]}
        >
          <Text style={styles.settingsInfoLabel}>개인정보 처리방침</Text>
          <Text style={[styles.settingsInfoValue, { color: accentTone }]}>전문 보기 ›</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="튜토리얼 다시 보기"
          accessibilityRole="button"
          onPress={onOpenTutorial}
          style={({ pressed }) => [styles.settingsInfoRow, pressed && styles.pressedFeedback]}
        >
          <Text style={styles.settingsInfoLabel}>튜토리얼</Text>
          <Text style={[styles.settingsInfoValue, { color: accentTone }]}>다시 보기 ›</Text>
        </Pressable>
        <View style={[styles.settingsInfoRow, styles.settingsInfoRowLast]}>
          <Text style={styles.settingsInfoLabel}>버전</Text>
          <Text style={styles.settingsInfoValue}>{Constants.expoConfig?.version ?? '-'}</Text>
        </View>
      </View>
    </>
  );
}

