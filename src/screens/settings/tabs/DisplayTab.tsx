/**
 * FreeKiosk - Simplified Display / Schedule Tab
 * Focused strictly on: Tablet Daily Schedule (On/Off) and Brightness.
 */

import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import {
  SettingsSection,
  SettingsSwitch,
  SettingsSlider,
} from '../../../components/settings';
import DailyScheduleEditor from '../../../components/settings/DailyScheduleEditor';
import { ScreenScheduleRule, DaySchedule } from '../../../types/screenScheduler';
import { Colors, Spacing, Typography } from '../../../theme';
import type { MediaItem } from '../../../types/mediaPlayer';

export interface DisplayTabProps {
  displayMode?: 'webview' | 'external_app' | 'media_player';
  
  // Brightness
  brightnessManagementEnabled?: boolean;
  onBrightnessManagementEnabledChange?: (value: boolean) => void;
  defaultBrightness: number;
  onDefaultBrightnessChange: (value: number) => void;
  autoBrightnessEnabled?: boolean;
  onAutoBrightnessEnabledChange?: (value: boolean) => void;
  autoBrightnessMin?: number;
  onAutoBrightnessMinChange?: (value: number) => void;
  autoBrightnessMax?: number;
  onAutoBrightnessMaxChange?: (value: number) => void;
  autoBrightnessOffset?: number;
  onAutoBrightnessOffsetChange?: (value: number) => void;
  currentLightLevel?: number;
  hasLightSensor?: boolean;
  
  // Status bar (compat)
  statusBarEnabled?: boolean;
  onStatusBarEnabledChange?: (value: boolean) => void;
  statusBarOnOverlay?: boolean;
  onStatusBarOnOverlayChange?: (value: boolean) => void;
  statusBarOnReturn?: boolean;
  onStatusBarOnReturnChange?: (value: boolean) => void;
  showBattery?: boolean;
  onShowBatteryChange?: (value: boolean) => void;
  showWifi?: boolean;
  onShowWifiChange?: (value: boolean) => void;
  showBluetooth?: boolean;
  onShowBluetoothChange?: (value: boolean) => void;
  showVolume?: boolean;
  onShowVolumeChange?: (value: boolean) => void;
  showTime?: boolean;
  onShowTimeChange?: (value: boolean) => void;
  statusBarTheme?: 'dark' | 'light';
  onStatusBarThemeChange?: (value: string) => void;
  
  // Keyboard mode (compat)
  keyboardMode?: string;
  onKeyboardModeChange?: (value: string) => void;
  
  // Zoom (compat)
  zoomLevel?: number;
  onZoomLevelChange?: (value: number) => void;
  zoomMode?: string;
  onZoomModeChange?: (value: string) => void;
  disableUserZoom?: boolean;
  onDisableUserZoomChange?: (value: boolean) => void;
  disableOverscroll?: boolean;
  onDisableOverscrollChange?: (value: boolean) => void;
  
  // Screensaver (compat)
  screensaverEnabled?: boolean;
  onScreensaverEnabledChange?: (value: boolean) => void;
  screensaverBrightness?: number;
  onScreensaverBrightnessChange?: (value: number) => void;
  inactivityEnabled?: boolean;
  onInactivityEnabledChange?: (value: boolean) => void;
  inactivityDelay?: string;
  onInactivityDelayChange?: (value: string) => void;
  motionEnabled?: boolean;
  onMotionEnabledChange?: (value: boolean) => void;
  motionAlwaysOn?: boolean;
  onMotionAlwaysOnChange?: (value: boolean) => void;
  motionCameraPosition?: 'front' | 'back';
  onMotionCameraPositionChange?: (position: 'front' | 'back') => void;
  motionSensitivity?: 'low' | 'medium' | 'high';
  onMotionSensitivityChange?: (value: string) => void;
  proximityEnabled?: boolean;
  onProximityEnabledChange?: (value: boolean) => void;
  availableCameras?: Array<{position: 'front' | 'back', id: string}>;
  screensaverType?: 'dim' | 'url' | 'video';
  onScreensaverTypeChange?: (value: 'dim' | 'url' | 'video') => void;
  screensaverUrl?: string;
  onScreensaverUrlChange?: (value: string) => void;
  screensaverVideoItems?: MediaItem[];
  onScreensaverVideoItemsChange?: (items: MediaItem[]) => void;
  screensaverVideoLoop?: boolean;
  onScreensaverVideoLoopChange?: (value: boolean) => void;
  screensaverKeepExternalApp?: boolean;
  onScreensaverKeepExternalAppChange?: (value: boolean) => void;
  
