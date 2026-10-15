/**
 * The playlist FreeKiosk Cloud assigns to a screen:
 *   - an older cloud (no playlist_version) changes nothing and is told nothing
 *   - a new version is downloaded with the device's key, kept, and played instead of the
 *     device's own list; the same version is not downloaded twice
 *   - assigning a playlist puts the device in Media Player mode and remembers where it came
 *     from; removing it puts that back, unless the mode was changed by hand meanwhile
 *   - a failed download changes nothing and is tried again
 *   - one bad item never costs the rest of the playlist
 */
// A module of its own so the helpers do not collide with another test file's
export {};

const { NativeModules } = require('react-native');
NativeModules.HttpServerModule = {
  executeNativeCommand: jest.fn(),
  captureScreenshotBase64: jest.fn(),
};

const AsyncStorage = require('@react-native-async-storage/async-storage');
const { StorageService } = require('../src/utils/storage');
const { SignagePlaylist, manifestToItems } = require('../src/utils/SignagePlaylist');

const store = AsyncStorage.default ?? AsyncStorage;
const CREDS = { cloudUrl: 'https://cloud.test', deviceId: 'dev-1', apiKey: 'fk_test' };

const manifest = (version: string | null, items: any[] = [], name = 'Menu') => ({
  version,
  playlist: version ? { id: 'p1', name } : null,
  items,
});
const VIDEO = { id: 'i1', kind: 'video', url: 'https://cdn.test/a.mp4', title: '', duration_seconds: null };
const IMAGE = { id: 'i2', kind: 'image', url: 'https://cdn.test/b.png', title: 'Offer', duration_seconds: 8 };

let calls: { url: string; init: any }[];
function serve(responses: Array<any>) {
  calls = [];
  let n = 0;
  (globalThis as any).fetch = jest.fn((url: string, init: any) => {
    calls.push({ url, init });
    const next = responses[Math.min(n++, responses.length - 1)];
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve({ ok: next.ok ?? true, status: next.status ?? 200, json: () => Promise.resolve(next.body) });
  });
}

