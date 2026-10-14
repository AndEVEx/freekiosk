/**
 * Offline cache of the Media Player (see MediaCacheModule.kt).
 *
 * The functions here are plain and take no side effect, so the rules (which items are
 * cached, which URL the player is given) can be tested without a device.
 */

import { NativeModules, Platform } from 'react-native';
import type { MediaItem } from '../types/mediaPlayer';

/** Local file URI of each URL, or null when the file is not on the device. */
export type MediaCacheMap = Record<string, string | null>;

/** What is on the device: finished files, and bytes of downloads that were cut and will resume. */
export interface MediaCacheStats {
  files: number;
  bytes: number;
  partialBytes: number;
}

interface MediaCacheModuleType {
  /** What is on the device already. No network. */
  getCached(urls: string[]): Promise<MediaCacheMap>;
  /** Downloads what is missing or changed, deletes what is no longer wanted. */
  sync(urls: string[], limitBytes: number): Promise<MediaCacheMap>;
  getStats(): Promise<MediaCacheStats>;
  clear(): Promise<boolean>;
}

const MediaCacheModule: MediaCacheModuleType | undefined = NativeModules.MediaCacheModule;

export default MediaCacheModule;

/**
 * The URLs to keep on the device: the http(s) items, each once, in playlist order.
 * Items picked from the device's own storage are already local, and anything that is not
 * http(s) (data:, file:) has nothing to download.
 */
export function collectCacheableUrls(items: MediaItem[]): string[] {
  const urls: string[] = [];
  for (const item of items ?? []) {
    if (item.isLocal) continue;
    if (!/^https?:\/\//i.test(item.url ?? '')) continue;
    if (!urls.includes(item.url)) urls.push(item.url);
  }
  return urls;
}

/**
 * The playlist the player is given: each cached item points at its local file, every other
 * item is left alone and keeps playing from its URL.
 */
export function withCachedUrls(items: MediaItem[], cached: MediaCacheMap): MediaItem[] {
  return (items ?? []).map(item => {
    const local = item.isLocal ? null : cached[item.url];
    return local ? { ...item, url: local } : item;
  });
}

/** True when both maps give the same file for every URL (so the player need not restart). */
export function sameCacheMap(a: MediaCacheMap, b: MediaCacheMap): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if ((a[key] ?? null) !== (b[key] ?? null)) return false;
  }
  return true;
}

/**
 * Whether the cache is on when nobody chose. On for a TV, where a playlist that stops with the
 * network is a screen left blank in a shop; off everywhere else, so a tablet or a phone plays
 * from the URL exactly as it always did.
 */
export function defaultMediaCacheEnabled(): boolean {
  return Platform.isTV === true;
}

/**
 * Unattended playback: nobody is there to read an error or to touch a frozen screen, so the
 * player shows no error text and skips an item that does not load or freezes. On by default
 * on a TV (a screen on a wall), off everywhere else, so a tablet plays exactly as before.
 */
export function defaultMediaUnattended(): boolean {
  return Platform.isTV === true;
}

/** Largest the cache may grow, in megabytes, when nobody set a limit. */
export const DEFAULT_MEDIA_CACHE_LIMIT_MB = 2048;

/** 1536 -> "1.5 GB", 788493 -> "770 KB": what the settings show for a size. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = value >= 100 || unit === 0 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, '');
  return `${text} ${units[unit]}`;
}
