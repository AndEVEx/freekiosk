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
 * A playlist that is assigned puts the device in Media Player mode, remembering the mode it
 * had; removing the playlist puts that mode back (unless it was changed by hand meanwhile).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageService } from './storage';
import type { MediaItem } from '../types/mediaPlayer';

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
}

export interface ActivePlaylist {
  version: string;
  name: string;
  items: MediaItem[];
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

  /** The playlist to play instead of the device's own list, or null. */
  async getActive(): Promise<ActivePlaylist | null> {
    try {
      const raw = await AsyncStorage.getItem(KEY_PLAYLIST);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.version !== 'string' || !Array.isArray(parsed.items)) return null;
      return { version: parsed.version, name: typeof parsed.name === 'string' ? parsed.name : '', items: parsed.items };
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
      await AsyncStorage.setItem(KEY_PLAYLIST, JSON.stringify({
        version,
        name: manifest.playlist?.name ?? '',
        items,
      }));
      await AsyncStorage.setItem(KEY_VERSION, version);
      await this._enterPlayerMode();
      return true;
    } catch (error) {
      console.error('[Signage] Could not apply the playlist:', error);
      return false;
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
