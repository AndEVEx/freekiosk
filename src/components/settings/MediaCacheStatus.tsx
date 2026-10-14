/**
 * What the offline cache of the Media Player holds, and a button to empty it.
 * Shown under the cache switch, so an admin can see that it works and how much it takes.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, Typography } from '../../theme';
import MediaCacheModule, { formatBytes } from '../../utils/MediaCache';
import type { MediaCacheStats } from '../../utils/MediaCache';

const MediaCacheStatus: React.FC = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<MediaCacheStats | null>(null);
  const [clearing, setClearing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStats((await MediaCacheModule?.getStats()) ?? null);
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!MediaCacheModule) return null;

  const empty = !stats || (stats.files === 0 && stats.partialBytes === 0);

  let text = t('general.playback.cacheEmpty');
  if (stats && !empty) {
    text = stats.partialBytes > 0
      ? t('general.playback.cacheStatsPartial', {
          files: stats.files,
          size: formatBytes(stats.bytes),
          partial: formatBytes(stats.partialBytes),
        })
      : t('general.playback.cacheStats', { files: stats.files, size: formatBytes(stats.bytes) });
  }

  const clear = async () => {
    setClearing(true);
    try {
      await MediaCacheModule?.clear();
    } catch {
      // Nothing to do: the status below shows what is still there
    }
    setClearing(false);
    await refresh();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.text} testID="media-cache-stats">{text}</Text>
      <TouchableOpacity
        style={[styles.button, (empty || clearing) && styles.buttonDisabled]}
        onPress={clear}
        disabled={empty || clearing}
        testID="media-cache-clear"
      >
        <Text style={styles.buttonText}>{t('general.playback.cacheClear')}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  text: {
    ...Typography.hint,
    marginBottom: Spacing.sm,
  },
  button: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    ...Typography.label,
    color: Colors.textSecondary,
  },
});

export default MediaCacheStatus;
