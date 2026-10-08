import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { styles } from '../../styles/appStyles';
import type { NotificationSettings, OutfitSettings, RegionState } from '../../types/dust';
import { isSameRegion } from '../../utils/dust';
import { NotificationToggleRow } from '../shared/DustWidgets';
import { AppActionIcon } from '../shared/AppActionIcon';

// Manages location, notification options, and favorite regions on the settings screen.
export function RegionPanel({
  favoriteRegions,
  accentBorderTone,
  accentSoftTone,
  accentTone,
  isLocating,
  isSavingNotificationSettings,
  isSendingTestNotification,
  locationMessage,
  notificationsUnavailable,
  notificationSettings,
  outfitSettings,
  onRemoveFavorite,
  onSendTestNotification,
  onToggleNotificationSetting,
  onUpdateOutfitSetting,
  onUseCurrentLocation,
  selectedRegion,
}: {
  favoriteRegions: RegionState[];
  accentBorderTone: string;
  accentSoftTone: string;
  accentTone: string;
  isLocating: boolean;
  isSavingNotificationSettings: boolean;
  isSendingTestNotification: boolean;
  locationMessage: string;
  notificationsUnavailable: boolean;
  notificationSettings: NotificationSettings;
  outfitSettings: OutfitSettings;
  onRemoveFavorite: (region: RegionState) => void;
  onSendTestNotification: () => void;
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
        <View style={styles.settingsHeroTop}>
          <View style={[styles.settingsHeroIcon, { backgroundColor: accentSoftTone }]}>
            <Ionicons color={accentTone} name="settings-outline" size={22} />
          </View>
          <View style={styles.settingsHeroTextGroup}>
            <Text style={styles.settingsHeroTitle}>설정</Text>
            <Text style={styles.settingsHeroMeta}>{selectedRegion.city} {selectedRegion.region}</Text>
          </View>
        </View>
        <Pressable disabled={isLocating} onPress={onUseCurrentLocation} style={({ pressed }) => [styles.locationButton, pressed && styles.pressedFeedback]}>
          {isLocating ? (
            <ActivityIndicator color={accentTone} />
          ) : (
            <>
              <AppActionIcon name="location" size={24} />
              <Text style={[styles.locationButtonText, { color: accentTone }]}>{'\uD604\uC7AC \uC704\uCE58\uB85C \uC9C0\uC5ED \uC124\uC815'}</Text>
              <Ionicons color={accentTone} name="chevron-forward" size={17} />
            </>
          )}
        </Pressable>
        {!!locationMessage && <Text style={styles.accountMessage}>{locationMessage}</Text>}
      </View>

      <View style={styles.settingsSection}>
        <View style={styles.settingsSectionHeader}>
          <View style={styles.settingsSectionIcon}>
            <AppActionIcon name="activityOutdoor" size={25} />
          </View>
          <View style={styles.settingsSectionTitleGroup}>
            <Text style={styles.settingsSectionTitle}>옷차림 추천</Text>
          </View>
        </View>
        <NotificationToggleRow
          accentTone={accentTone}
          label="일정별 옷차림 추천"
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
            <AppActionIcon name="notification" size={25} />
          </View>
          <View style={styles.settingsSectionTitleGroup}>
            <Text style={styles.settingsSectionTitle}>{'\uC54C\uB9BC \uC124\uC815'}</Text>
            {notificationsUnavailable && <Text style={styles.settingsUnavailableText}>{'\uAC1C\uBC1C \uBE4C\uB4DC\uC5D0\uC11C \uC54C\uB9BC\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694.'}</Text>}
          </View>
          {isSavingNotificationSettings && <ActivityIndicator color={accentTone} />}
        </View>
        <NotificationToggleRow
          accentTone={accentTone}
          disabled={isSavingNotificationSettings || notificationsUnavailable}
          label={'\uC54C\uB9BC \uBC1B\uAE30'}
          value={notificationSettings.enabled}
          onValueChange={(value) => onToggleNotificationSetting('enabled', value)}
        />
        <NotificationToggleRow
          accentTone={accentTone}
          disabled={isSavingNotificationSettings || notificationsUnavailable || !notificationSettings.enabled}
          label={'\uC77C\uC815 \uC54C\uB9BC'}
          value={notificationSettings.calendarReminders}
          onValueChange={(value) => onToggleNotificationSetting('calendarReminders', value)}
        />
        <NotificationToggleRow
          accentTone={accentTone}
          disabled={isSavingNotificationSettings || notificationsUnavailable || !notificationSettings.enabled}
          label={'\uC544\uCE68 \uB0A0\uC528 \uC54C\uB9BC'}
          value={notificationSettings.weatherMorningAlerts}
          onValueChange={(value) => onToggleNotificationSetting('weatherMorningAlerts', value)}
        />
        <Pressable
          accessibilityLabel="3초 뒤 테스트 알림 받기"
          disabled={isSendingTestNotification || notificationsUnavailable || !notificationSettings.enabled}
          onPress={onSendTestNotification}
          style={({ pressed }) => [
            styles.notificationTestButton,
            (isSendingTestNotification || notificationsUnavailable || !notificationSettings.enabled) && styles.notificationRowDisabled,
            pressed && styles.pressedFeedback,
          ]}
        >
          {isSendingTestNotification
            ? <ActivityIndicator color={accentTone} size="small" />
            : <Ionicons color={accentTone} name="notifications-outline" size={18} />}
          <View style={styles.notificationTestTextGroup}>
            <Text style={[styles.notificationTestTitle, { color: accentTone }]}>테스트 알림 보내기</Text>
            <Text style={styles.notificationTestHint}>3초 뒤 알림이 오는지 확인해요</Text>
          </View>
          <Ionicons color={accentTone} name="chevron-forward" size={17} />
        </Pressable>
      </View>

      <View style={styles.settingsSection}>
        <View style={styles.settingsSectionHeader}>
          <View style={styles.settingsSectionIcon}>
            <AppActionIcon name="favorite" size={25} />
          </View>
          <View style={styles.settingsSectionTitleGroup}>
            <Text style={styles.settingsSectionTitle}>{'\uC990\uACA8\uCC3E\uAE30 \uC9C0\uC5ED'}</Text>
          </View>
        </View>

        {favoriteRegions.length === 0 ? (
          <View style={styles.emptyFavoriteBox}>
            <AppActionIcon name="favorite" size={30} />
            <Text style={styles.mutedText}>{'\uC800\uC7A5\uB41C \uC9C0\uC5ED\uC774 \uC5C6\uC5B4\uC694.'}</Text>
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
                      <Text style={styles.favoriteMeta}>{region.label ? `${region.label} ${'\uCE21\uC815\uC18C \uAE30\uC900'}` : '\uC800\uC7A5\uB41C \uC9C0\uC5ED'}</Text>
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
                  style={({ pressed }) => [styles.settingsPagerButton, !canGoPrevFavoritePage && styles.settingsPagerButtonDisabled, pressed && canGoPrevFavoritePage && styles.pressedFeedback]}
                >
                  <Text style={[styles.favoritePagerIcon, !canGoPrevFavoritePage && styles.favoritePagerIconDisabled]}>‹</Text>
                </Pressable>
                <Text style={styles.favoritePagerText}>{currentFavoritePage + 1} / {favoritePageCount}</Text>
                <Pressable
                  disabled={!canGoNextFavoritePage}
                  onPress={() => setFavoritePageIndex((page) => Math.min(favoritePageCount - 1, page + 1))}
                  style={({ pressed }) => [styles.settingsPagerButton, !canGoNextFavoritePage && styles.settingsPagerButtonDisabled, pressed && canGoNextFavoritePage && styles.pressedFeedback]}
                >
                  <Text style={[styles.favoritePagerIcon, !canGoNextFavoritePage && styles.favoritePagerIconDisabled]}>›</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </View>
    </>
  );
}

