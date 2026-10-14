/**
 * Under "Launch on Boot" on a TV without Device Owner: whether Android will let FreeKiosk start
 * at boot. Without "display over other apps" it blocks the start (checked on the Android TV
 * emulator: after a reboot the TV home screen stays, nothing runs), which on a screen that
 * plays media means nothing plays after a power cut. The TV settings have no screen to grant
 * it from, so the command is shown instead.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing } from '../../theme';
import OverlayPermissionModule from '../../utils/OverlayPermissionModule';
import SettingsInfoBox from './SettingsInfoBox';

export const OVERLAY_GRANT_COMMAND = 'adb shell appops set com.freekiosk SYSTEM_ALERT_WINDOW allow';

const TvBootPermissionNotice: React.FC = () => {
  const { t } = useTranslation();
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const value = await OverlayPermissionModule?.canDrawOverlays();
        if (!cancelled) setGranted(typeof value === 'boolean' ? value : null);
      } catch {
        // Cannot tell: say nothing rather than something wrong
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (granted === null) return null;

  if (granted) {
    return (
      <SettingsInfoBox variant="success">
        <Text style={styles.text}>{t('security.autoLaunch.tvBootGranted')}</Text>
      </SettingsInfoBox>
    );
  }

  return (
    <SettingsInfoBox variant="warning">
      <Text style={styles.text}>{t('security.autoLaunch.tvBootBlocked')}</Text>
      <Text selectable style={styles.command}>{OVERLAY_GRANT_COMMAND}</Text>
    </SettingsInfoBox>
  );
};

const styles = StyleSheet.create({
  text: {
    color: Colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  command: {
    color: Colors.textPrimary,
    fontFamily: 'monospace',
    fontSize: 13,
    marginTop: Spacing.sm,
  },
});

export default TvBootPermissionNotice;
