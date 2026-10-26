/**
 * FreeKiosk - Simplified General / Web Tab
 * Focused strictly on: URL, Inactivity Return, Credentials (Auth), Virtual Keyboard, and Auto Reload.
 */

import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import {
  SettingsSection,
  SettingsInput,
  SettingsSwitch,
  SettingsRadioGroup,
} from '../../../components/settings';
import { Colors, Spacing, Typography } from '../../../theme';
import { SupportedLanguage } from '../../../i18n';
import { ManagedApp } from '../../../types/managedApps';
import { ScheduledEvent } from '../../../types/planner';
import { MediaItem, MediaFitMode } from '../../../types/mediaPlayer';

export interface GeneralTabProps {
  language?: SupportedLanguage;
  onLanguageChange?: (language: SupportedLanguage) => void;
  displayMode?: 'webview' | 'external_app' | 'media_player';
  onDisplayModeChange?: (mode: 'webview' | 'external_app' | 'media_player') => void;
  
  // WebView settings (PRIMARY)
  url: string;
  onUrlChange: (url: string) => void;

  // Inactivity Return to Home (PRIMARY)
  inactivityReturnEnabled: boolean;
  onInactivityReturnEnabledChange: (value: boolean) => void;
  inactivityReturnDelay: string;
  onInactivityReturnDelayChange: (value: string) => void;
  inactivityReturnResetOnNav: boolean;
  onInactivityReturnResetOnNavChange: (value: boolean) => void;
  inactivityReturnClearCache: boolean;
  onInactivityReturnClearCacheChange: (value: boolean) => void;
  inactivityReturnScrollTop: boolean;
  onInactivityReturnScrollTopChange: (value: boolean) => void;

  // Basic Auth (PRIMARY)
  basicAuthUsername: string;
  onBasicAuthUsernameChange: (username: string) => void;
  basicAuthPassword?: string;
  onBasicAuthPasswordChange?: (password: string) => void;

  // Auto reload (PRIMARY)
  autoReload: boolean;
  onAutoReloadChange: (value: boolean) => void;

  // Keyboard Mode (PRIMARY)
  keyboardMode?: string;
  onKeyboardModeChange?: (mode: string) => void;

