/**
 * FreeKiosk - Simplified Security Tab
 * Focused strictly on: PIN Protection and Kiosk Mode Locking.
 */

import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import {
  SettingsSection,
  SettingsSwitch,
  SettingsInput,
  SettingsInfoBox,
} from '../../../components/settings';
import { Colors, Spacing, Typography } from '../../../theme';

export interface SecurityTabProps {
  displayMode?: 'webview' | 'external_app' | 'media_player';
  isDeviceOwner?: boolean;
  navigation?: any;
  
  // Lock mode (PRIMARY)
  kioskEnabled: boolean;
  onKioskEnabledChange: (value: boolean) => void;
  
  // Auto launch (PRIMARY)
  autoLaunchEnabled?: boolean;
  onAutoLaunchChange?: (value: boolean) => void;
  onOpenSystemSettings?: () => void;

  // PIN (PRIMARY)
  pin?: string;
  onPinChange?: (pin: string) => void;
  isPinConfigured?: boolean;

  // Compatibility props retained to avoid breakage
  allowPowerButton?: boolean;
  onAllowPowerButtonChange?: (value: boolean) => void;
  blockFactoryReset?: boolean;
  onBlockFactoryResetChange?: (value: boolean) => void;
  allowRemoteScreenshot?: boolean;
  onAllowRemoteScreenshotChange?: (value: boolean) => void;
  allowHardwareScreenshot?: boolean;
  onAllowHardwareScreenshotChange?: (value: boolean) => void;
  allowUsbDebugDialog?: boolean;
  onAllowUsbDebugDialogChange?: (value: boolean) => void;
  allowNotifications?: boolean;
  onAllowNotificationsChange?: (value: boolean) => void;
  allowSystemInfo?: boolean;
  onAllowSystemInfoChange?: (value: boolean) => void;
  returnMode?: string;
  onReturnModeChange?: (value: string) => void;
  returnTapCount?: string;
  onReturnTapCountChange?: (value: string) => void;
  returnTapTimeout?: string;
  onReturnTapTimeoutChange?: (value: string) => void;
  returnButtonPosition?: string;
  onReturnButtonPositionChange?: (value: string) => void;
  overlayButtonVisible?: boolean;
  onOverlayButtonVisibleChange?: (value: boolean) => void;
  volumeUp5TapEnabled?: boolean;
  onVolumeUp5TapEnabledChange?: (value: boolean) => void;
  screenLockCompatEnabled?: boolean;
  onScreenLockCompatChange?: (value: boolean) => void;
  defaultLauncherEnabled?: boolean;
  onDefaultLauncherChange?: (value: boolean) => void;
  urlFilterEnabled?: boolean;
  onUrlFilterEnabledChange?: (value: boolean) => void;
  urlFilterMode?: 'blacklist' | 'whitelist';
  onUrlFilterModeChange?: (value: 'blacklist' | 'whitelist') => void;
  urlFilterList?: string[];
  onUrlFilterListChange?: (list: string[]) => void;
  urlFilterShowFeedback?: boolean;
  onUrlFilterShowFeedbackChange?: (value: boolean) => void;
  onManageBlockingOverlays?: () => void;
  blockingOverlaysCount?: number;
  autoRelaunchApp?: boolean;
  onAutoRelaunchAppChange?: (value: boolean) => void;
  backButtonMode?: string;
  onBackButtonModeChange?: (value: string) => void;
  backButtonTimerDelay?: string;
  onBackButtonTimerDelayChange?: (value: string) => void;
  lockscreenEmergencyEnabled?: boolean;
  onLockscreenEmergencyEnabledChange?: (value: boolean) => void;
  lockscreenEmergencyNumber?: string;
  onLockscreenEmergencyNumberChange?: (value: string) => void;
  lockscreenQuickCameraEnabled?: boolean;
  onLockscreenQuickCameraEnabledChange?: (value: boolean) => void;
}

const SecurityTab: React.FC<SecurityTabProps> = ({
  kioskEnabled,
  onKioskEnabledChange,
  autoLaunchEnabled = false,
  onAutoLaunchChange = () => {},
  pin = '',
  onPinChange = () => {},
  isPinConfigured = false,
}) => {
  return (
    <View style={styles.container}>
      {/* 1. PIN Keamanan Pengaturan */}
      <SettingsSection title="PIN Keamanan Pengaturan" icon="pin">
        <SettingsInput
          label={isPinConfigured ? "Ganti PIN Pengaturan" : "Atur PIN Pengaturan"}
          value={pin}
          onChangeText={onPinChange}
          placeholder="4 digit angka"
          secureTextEntry={true}
          keyboardType="numeric"
          maxLength={4}
          hint="PIN untuk mengakses halaman pengaturan agar tidak diubah sembarang orang."
        />
      </SettingsSection>

      {/* 2. Mode Kiosk (Kunci Aplikasi) */}
      <SettingsSection title="Mode Kiosk (Kunci Aplikasi)" icon="shield-lock">
        <SettingsSwitch
          label="Kunci Aplikasi (Mode Kiosk)"
          hint="Mencegah pengguna keluar dari aplikasi absensi atau mengakses layar beranda Android."
          value={kioskEnabled}
          onValueChange={onKioskEnabledChange}
        />

        <SettingsInfoBox variant="info">
          <Text style={styles.infoTitle}>Cara Membuka Menu Pengaturan:</Text>
          <Text style={styles.infoText}>
            Saat aplikasi sedang berjalan di layar penuh, ketuk layar secara cepat sebanyak 5 kali berturut-turut untuk memunculkan jendela input PIN.
          </Text>
        </SettingsInfoBox>
      </SettingsSection>

      {/* 3. Otomatis Buka saat Tablet Dihidupkan */}
      <SettingsSection title="Mulai Otomatis (Auto Start)" icon="rocket-launch">
        <SettingsSwitch
          label="Buka Kiosk saat Tablet Menyala"
          hint="Otomatis membuka aplikasi absensi saat tablet selesai dinyalakan / di-reboot."
          value={autoLaunchEnabled}
          onValueChange={onAutoLaunchChange}
        />
      </SettingsSection>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: Spacing.xl,
  },
  infoTitle: {
    ...Typography.label,
    fontWeight: '700',
    color: Colors.infoDark,
    marginBottom: Spacing.xs,
  },
  infoText: {
    ...Typography.body,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
});

export default SecurityTab;