describe('SignagePlaylist.sync', () => {
  beforeEach(async () => {
    await store.clear();
    calls = [];
    (globalThis as any).fetch = jest.fn();
  });

  it('does nothing for an older cloud, and reports nothing', async () => {
    expect(await SignagePlaylist.sync(CREDS, undefined)).toBe(false);
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
    expect(await SignagePlaylist.getVersionForReport()).toBeUndefined();
    expect(await SignagePlaylist.getActive()).toBeNull();
  });

  it('notes that the cloud has nothing for this screen, without a download or a change', async () => {
    await StorageService.saveDisplayMode('webview');
    expect(await SignagePlaylist.sync(CREDS, null)).toBe(false);
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
    expect(await SignagePlaylist.getVersionForReport()).toBe('');
    expect(await StorageService.getDisplayMode()).toBe('webview');
  });

  it('downloads a new version with the device key and plays it', async () => {
    serve([{ body: manifest('p1:1', [VIDEO, IMAGE]) }]);
    expect(await SignagePlaylist.sync(CREDS, 'p1:1')).toBe(true);

    expect(calls[0].url).toBe('https://cloud.test/api/v1/devices/dev-1/playlist/');
    expect(calls[0].init.headers.Authorization).toBe('Bearer fk_test');
    const active = await SignagePlaylist.getActive();
    expect(active.version).toBe('p1:1');
    expect(active.name).toBe('Menu');
    expect(active.items).toEqual([
      { id: 'i1', url: 'https://cdn.test/a.mp4', type: 'video', isLocal: false },
      { id: 'i2', url: 'https://cdn.test/b.png', type: 'image', isLocal: false, title: 'Offer', duration: 8 },
    ]);
    expect(await SignagePlaylist.getVersionForReport()).toBe('p1:1');
  });

  it('does not download the same version twice', async () => {
    serve([{ body: manifest('p1:1', [VIDEO]) }]);
    await SignagePlaylist.sync(CREDS, 'p1:1');
    expect(await SignagePlaylist.sync(CREDS, 'p1:1')).toBe(false);
    expect(calls.length).toBe(1);
  });

  it('downloads again when the version moves', async () => {
    serve([{ body: manifest('p1:1', [VIDEO]) }, { body: manifest('p1:2', [VIDEO, IMAGE]) }]);
    await SignagePlaylist.sync(CREDS, 'p1:1');
    expect(await SignagePlaylist.sync(CREDS, 'p1:2')).toBe(true);
    expect((await SignagePlaylist.getActive()).items.length).toBe(2);
    expect(await SignagePlaylist.getVersionForReport()).toBe('p1:2');
  });

  it('puts the device in Media Player mode and remembers where it came from', async () => {
    await StorageService.saveDisplayMode('webview');
    serve([{ body: manifest('p1:1', [VIDEO]) }, { body: manifest('p2:1', [IMAGE]) }]);
    await SignagePlaylist.sync(CREDS, 'p1:1');
    expect(await StorageService.getDisplayMode()).toBe('media_player');
    // A second playlist must not overwrite the mode remembered
    await SignagePlaylist.sync(CREDS, 'p2:1');
    await SignagePlaylist.sync(CREDS, null);
    expect(await StorageService.getDisplayMode()).toBe('webview');
  });

  it('puts the previous mode back when the playlist is removed, and forgets the playlist', async () => {
    await StorageService.saveDisplayMode('external_app');
    serve([{ body: manifest('p1:1', [VIDEO]) }]);
    await SignagePlaylist.sync(CREDS, 'p1:1');
    expect(await SignagePlaylist.sync(CREDS, null)).toBe(true);
    expect(await StorageService.getDisplayMode()).toBe('external_app');
    expect(await SignagePlaylist.getActive()).toBeNull();
    expect(await SignagePlaylist.getVersionForReport()).toBe('');
  });

  it('keeps a mode chosen by hand after the playlist went in', async () => {
    await StorageService.saveDisplayMode('webview');
    serve([{ body: manifest('p1:1', [VIDEO]) }]);
    await SignagePlaylist.sync(CREDS, 'p1:1');
    await StorageService.saveDisplayMode('external_app'); // changed by hand
    await SignagePlaylist.sync(CREDS, null);
    expect(await StorageService.getDisplayMode()).toBe('external_app');
  });

  it('leaves a device that was already a media player as it was', async () => {
    await StorageService.saveDisplayMode('media_player');
    serve([{ body: manifest('p1:1', [VIDEO]) }]);
    await SignagePlaylist.sync(CREDS, 'p1:1');
    await SignagePlaylist.sync(CREDS, null);
    expect(await StorageService.getDisplayMode()).toBe('media_player');
  });

  it('changes nothing when the download fails, and tries again next time', async () => {
    await StorageService.saveDisplayMode('webview');
    for (const failure of [{ ok: false, status: 500, body: {} }, new Error('offline'), { body: null }]) {
      serve([failure]);
      expect(await SignagePlaylist.sync(CREDS, 'p1:1')).toBe(false);
      expect(await SignagePlaylist.getActive()).toBeNull();
      expect(await SignagePlaylist.getVersionForReport()).toBeUndefined();
      expect(await StorageService.getDisplayMode()).toBe('webview');
    }
    serve([{ body: manifest('p1:1', [VIDEO]) }]);
    expect(await SignagePlaylist.sync(CREDS, 'p1:1')).toBe(true);
  });

  it('keeps the old playlist when a newer one cannot be downloaded', async () => {
    serve([{ body: manifest('p1:1', [VIDEO]) }]);
    await SignagePlaylist.sync(CREDS, 'p1:1');
    serve([new Error('offline')]);
    expect(await SignagePlaylist.sync(CREDS, 'p1:2')).toBe(false);
    expect((await SignagePlaylist.getActive()).version).toBe('p1:1');
    expect(await SignagePlaylist.getVersionForReport()).toBe('p1:1');
  });

  it('follows the manifest when the playlist was unassigned between the heartbeat and the download', async () => {
    await StorageService.saveDisplayMode('webview');
    serve([{ body: manifest('p1:1', [VIDEO]) }, { body: manifest(null) }]);
    await SignagePlaylist.sync(CREDS, 'p1:1');
    expect(await SignagePlaylist.sync(CREDS, 'p1:2')).toBe(true);
    expect(await SignagePlaylist.getActive()).toBeNull();
    expect(await StorageService.getDisplayMode()).toBe('webview');
  });

  it('plays an empty playlist (assigned, nothing in it yet)', async () => {
    serve([{ body: manifest('p1:1', []) }]);
    expect(await SignagePlaylist.sync(CREDS, 'p1:1')).toBe(true);
    expect((await SignagePlaylist.getActive()).items).toEqual([]);
  });
});

describe('manifestToItems', () => {
  it('keeps the ids the cloud gave, in order', () => {
    const items = manifestToItems([VIDEO, IMAGE]);
    expect(items.map((i: any) => i.id)).toEqual(['i1', 'i2']);
  });

  it('gives a duration to an image only', () => {
    const [video, image] = manifestToItems([{ ...VIDEO, duration_seconds: 30 }, IMAGE]);
    expect(video.duration).toBeUndefined();
    expect(image.duration).toBe(8);
  });

  it('drops what the player cannot use and keeps the rest', () => {
    const items = manifestToItems([
      { id: 'a', kind: 'video', url: 'javascript:alert(1)' },
      { id: 'b', kind: 'video', url: 'file:///etc/passwd' },
      { id: 'c', kind: 'audio', url: 'https://cdn.test/c.mp3' },
      { id: 'd', kind: 'image', url: '' },
      { id: 'e', kind: 'image' },
      null,
      'oops',
      { id: 'f', kind: 'image', url: 'https://cdn.test/f.png', duration_seconds: -5 },
      { kind: 'video', url: 'https://cdn.test/g.mp4' },
    ]);
    expect(items.map((i: any) => i.url)).toEqual(['https://cdn.test/f.png', 'https://cdn.test/g.mp4']);
    expect(items[0].duration).toBeUndefined();
    expect(items[1].id).toBe('signage-1'); // no id given: a stable fallback by position
  });

  it('copes with a missing or malformed list', () => {
    expect(manifestToItems(undefined)).toEqual([]);
    expect(manifestToItems(null)).toEqual([]);
    expect(manifestToItems('nope' as any)).toEqual([]);
  });
});