  // Screen Sleep Scheduler (PRIMARY)
  screenSchedulerEnabled: boolean;
  onScreenSchedulerEnabledChange: (value: boolean) => void;
  screenSchedulerRules?: ScreenScheduleRule[];
  onScreenSchedulerRulesChange?: (rules: ScreenScheduleRule[]) => void;
  dailySchedules?: DaySchedule[];
  onDailySchedulesChange?: (schedules: DaySchedule[]) => void;
  screenSchedulerWakeOnTouch: boolean;
  onScreenSchedulerWakeOnTouchChange: (value: boolean) => void;
  onAddScheduleRule?: () => void;
  onEditScheduleRule?: (rule: ScreenScheduleRule) => void;
  
  // Keep Screen On
  keepScreenOn?: boolean;
  onKeepScreenOnChange?: (value: boolean) => void;
  autoWakeOnScreenOff?: boolean;
  onAutoWakeOnScreenOffChange?: (value: boolean) => void;
}

const DisplayTab: React.FC<DisplayTabProps> = ({
  defaultBrightness,
  onDefaultBrightnessChange,
  screenSchedulerEnabled,
  onScreenSchedulerEnabledChange,
  dailySchedules = [],
  onDailySchedulesChange = () => {},
  screenSchedulerWakeOnTouch,
  onScreenSchedulerWakeOnTouchChange,
}) => {
  return (
    <View style={styles.container}>
      {/* 1. Penjadwalan Waktu Tablet Nyala / Mati */}
      <SettingsSection title="Jadwal Tablet Nyala / Mati" icon="power-sleep">
        <SettingsSwitch
          label="Aktifkan Penjadwalan Waktu"
          hint="Layar tablet akan otomatis hidup dan mati sesuai jadwal harian yang ditentukan di bawah."
          value={screenSchedulerEnabled}
          onValueChange={onScreenSchedulerEnabledChange}
        />

        {screenSchedulerEnabled && (
          <>
            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>Jadwal Harian (Senin s/d Minggu)</Text>
              <Text style={styles.subSectionSubtitle}>
                Tentukan jam aktif tablet untuk setiap harinya. Di luar jam ini atau pada hari libur, layar tablet akan otomatis mati (sleep).
              </Text>
              <DailyScheduleEditor
                schedules={dailySchedules}
                onChange={onDailySchedulesChange}
              />
            </View>

            <View style={styles.subSection}>
              <SettingsSwitch
                label="Bangunkan Layar Saat Disentuh"
                hint="Jika layar sedang mati/tidur, menyentuh layar akan menyalakannya sementara."
                value={screenSchedulerWakeOnTouch}
                onValueChange={onScreenSchedulerWakeOnTouchChange}
              />
            </View>
          </>
        )}
      </SettingsSection>

      {/* 2. Kecerahan Layar */}
      <SettingsSection title="Kecerahan Layar" icon="brightness-6">
        <SettingsSlider
          label="Tingkat Kecerahan"
          value={defaultBrightness}
          onValueChange={onDefaultBrightnessChange}
          minimumValue={0.05}
          maximumValue={1}
          step={0.05}
          valueDisplay={`${Math.round(defaultBrightness * 100)}%`}
          hint="Atur kecerahan layar tablet saat sedang menyala."
        />
      </SettingsSection>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: Spacing.xl,
  },
  subSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  subSectionTitle: {
    ...Typography.subtitle,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  subSectionSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
});

export default DisplayTab;
