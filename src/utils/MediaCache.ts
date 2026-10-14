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

interface MediaCacheModuleType {
  /** What is on the device already. No network. */
  getCached(urls: string[]): Promise<MediaCacheMap>;
  /** Downloads what is missing or changed, deletes what is no longer wanted. */
  sync(urls: string[]): Promise<MediaCacheMap>;
  getStats(): Promise<{ files: number; bytes: number }>;
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
