/**
 * The playlist FreeKiosk Cloud assigns to this screen (digital signage).
 *
 * The heartbeat answer carries `playlist_version`: the version of the playlist this device
 * should play, null when it has none. When that differs from the version applied here, the
 * manifest is downloaded (GET /devices/{id}/playlist/), kept on the device, and the Media
 * Player plays it instead of its own list, from the offline cache like any other list.
 *
 * Everything is additive on the cloud contract:
 *   - an older cloud omits `playlist_version`: nothing here changes, nothing is reported;
 *   - once a cloud has spoken of playlists, the version applied is reported back in the
 *     heartbeat (`system.signage_playlist_version`, empty when there is none), so the
 *     dashboard can say whether the screen is up to date.
 *
 * With schedule rules (days, hours, dates) the manifest carries the whole schedule and the
 * device picks the playlist with its own clock (SignageSchedule.ts), so it changes on time
 * even when it is offline; every playlist of the schedule is kept in the offline cache.
 *
 * A playlist that is assigned puts the device in Media Player mode, remembering the mode it
 * had; removing the playlist puts that mode back (unless it was changed by hand meanwhile).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageService } from './storage';
import type { MediaItem } from '../types/mediaPlayer';
import { activePlaylistId } from './SignageSchedule';
import { ServerClock } from './ServerClock';
import type { Schedule, ScheduleRule } from './SignageSchedule';

const KEY_PLAYLIST = '@kiosk_signage_playlist';
// Absent: the cloud never spoke of playlists. NONE: it did, and there is none. (Not an empty
// string: storage does not always give one back.)
const KEY_VERSION = '@kiosk_signage_version';
const NONE = 'none';
const KEY_PREVIOUS_MODE = '@kiosk_signage_previous_mode';

const MANIFEST_TIMEOUT_MS = 20_000;

export interface ManifestItem {
  id?: unknown;
  kind?: unknown;
  url?: unknown;
  title?: unknown;
  duration_seconds?: unknown;
}

export interface PlaylistManifest {
  version: string | null;
  playlist: { id?: string; name?: string } | null;
  items: ManifestItem[];
  /** Only when the device has schedule rules */
  schedule?: {
    default_playlist?: unknown;
    playlists?: Record<string, { name?: unknown; items?: ManifestItem[] }>;
    rules?: unknown;
  } | null;
}

export interface ActivePlaylist {
  version: string;
  name: string;
  /** What plays now. Empty with a schedule means nothing is due: a blank screen. */
  items: MediaItem[];
  /** Which playlist plays now: changes when the clock moves the schedule on */
  id: string;
  /** True when the cloud gave a schedule (so an empty list is a blank screen on purpose) */
  scheduled: boolean;
  /** Every file of the schedule, to keep in the offline cache (empty without a schedule) */
  prefetch: MediaItem[];
}

interface StoredPlaylist {
  version: string;
  name: string;
  items: MediaItem[];
  schedule?: Schedule<MediaItem[]>;
}

interface Credentials {
  cloudUrl: string;
  deviceId: string;
  apiKey: string;
}

/**
 * The items the player can use. Anything that is not a well formed http(s) video or image
 * is dropped, so one bad entry never stops the rest of the playlist. The item id the cloud
 * gave is kept: it does not change when the item is edited.
 */
export function manifestToItems(items: ManifestItem[] | undefined | null): MediaItem[] {
  const out: MediaItem[] = [];
  for (const raw of Array.isArray(items) ? items : []) {
    if (!raw || typeof raw !== 'object') continue;
    const kind = raw.kind;
    const url = typeof raw.url === 'string' ? raw.url.trim() : '';
    if (kind !== 'video' && kind !== 'image') continue;
    if (!/^https?:\/\/\S+$/i.test(url)) continue;
    const item: MediaItem = {
      id: typeof raw.id === 'string' && raw.id ? raw.id : `signage-${out.length}`,
      url,
      type: kind,
      isLocal: false,
    };
    if (typeof raw.title === 'string' && raw.title) item.title = raw.title;
    // A duration only means something for an image: a video plays to its end
    if (kind === 'image' && typeof raw.duration_seconds === 'number' && raw.duration_seconds > 0) {
      item.duration = Math.round(raw.duration_seconds);
    }
    out.push(item);
  }
  return out;
}

/**
 * The schedule the player can use, with its items validated like any other, or undefined when
 * the manifest has none (or a malformed one: the default playlist then plays alone).
 */
export function parseSchedule(raw: PlaylistManifest['schedule']): Schedule<MediaItem[]> | undefined {
  if (!raw || typeof raw !== 'object' || !raw.playlists || typeof raw.playlists !== 'object') return undefined;
  const playlists: Schedule<MediaItem[]>['playlists'] = {};
  for (const [id, block] of Object.entries(raw.playlists)) {
    if (!block || typeof block !== 'object') continue;
    playlists[id] = { name: typeof block.name === 'string' ? block.name : '', items: manifestToItems(block.items) };
  }
  const rules: ScheduleRule[] = [];
  for (const rule of Array.isArray(raw.rules) ? raw.rules : []) {
    if (!rule || typeof rule !== 'object' || typeof rule.playlist !== 'string' || !Array.isArray(rule.days)) continue;
    rules.push({
      playlist: rule.playlist,
      days: rule.days.filter((d: unknown) => typeof d === 'number'),
      start: typeof rule.start === 'string' ? rule.start : null,
      end: typeof rule.end === 'string' ? rule.end : null,
      from: typeof rule.from === 'string' ? rule.from : null,
      to: typeof rule.to === 'string' ? rule.to : null,
    });
  }
  return {
    default_playlist: typeof raw.default_playlist === 'string' ? raw.default_playlist : null,
    playlists,
    rules,
  };
}

