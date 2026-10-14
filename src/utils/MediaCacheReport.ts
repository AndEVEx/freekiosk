/**
 * What the device tells FreeKiosk Cloud about its offline media cache, in the heartbeat
 * (`system.media_cache`). The Media Player's hook fills it in after each check; the heartbeat
 * reads it. Nothing is reported until the cache has been on at least once, so a device that
 * never uses it sends exactly what it always sent.
 */
import type { MediaCacheMap, MediaCacheStats } from './MediaCache';

export interface MediaCacheReport {
  enabled: boolean;
  /** Files the playlist needs (http/https URLs, each once) */
  wanted: number;
  /** Of those, how many are on the device */
  cached: number;
  /** Size of the finished files, and of the downloads that were cut and will resume */
  bytes: number;
  partial_bytes: number;
  /** ISO time of the last check against the server, null before the first one */
  last_check_at: string | null;
  /** A code, never a URL or a message (a URL can carry a token); null when the last check worked */
  error: string | null;
}

let current: MediaCacheReport | undefined;

export function setMediaCacheReport(report: MediaCacheReport | undefined): void {
  current = report;
}

export function getMediaCacheReport(): MediaCacheReport | undefined {
  return current;
}

/** The report for a cache that is switched off, sent once so the cloud stops showing old numbers. */
export function disabledReport(): MediaCacheReport {
  return { enabled: false, wanted: 0, cached: 0, bytes: 0, partial_bytes: 0, last_check_at: null, error: null };
}

export function buildReport(
  urls: string[],
  map: MediaCacheMap,
  stats: MediaCacheStats | null,
  checkedAt: Date | null,
  error: string | null,
): MediaCacheReport {
  return {
    enabled: true,
    wanted: urls.length,
    cached: urls.filter(url => !!map[url]).length,
    bytes: stats ? Math.max(0, Math.round(stats.bytes)) : 0,
    partial_bytes: stats ? Math.max(0, Math.round(stats.partialBytes)) : 0,
    last_check_at: checkedAt ? checkedAt.toISOString() : null,
    error,
  };
}

/** A short code for a failed check: the native module's own code, or a generic one. */
export function errorCode(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z0-9_]{1,40}$/.test(code) ? code : 'SYNC_FAILED';
}
