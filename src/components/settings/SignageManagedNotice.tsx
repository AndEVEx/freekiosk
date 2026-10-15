/**
 * Above the Media Playlist in Settings: says when the playlist this screen plays comes from
 * FreeKiosk Cloud, since the list below is then not the one that plays. Shown only while a
 * playlist is assigned; nothing for a device that never had one.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../theme';
import { SignagePlaylist } from '../../utils/SignagePlaylist';
import SettingsInfoBox from './SettingsInfoBox';

const SignageManagedNotice: React.FC = () => {
  const { t } = useTranslation();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const active = await SignagePlaylist.getActive();
      if (!cancelled) setName(active ? active.name : null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (name === null) return null;

  return (
    <SettingsInfoBox variant="warning">
      <Text style={styles.text}>{t('general.mediaPlaylist.cloudManaged', { name })}</Text>
    </SettingsInfoBox>
  );
};

const styles = StyleSheet.create({
  text: {
    color: Colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
});

export default SignageManagedNotice;