async function fetchManifest(creds: Credentials): Promise<PlaylistManifest | null> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), MANIFEST_TIMEOUT_MS) : null;
  try {
    const response = await fetch(`${creds.cloudUrl}/api/v1/devices/${creds.deviceId}/playlist/`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${creds.apiKey}` },
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!response.ok) return null;
    const body = await response.json();
    if (!body || typeof body !== 'object') return null;
    return body as PlaylistManifest;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const SignagePlaylist = {
  /**
   * The version to report in the heartbeat: the one applied, '' when there is none, and
   * undefined (report nothing) until a cloud has spoken of playlists.
   */
  async getVersionForReport(): Promise<string | undefined> {
    try {
      const value = await AsyncStorage.getItem(KEY_VERSION);
      if (value === null) return undefined;
      return value === NONE ? '' : value;
    } catch {
      return undefined;
    }
  },

  /**
   * The playlist to play instead of the device's own list at `now`, or null when the cloud
   * assigned none. With a schedule the answer depends on the clock: call it again to follow it.
   * `now` is the cloud's time (the device's clock corrected by `ServerClock`) unless given.
   */
  async getActive(at?: Date): Promise<ActivePlaylist | null> {
    try {
      const now = at ?? (await ServerClock.now());
      const raw = await AsyncStorage.getItem(KEY_PLAYLIST);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredPlaylist;
      if (!parsed || typeof parsed.version !== 'string' || !Array.isArray(parsed.items)) return null;
      const name = typeof parsed.name === 'string' ? parsed.name : '';
      const schedule = parsed.schedule;
      if (!schedule || typeof schedule !== 'object' || !schedule.playlists) {
        return { version: parsed.version, name, items: parsed.items, id: 'default', scheduled: false, prefetch: [] };
      }
      const id = activePlaylistId(schedule, now);
      const active = id ? schedule.playlists[id] : null;
      const seen = new Set<string>();
      const prefetch: MediaItem[] = [];
      for (const block of Object.values(schedule.playlists)) {
        for (const item of block.items ?? []) {
          if (!seen.has(item.url)) {
            seen.add(item.url);
            prefetch.push(item);
          }
        }
      }
      return {
        version: parsed.version,
        name: active?.name || name,
        items: active ? active.items : [],
        id: id ?? '',
        scheduled: true,
        prefetch,
      };
    } catch {
      return null;
    }
  },

  /**
   * Bring the device to the version the cloud asked for. Returns true when what the player
   * plays changed (so the screen should reload its settings). A failed download leaves
   * everything as it was and is tried again at the next heartbeat.
   */
  async sync(creds: Credentials, serverVersion: string | null | undefined): Promise<boolean> {
    // An older cloud does not say: leave the device's own playlist alone
    if (serverVersion === undefined) return false;
    try {
      const wanted = serverVersion ?? '';
      const applied = await AsyncStorage.getItem(KEY_VERSION);
      if (applied === (wanted === '' ? NONE : wanted)) return false;

      if (wanted === '') {
        const hadPlaylist = (await AsyncStorage.getItem(KEY_PLAYLIST)) !== null;
        await AsyncStorage.removeItem(KEY_PLAYLIST);
        await AsyncStorage.setItem(KEY_VERSION, NONE);
        if (!hadPlaylist) return false; // first word from the cloud, and it has nothing for us
        await this._restoreMode();
        return true;
      }

      const manifest = await fetchManifest(creds);
      if (!manifest) return false;
      const version = typeof manifest.version === 'string' ? manifest.version : '';
      if (version === '') {
        // Unassigned between the heartbeat and the download
        return this.sync(creds, null);
      }

      const items = manifestToItems(manifest.items);
      const schedule = parseSchedule(manifest.schedule);
      await AsyncStorage.setItem(KEY_PLAYLIST, JSON.stringify({
        version,
        name: manifest.playlist?.name ?? '',
        items,
        ...(schedule ? { schedule } : {}),
      } as StoredPlaylist));
      await AsyncStorage.setItem(KEY_VERSION, version);
      await this._enterPlayerMode();
      return true;
    } catch (error) {
      console.error('[Signage] Could not apply the playlist:', error);
      return false;
    }
  },

  /**
   * Forget everything about the playlist: the one kept, the version applied and the mode it came from.
   * Done when the device leaves the cloud or is enrolled again. Otherwise a screen enrolled again in the same
   * organisation would find its playlist "already applied", and would never go back to the player.
   */
  async clear(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([KEY_PLAYLIST, KEY_VERSION, KEY_PREVIOUS_MODE]);
    } catch {
      // Nothing to forget, or storage that will not say: the next version from the cloud starts over anyway
    }
  },

  async _enterPlayerMode(): Promise<void> {
    const mode = await StorageService.getDisplayMode();
    if (mode === 'media_player') return;
    // Remember where the device came from, once: a second playlist must not overwrite it
    if ((await AsyncStorage.getItem(KEY_PREVIOUS_MODE)) === null) {
      await AsyncStorage.setItem(KEY_PREVIOUS_MODE, mode);
    }
    await StorageService.saveDisplayMode('media_player');
  },

  async _restoreMode(): Promise<void> {
    const previous = await AsyncStorage.getItem(KEY_PREVIOUS_MODE);
    if (previous === null) return;
    await AsyncStorage.removeItem(KEY_PREVIOUS_MODE);
    // Only when the device is still where the playlist put it: a mode chosen by hand since stays
    if ((await StorageService.getDisplayMode()) === 'media_player'
      && (previous === 'webview' || previous === 'external_app')) {
      await StorageService.saveDisplayMode(previous);
    }
  },
};