  // Compatibility props retained to avoid breakage
  dashboardModeEnabled?: boolean;
  onDashboardModeEnabledChange?: (value: boolean) => void;
  externalAppPackage?: string;
  onExternalAppPackageChange?: (pkg: string) => void;
  onPickApp?: () => void;
  loadingApps?: boolean;
  externalAppMode?: 'single' | 'multi';
  onExternalAppModeChange?: (mode: 'single' | 'multi') => void;
  managedApps?: ManagedApp[];
  onManagedAppsChange?: (apps: ManagedApp[]) => void;
  hasOverlayPermission?: boolean;
  onRequestOverlayPermission?: () => void;
  hasUsageStatsPermission?: boolean;
  onRequestUsageStatsPermission?: () => void;
  isDeviceOwner?: boolean;
  pin?: string;
  onPinChange?: (pin: string) => void;
  isPinConfigured?: boolean;
  pinModeChanged?: boolean;
  pinMaxAttemptsText?: string;
  onPinMaxAttemptsChange?: (text: string) => void;
  onPinMaxAttemptsBlur?: () => void;
  pinMode?: 'numeric' | 'alphanumeric';
  onPinModeChange?: (mode: 'numeric' | 'alphanumeric') => void;
  pdfViewerEnabled?: boolean;
  onPdfViewerEnabledChange?: (value: boolean) => void;
  windowPrintEnabled?: boolean;
  onWindowPrintEnabledChange?: (value: boolean) => void;
  printPaperSize?: string;
  onPrintPaperSizeChange?: (value: string) => void;
  silentPrintEnabled?: boolean;
  onSilentPrintEnabledChange?: (value: boolean) => void;
  escPosWidthDots?: number;
  onEscPosWidthDotsChange?: (value: number) => void;
  escPosCut?: boolean;
  onEscPosCutChange?: (value: boolean) => void;
  escPosFeedLines?: number;
  onEscPosFeedLinesChange?: (value: number) => void;
  printOrigins?: string[] | null;
  onPrintOriginsChange?: (value: string[] | null) => void;
  urlRotationEnabled?: boolean;
  onUrlRotationEnabledChange?: (value: boolean) => void;
  urlRotationList?: string[];
  onUrlRotationListChange?: (urls: string[]) => void;
  urlRotationInterval?: string;
  onUrlRotationIntervalChange?: (value: string) => void;
  urlPlannerEnabled?: boolean;
  onUrlPlannerEnabledChange?: (value: boolean) => void;
  urlPlannerEvents?: ScheduledEvent[];
  onUrlPlannerEventsChange?: (events: ScheduledEvent[]) => void;
  onAddRecurringEvent?: () => void;
  onAddOneTimeEvent?: () => void;
  onEditEvent?: (event: ScheduledEvent) => void;
  webViewBackButtonEnabled?: boolean;
  onWebViewBackButtonEnabledChange?: (value: boolean) => void;
  webViewBackButtonXPercent?: string;
  onWebViewBackButtonXPercentChange?: (value: string) => void;
  webViewBackButtonYPercent?: string;
  onWebViewBackButtonYPercentChange?: (value: string) => void;
  onResetWebViewBackButtonPosition?: () => void;
  restartButtonEnabled?: boolean;
  onRestartButtonEnabledChange?: (value: boolean) => void;
  sessionResetButtonEnabled?: boolean;
  onSessionResetButtonEnabledChange?: (value: boolean) => void;
  restartButtonLongPressSeconds?: number;
  onRestartButtonLongPressSecondsChange?: (value: number) => void;
  mediaPlayerItems?: MediaItem[];
  onMediaPlayerItemsChange?: (items: MediaItem[]) => void;
  mediaPlayerAutoPlay?: boolean;
  onMediaPlayerAutoPlayChange?: (value: boolean) => void;
  mediaPlayerLoop?: boolean;
  onMediaPlayerLoopChange?: (value: boolean) => void;
  mediaPlayerShuffle?: boolean;
  onMediaPlayerShuffleChange?: (value: boolean) => void;
  mediaPlayerImageDuration?: string;
  onMediaPlayerImageDurationChange?: (value: string) => void;
  mediaPlayerShowControls?: boolean;
  onMediaPlayerShowControlsChange?: (value: boolean) => void;
  mediaPlayerFitMode?: MediaFitMode;
  onMediaPlayerFitModeChange?: (value: MediaFitMode) => void;
  mediaPlayerBgColor?: string;
  onMediaPlayerBgColorChange?: (value: string) => void;
  mediaPlayerTransition?: boolean;
  onMediaPlayerTransitionChange?: (value: boolean) => void;
  mediaPlayerTransitionDuration?: string;
  onMediaPlayerTransitionDurationChange?: (value: string) => void;
  mediaPlayerMute?: boolean;
  onMediaPlayerMuteChange?: (value: boolean) => void;
  mediaPlayerCache?: boolean;
  onMediaPlayerCacheChange?: (value: boolean) => void;
  mediaPlayerUnattended?: boolean;
  onMediaPlayerUnattendedChange?: (value: boolean) => void;
  mediaPlayerCacheLimitMb?: string;
  onMediaPlayerCacheLimitMbChange?: (value: string) => void;
  customUserAgent?: string;
  onCustomUserAgentChange?: (value: string) => void;
}

