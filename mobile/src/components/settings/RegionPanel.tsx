import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { styles } from '../../styles/appStyles';
import type { NotificationSettings, RegionState } from '../../types/dust';
import { isSameRegion } from '../../utils/dust';
import { NotificationToggleRow } from '../shared/DustWidgets';

// Manages location, notification options, and favorite regions on the settings screen.
export function RegionPanel({
  favoriteRegions,
  accentBorderTone,
  accentSoftTone,
  accentTone,
  isLocating,
  isSavingNotificationSettings,
  locationMessage,
  notificationsUnavailable,
  notificationSettings,
  onRemoveFavorite,
  onToggleNotificationSetting,
  onUseCurrentLocation,
  selectedRegion,
}: {
  favoriteRegions: RegionState[];
  accentBorderTone: string;
  accentSoftTone: string;
  accentTone: string;
  isLocating: boolean;
  isSavingNotificationSettings: boolean;
  locationMessage: string;
  notificationsUnavailable: boolean;
  notificationSettings: NotificationSettings;
  onRemoveFavorite: (region: RegionState) => void;
  onToggleNotificationSetting: (key: keyof NotificationSettings, value: boolean | number) => void;
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
      <View style={styles.accountHero}>
        <Pressable disabled={isLocating} onPress={onUseCurrentLocation} style={({ pressed }) => [styles.locationButton, pressed && styles.pressedFeedback]}>
          {isLocating ? (
            <ActivityIndicator color={accentTone} />
          ) : (
            <>
              <Ionicons color={accentTone} name="locate-outline" size={17} />
              <Text style={[styles.locationButtonText, { color: accentTone }]}>{'\uD604\uC7AC \uC704\uCE58\uB85C \uC9C0\uC5ED \uC124\uC815'}</Text>
            </>
          )}
        </Pressable>
        {!!locationMessage && <Text style={styles.accountMessage}>{locationMessage}</Text>}
      </View>

      <View style={[styles.card, { borderColor: accentBorderTone }]}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>{'\uC54C\uB9BC \uC124\uC815'}</Text>
            <Text style={styles.cardHint}>
              {notificationsUnavailable ? '\uAC1C\uBC1C \uBE4C\uB4DC\uC5D0\uC11C \uC54C\uB9BC\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.' : '\uC77C\uC815 \uC2DC\uAC04\uC5D0 \uB9DE\uCDB0 \uB0A0\uC528\uC640 \uC900\uBE44\uBB3C \uC548\uB0B4\uB97C \uBC1B\uC744 \uC218 \uC788\uC5B4\uC694.'}
            </Text>
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
      </View>

      <View style={[styles.card, { borderColor: accentBorderTone }]}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>{'\uC990\uACA8\uCC3E\uAE30 \uC9C0\uC5ED'}</Text>
            <Text style={styles.cardHint}>{'\uC790\uC8FC \uD655\uC778\uD558\uB294 \uC9C0\uC5ED\uC744 \uC800\uC7A5\uD574\uB450\uACE0 \uD648\uC5D0\uC11C \uBE60\uB974\uAC8C \uBC14\uAFD4\uBCFC \uC218 \uC788\uC5B4\uC694.'}</Text>
          </View>
        </View>

        {favoriteRegions.length === 0 ? (
          <View style={styles.emptyFavoriteBox}>
            <Ionicons color="#8a94a3" name="star-outline" size={22} />
            <Text style={styles.mutedText}>{'\uC9C0\uB3C4\uB098 \uD648\uC758 \uC9C0\uC5ED \uAC80\uC0C9\uC5D0\uC11C \uBCC4\uD45C\uB97C \uB204\uB974\uBA74 \uC5EC\uAE30\uC5D0 \uC800\uC7A5\uB3FC\uC694.'}</Text>
          </View>
        ) : (
          <>
            <View style={styles.favoriteList}>
              {visibleFavoriteRegions.map((region) => {
                const selected = isSameRegion(region, selectedRegion);
                return (
                  <View key={`${region.city}-${region.region}`} style={[styles.favoriteRow, selected && { backgroundColor: accentSoftTone, borderColor: accentTone }]}>
                    <View style={styles.favoriteSelectArea}>
                      <Text style={[styles.favoriteTitle, selected && { color: accentTone }]}>{region.city} {region.region}</Text>
                      <Text style={styles.favoriteMeta}>{region.label ? `${region.label} ${'\uCE21\uC815\uC18C \uAE30\uC900'}` : '\uC800\uC7A5\uB41C \uC9C0\uC5ED'}</Text>
                    </View>
                    <Pressable onPress={() => onRemoveFavorite(region)} style={({ pressed }) => [styles.favoriteRemoveButton, pressed && styles.pressedFeedback]}>
                      <Ionicons color="#687180" name="trash-outline" size={15} />
                      <Text style={styles.favoriteRemoveText}>{'\uC0AD\uC81C'}</Text>
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
                  style={({ pressed }) => [styles.favoritePagerButton, !canGoPrevFavoritePage && styles.favoritePagerButtonDisabled, pressed && canGoPrevFavoritePage && styles.pressedFeedback]}
                >
                  <Text style={[styles.favoritePagerIcon, !canGoPrevFavoritePage && styles.favoritePagerIconDisabled]}>‹</Text>
                </Pressable>
                <Text style={styles.favoritePagerText}>{currentFavoritePage + 1} / {favoritePageCount}</Text>
                <Pressable
                  disabled={!canGoNextFavoritePage}
                  onPress={() => setFavoritePageIndex((page) => Math.min(favoritePageCount - 1, page + 1))}
                  style={({ pressed }) => [styles.favoritePagerButton, !canGoNextFavoritePage && styles.favoritePagerButtonDisabled, pressed && canGoNextFavoritePage && styles.pressedFeedback]}
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

