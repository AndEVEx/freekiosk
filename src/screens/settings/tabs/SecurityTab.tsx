/**
 * FreeKiosk - Simplified Security Tab
 * Focused strictly on: PIN Protection and Kiosk Mode Locking.
 */

import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import {
  SettingsSection,
  SettingsSwitch,
  SettingsInput,
  SettingsInfoBox,
} from '../../../components/settings';
import Icon from '../../../components/Icon';
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

  // Tap settings (PRIMARY)
  returnTapCount?: string;
  onReturnTapCountChange?: (value: string) => void;

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
  returnTapCount = '4',
  onReturnTapCountChange = () => {},
}) => {
  const currentTap = returnTapCount || '4';

  return (
    <View style={styles.container}>
      {/* 1. PIN Keamanan Pengaturan */}
      <SettingsSection title="PIN Keamanan Pengaturan" icon="pin">
        {isPinConfigured && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm }}>
            <Icon name="check-circle" size={18} color={Colors.successDark} style={{ marginRight: 6 }} />
            <Text style={{ ...Typography.caption, color: Colors.successDark, fontWeight: '700' }}>
              PIN Pengaturan Aktif & Tersimpan (4 Digit)
            </Text>
          </View>
        )}
        <SettingsInput
          label={isPinConfigured ? "Ganti PIN Pengaturan" : "Atur PIN Pengaturan"}
          value={pin}
          onChangeText={onPinChange}
          placeholder={isPinConfigured ? "PIN tersimpan aktif (ketik baru jika ingin ganti)" : "Default: 1234 (ketik 4 digit baru)"}
          secureTextEntry={true}
          keyboardType="numeric"
          maxLength={4}
          hint={isPinConfigured ? "PIN saat ini sudah tersimpan dan aktif. Biarkan kosong jika tidak ingin mengubah PIN." : "PIN untuk membuka menu pengaturan tablet (default: 1234)."}
        />
      </SettingsSection>

      {/* 2. Mode Kiosk (Kunci Aplikasi) & Buka Pengaturan */}
      <SettingsSection title="Mode Kiosk (Kunci Aplikasi)" icon="shield-lock">
        <SettingsSwitch
          label="Kunci Aplikasi (Mode Kiosk)"
          hint="Mencegah pengguna keluar dari aplikasi absensi atau mengakses layar beranda Android."
          value={kioskEnabled}
          onValueChange={onKioskEnabledChange}
        />

        {/* Pilihan Jumlah Ketukan */}
        <View style={{ marginTop: Spacing.md, marginBottom: Spacing.sm }}>
          <Text style={styles.sectionSubLabel}>Jumlah Ketukan Layar Buka Pengaturan</Text>
          <Text style={styles.subHint}>
            Ketuk cepat di area kosong layar tablet untuk membuka jendela input PIN.
          </Text>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs }}>
            <TouchableOpacity
              style={[
                styles.tapChoiceBtn,
                currentTap === '4' && styles.tapChoiceBtnActive
              ]}
              onPress={() => onReturnTapCountChange('4')}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.tapChoiceText,
                currentTap === '4' && styles.tapChoiceTextActive
              ]}>
                ✓ 4x Ketuk (Standar)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tapChoiceBtn,
                currentTap === '5' && styles.tapChoiceBtnActive
              ]}
              onPress={() => onReturnTapCountChange('5')}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.tapChoiceText,
                currentTap === '5' && styles.tapChoiceTextActive
              ]}>
                5x Ketuk
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <SettingsInfoBox variant="info">
          <Text style={styles.infoTitle}>Cara Membuka Menu Pengaturan:</Text>
          <Text style={styles.infoText}>
            Saat aplikasi sedang berjalan di layar penuh, ketuk layar secara cepat sebanyak {currentTap} kali berturut-turut di area kosong untuk memunculkan jendela input PIN.
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
  sectionSubLabel: {
    ...Typography.body,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  subHint: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  tapChoiceBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapChoiceBtnActive: {
    backgroundColor: '#E8F5E9',
    borderColor: Colors.primary,
  },
  tapChoiceText: {
    ...Typography.body,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tapChoiceTextActive: {
    color: Colors.primary,
    fontWeight: '700',
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