const GeneralTab: React.FC<GeneralTabProps> = ({
  url,
  onUrlChange,
  inactivityReturnEnabled,
  onInactivityReturnEnabledChange,
  inactivityReturnDelay,
  onInactivityReturnDelayChange,
  inactivityReturnResetOnNav,
  onInactivityReturnResetOnNavChange,
  inactivityReturnScrollTop,
  onInactivityReturnScrollTopChange,
  basicAuthUsername,
  onBasicAuthUsernameChange,
  basicAuthPassword = '',
  onBasicAuthPasswordChange = () => {},
  autoReload,
  onAutoReloadChange,
  keyboardMode = 'none',
  onKeyboardModeChange = () => {},
}) => {
  return (
    <View style={styles.container}>
      {/* 1. Alamat Situs Web / URL Kiosk */}
      <SettingsSection title="Alamat Situs Kiosk (URL)" icon="link-variant">
        <SettingsInput
          label="URL Halaman Web"
          value={url}
          onChangeText={onUrlChange}
          placeholder="https://absen.smkn2indramayu.sch.id/ScanAll"
          keyboardType="url"
          hint="Alamat web yang akan dimuat secara otomatis saat aplikasi kiosk berjalan."
        />
      </SettingsSection>

      {/* 2. Mode Papan Ketik Virtual */}
      <SettingsSection title="Papan Ketik (Keyboard)" icon="keyboard-outline">
        <SettingsRadioGroup
          hint="Pilih bagaimana keyboard Android merespons saat input web aktif."
          options={[
            {
              value: 'none',
              label: 'Matikan Keyboard Virtual (Scanner Barcode / RFID)',
              hint: 'Keyboard on-screen TIDAK akan muncul saat input aktif. Sangat cocok untuk Barcode & RFID Scanner HID.',
            },
            {
              value: 'default',
              label: 'Bawaan Android (Keyboard Muncul)',
              hint: 'Keyboard virtual Android akan selalu muncul saat kolom input disentuh.',
            },
          ]}
          value={keyboardMode}
          onValueChange={onKeyboardModeChange}
        />
      </SettingsSection>

      {/* 3. Otomatis Kembali ke URL Awal (Inactivity Return) */}
      <SettingsSection title="Otomatis Kembali ke URL Awal" icon="timer-sand">
        <SettingsSwitch
          label="Aktifkan Auto Kembali"
          value={inactivityReturnEnabled}
          onValueChange={onInactivityReturnEnabledChange}
          hint="Jika tablet tidak disentuh dalam beberapa detik, halaman akan otomatis kembali ke URL awal absensi."
        />

        {inactivityReturnEnabled && (
          <View style={styles.subSection}>
            <SettingsInput
              label="Waktu Tunggu (detik)"
              value={inactivityReturnDelay}
              onChangeText={onInactivityReturnDelayChange}
              placeholder="60"
              keyboardType="numeric"
              hint="Jumlah detik tanpa sentuhan sebelum kembali ke URL awal (contoh: 30 atau 60)."
            />

            <View style={styles.rotationSpacer} />
            <SettingsSwitch
              label="Reset ke Halaman Utama"
              value={inactivityReturnResetOnNav}
              onValueChange={onInactivityReturnResetOnNavChange}
              hint="Buka ulang URL awal jika pengguna berpindah halaman."
            />

            <View style={styles.rotationSpacer} />
            <SettingsSwitch
              label="Scroll Otomatis ke Paling Atas"
              value={inactivityReturnScrollTop}
              onValueChange={onInactivityReturnScrollTopChange}
              hint="Gulir halaman kembali ke posisi paling atas saat timeout."
            />
          </View>
        )}
      </SettingsSection>

      {/* 4. Kredensial Awal (HTTP Basic Auth) */}
      <SettingsSection title="Kredensial Awal (Autentikasi Otomatis)" icon="lock-outline">
        <SettingsInput
          label="Username Web (Opsional)"
          value={basicAuthUsername}
          onChangeText={onBasicAuthUsernameChange}
          placeholder="Username (jika diminta login browser)"
          hint="Diisi hanya jika server web Anda meminta login otentikasi browser awal."
          autoCapitalize="none"
        />
        {basicAuthUsername.trim().length > 0 && (
          <View style={{ marginTop: Spacing.sm }}>
            <SettingsInput
              label="Password Web"
              value={basicAuthPassword}
              onChangeText={onBasicAuthPasswordChange}
              placeholder="Password otentikasi"
              secureTextEntry={true}
              hint="Password otentikasi browser awal."
              autoCapitalize="none"
            />
          </View>
        )}
      </SettingsSection>

      {/* 5. Auto Reload */}
      <SettingsSection title="Muat Ulang Otomatis" icon="refresh">
        <SettingsSwitch
          label="Muat Ulang saat Error"
          value={autoReload}
          onValueChange={onAutoReloadChange}
          hint="Jika koneksi internet sempat terputus, aplikasi akan otomatis memuat ulang saat jaringan tersedia."
        />
      </SettingsSection>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: Spacing.xl,
  },
  rotationSpacer: {
    height: Spacing.md,
  },
  subSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
});

export default GeneralTab;
