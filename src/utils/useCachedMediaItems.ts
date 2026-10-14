import { useEffect, useMemo, useRef, useState } from 'react';
import type { MediaItem } from '../types/mediaPlayer';
import MediaCacheModule, {
  DEFAULT_MEDIA_CACHE_LIMIT_MB,
  collectCacheableUrls,
  sameCacheMap,
  withCachedUrls,
  type MediaCacheMap,
} from './MediaCache';
import { buildReport, disabledReport, errorCode, getMediaCacheReport, setMediaCacheReport } from './MediaCacheReport';

/** How often the files are checked against the server (a changed file is downloaded again) */
export const MEDIA_CACHE_RECHECK_MS = 10 * 60 * 1000;

/**
 * The playlist the Media Player should play, and whether it is ready to start.
 *
 * With the cache off this is the playlist as it is, ready at once: nothing changes for a
 * device that does not use it.
 *
 * With the cache on:
 *  1. what is on the device already is looked up first (no network), so a device that
 *     starts offline plays straight away instead of waiting for a network timeout;
 *  2. then the files are brought up to date in the background, and re-checked every 10
 *     minutes;
 *  3. the playlist is replaced only when a file actually changed, because the player
 *     restarts from the first item whenever it is handed a new playlist.
 * A check that fails (offline) leaves the files that are there.
 */
export function useCachedMediaItems(
  items: MediaItem[],
  enabled: boolean,
  limitMb: number = DEFAULT_MEDIA_CACHE_LIMIT_MB,
): { items: MediaItem[]; ready: boolean } {
  const [cached, setCached] = useState<MediaCacheMap>({});
  const [ready, setReady] = useState<boolean>(!enabled);
  const cachedRef = useRef<MediaCacheMap>({});

  // A new list of URLs, not a new array with the same URLs, is what restarts the work
  const urlsKey = JSON.stringify(collectCacheableUrls(items));

  useEffect(() => {
    if (!enabled || !MediaCacheModule) {
      cachedRef.current = {};
      setCached({});
      setReady(true);
      // A cache that was on has numbers to retract at the cloud, whether it was switched off
      // just now or before the app restarted (then only the files on the device say so).
      // A device that never used it has neither, and reports nothing.
      if (getMediaCacheReport()) {
        setMediaCacheReport(disabledReport());
      } else if (MediaCacheModule?.getStats) {
        let cancelledStats = false;
        MediaCacheModule.getStats()
          .then(stats => {
            if (!cancelledStats && (stats.files > 0 || stats.partialBytes > 0)) {
              setMediaCacheReport(disabledReport());
            }
          })
          .catch(() => {});
        return () => {
          cancelledStats = true;
        };
      }
      return;
    }
    const cache = MediaCacheModule;
    const urls: string[] = JSON.parse(urlsKey);
    const limitBytes = Math.max(1, limitMb) * 1024 * 1024;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setReady(false);

    const apply = (map: MediaCacheMap) => {
      if (cancelled || sameCacheMap(map, cachedRef.current)) return;
      cachedRef.current = map;
      setCached(map);
    };

    // For the cloud: what is on the device, and how the last check went. Never allowed to
    // disturb playback, so every failure here is swallowed.
    const report = async (map: MediaCacheMap, checkedAt: Date | null, error: string | null) => {
      let stats = null;
      try {
        stats = (await cache.getStats?.()) ?? null;
      } catch {
        // The numbers are missing, the rest is still worth sending
      }
      if (!cancelled) setMediaCacheReport(buildReport(urls, map, stats, checkedAt, error));
    };

    const syncOnce = async () => {
      let error: string | null = null;
      try {
        apply(await cache.sync(urls, limitBytes));
      } catch (e) {
        // Offline or the check failed: what is on the device stays
        error = errorCode(e);
      }
      await report(cachedRef.current, new Date(), error);
      if (!cancelled) timer = setTimeout(syncOnce, MEDIA_CACHE_RECHECK_MS);
    };

    (async () => {
      try {
        apply(await cache.getCached(urls));
      } catch {
        // Nothing usable on the device: the items play from their URL
      }
      if (cancelled) return;
      setReady(true);
      await report(cachedRef.current, null, null);
      syncOnce();
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, urlsKey, limitMb]);

  const playable = useMemo(
    () => (enabled ? withCachedUrls(items, cached) : items),
    [items, cached, enabled],
  );
  return { items: playable, ready };
}
