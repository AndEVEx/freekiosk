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
const { SignagePlaylist, manifestToItems, parseSchedule } = require('../src/utils/SignagePlaylist');

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

  it('forgets the playlist, its version and the mode it came from when cleared', async () => {
    await StorageService.saveDisplayMode('webview');
    serve([{ body: manifest('p1:1', [VIDEO]) }]);
    await SignagePlaylist.sync(CREDS, 'p1:1');
    expect(await SignagePlaylist.getVersionForReport()).toBe('p1:1');

    await SignagePlaylist.clear();

    expect(await SignagePlaylist.getActive()).toBeNull();
    expect(await SignagePlaylist.getVersionForReport()).toBeUndefined();
    expect(await store.getItem('@kiosk_signage_previous_mode')).toBeNull();
  });

  it('plays again a playlist of the same version after the device left the cloud and came back', async () => {
    await StorageService.saveDisplayMode('webview');
    serve([{ body: manifest('p1:1', [VIDEO]) }, { body: manifest('p1:1', [VIDEO]) }]);
    await SignagePlaylist.sync(CREDS, 'p1:1');
    expect(await StorageService.getDisplayMode()).toBe('media_player');

    // Leaving the cloud resets the settings (the mode goes back to the default) and clears the playlist
    await StorageService.saveDisplayMode('webview');
    await SignagePlaylist.clear();

    expect(await SignagePlaylist.sync(CREDS, 'p1:1')).toBe(true); // not "already applied"
    expect(await StorageService.getDisplayMode()).toBe('media_player');
    expect((await SignagePlaylist.getActive()).items.length).toBe(1);
  });

  it('without a clear, the same version is taken for applied and the screen stays where it is (why clear exists)', async () => {
    await StorageService.saveDisplayMode('webview');
    serve([{ body: manifest('p1:1', [VIDEO]) }]);
    await SignagePlaylist.sync(CREDS, 'p1:1');
    await StorageService.saveDisplayMode('webview');
    expect(await SignagePlaylist.sync(CREDS, 'p1:1')).toBe(false);
    expect(await StorageService.getDisplayMode()).toBe('webview');
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

describe('a schedule with web pages and YouTube videos', () => {
  it('reads them in the playlists of the schedule', () => {
    const schedule = parseSchedule({
      default_playlist: 'menu',
      playlists: {
        menu: { name: 'Menu', items: [{ id: 'w', kind: 'web', url: 'https://example.com/a', duration_seconds: 15 }] },
        promo: { name: 'Promo', items: [{ id: 'y', kind: 'youtube', video_id: 'dQw4w9WgXcQ', url: 'https://cloud.test/player/youtube/?v=dQw4w9WgXcQ' }, { id: 'x', kind: 'youtube', video_id: 'bad' }] },
      },
      rules: [{ playlist: 'promo', days: [1], start: '10:00', end: '11:00', from: null, to: null }],
    } as any);
    expect(schedule?.playlists.menu.items.map((i: any) => [i.type, i.duration])).toEqual([['web', 15]]);
    expect(schedule?.playlists.promo.items.map((i: any) => i.type)).toEqual(['youtube']);
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

  describe('a web page', () => {
    const PAGE = { id: 'w1', kind: 'web', url: 'https://example.com/menu', title: 'Menu', duration_seconds: 20 };

    it('is kept, with its address and its duration', () => {
      const [page] = manifestToItems([PAGE]);
      expect(page).toMatchObject({ id: 'w1', type: 'web', url: 'https://example.com/menu', duration: 20, title: 'Menu' });
    });

    it('always has a duration: 30 seconds when the cloud gives none or a bad one', () => {
      for (const duration_seconds of [undefined, null, 0, -3, 'ten']) {
        const [page] = manifestToItems([{ ...PAGE, duration_seconds }]);
        expect(page.duration).toBe(30);
      }
    });

    it('keeps its duration between 5 seconds and an hour', () => {
      expect(manifestToItems([{ ...PAGE, duration_seconds: 1 }])[0].duration).toBe(5);
      expect(manifestToItems([{ ...PAGE, duration_seconds: 99999 }])[0].duration).toBe(3600);
    });

    it('is dropped when its address is not http or https, the rest keeps playing', () => {
      const items = manifestToItems([
        { ...PAGE, id: 'a', url: 'javascript:alert(1)' },
        { ...PAGE, id: 'b', url: 'file:///data/data/com.freekiosk/databases' },
        { ...PAGE, id: 'c', url: 'data:text/html,<script>1</script>' },
        { ...PAGE, id: 'd', url: '' },
        { ...PAGE, id: 'e' },
      ]);
      expect(items.map((i: any) => i.id)).toEqual(['e']);
    });
  });

  describe('a YouTube video', () => {
    const VIDEO_ID = 'dQw4w9WgXcQ';
    const PLAYER = `https://cloud.test/player/youtube/?v=${VIDEO_ID}`;
    const YT = { id: 'y1', kind: 'youtube', video_id: VIDEO_ID, url: PLAYER, title: 'Promo' };

    it('is kept by its id, played by the cloud page that was given', () => {
      const [yt] = manifestToItems([YT]);
      expect(yt).toMatchObject({ id: 'y1', type: 'youtube', videoId: VIDEO_ID, title: 'Promo', url: PLAYER });
    });

    it('plays to its end unless the cloud gives a cap, kept at most an hour', () => {
      expect(manifestToItems([YT])[0].duration).toBeUndefined();
      expect(manifestToItems([{ ...YT, duration_seconds: 45 }])[0].duration).toBe(45);
      expect(manifestToItems([{ ...YT, duration_seconds: 999999 }])[0].duration).toBe(3600);
      expect(manifestToItems([{ ...YT, duration_seconds: -1 }])[0].duration).toBeUndefined();
    });

    it('is dropped unless the id is exactly eleven letters, digits, - and _', () => {
      const items = manifestToItems([
        ...['short', 'dQw4w9WgXcQ1', 'dQw4w9WgX"Q', '../../evil.', `https://youtu.be/${VIDEO_ID}`, 123, undefined].map(
          (video_id, i) => ({ ...YT, id: `bad${i}`, video_id, url: `https://cloud.test/player/youtube/?v=${video_id}` })),
        { ...YT, id: 'good', video_id: 'a-b_c-d_e-f', url: 'https://cloud.test/player/youtube/?v=a-b_c-d_e-f' },
      ]);
      expect(items.map((i: any) => i.id)).toEqual(['good']);
    });

    it('is dropped unless its address is the cloud page of that very video', () => {
      const items = manifestToItems([
        { ...YT, id: 'a', url: undefined },
        { ...YT, id: 'b', url: `https://www.youtube.com/watch?v=${VIDEO_ID}` },
        { ...YT, id: 'c', url: `https://www.youtube.com/embed/${VIDEO_ID}` },
        { ...YT, id: 'd', url: 'https://cloud.test/player/youtube/?v=AAAAAAAAAAA' },
        { ...YT, id: 'e', url: `https://cloud.test/other/?v=${VIDEO_ID}` },
        { ...YT, id: 'f', url: `javascript:alert(1)//player/youtube/?v=${VIDEO_ID}` },
        { ...YT, id: 'g', url: `file:///player/youtube/?v=${VIDEO_ID}` },
        { ...YT, id: 'h', url: `https://cloud.test/player/youtube/?v=${VIDEO_ID}#x` },
        { ...YT, id: 'ok1', url: `http://10.0.2.2:8000/player/youtube/?v=${VIDEO_ID}` },
        { ...YT, id: 'ok2', url: `https://cloud.test/player/youtube/?x=1&v=${VIDEO_ID}&y=2` },
      ]);
      expect(items.map((i: any) => i.id)).toEqual(['ok1', 'ok2']);
    });
  });

  it('copes with a missing or malformed list', () => {
    expect(manifestToItems(undefined)).toEqual([]);
    expect(manifestToItems(null)).toEqual([]);
    expect(manifestToItems('nope' as any)).toEqual([]);
  });
});

// 2026-11-02 is a Monday
const at = (day: number, hour = 0, minute = 0) => new Date(2026, 10, day, hour, minute);
const LUNCH_ITEM = { id: 'l1', kind: 'image', url: 'https://cdn.test/lunch.png', title: 'Lunch', duration_seconds: 6 };
const scheduled = (overrides: any = {}) => ({
  version: 's:abc',
  playlist: { id: 'menu', name: 'Menu' },
  items: [VIDEO],
  schedule: {
    default_playlist: 'menu',
    playlists: {
      menu: { name: 'Menu', items: [VIDEO] },
      lunch: { name: 'Lunch', items: [LUNCH_ITEM, VIDEO] },
    },
    rules: [{ playlist: 'lunch', days: [1, 2, 3, 4, 5], start: '11:00', end: '14:00', from: null, to: null, priority: 2 }],
  },
  ...overrides,
});

describe('a schedule from the cloud', () => {
  beforeEach(async () => {
    await store.clear();
    (globalThis as any).fetch = jest.fn();
  });

  it('plays the playlist the clock asks for, and follows it as the day goes by', async () => {
    serve([{ body: scheduled() }]);
    await SignagePlaylist.sync(CREDS, 's:abc');

    const morning = await SignagePlaylist.getActive(at(2, 9, 0));
    expect(morning.id).toBe('menu');
    expect(morning.items.map((i: any) => i.id)).toEqual(['i1']);
    expect(morning.scheduled).toBe(true);

    const noon = await SignagePlaylist.getActive(at(2, 12, 0));
    expect(noon.id).toBe('lunch');
    expect(noon.name).toBe('Lunch');
    expect(noon.items.map((i: any) => i.id)).toEqual(['l1', 'i1']);
    expect(noon.items[0].duration).toBe(6);

    expect((await SignagePlaylist.getActive(at(2, 15, 0))).id).toBe('menu');
    expect((await SignagePlaylist.getActive(at(7, 12, 0))).id).toBe('menu'); // Saturday: no rule
  });

  it('is a blank screen, on purpose, when nothing is due and there is no default', async () => {
    const body = scheduled();
    body.schedule.default_playlist = null;
    serve([{ body }]);
    await SignagePlaylist.sync(CREDS, 's:abc');
    const idle = await SignagePlaylist.getActive(at(2, 9, 0));
    expect(idle.items).toEqual([]);
    expect(idle.id).toBe('');
    expect(idle.scheduled).toBe(true); // not "no cloud playlist": the player stays blank
  });

  it('lists every file of the schedule once, to keep them all in the cache', async () => {
    serve([{ body: scheduled() }]);
    await SignagePlaylist.sync(CREDS, 's:abc');
    const active = await SignagePlaylist.getActive(at(2, 9, 0));
    expect(active.prefetch.map((i: any) => i.url).sort()).toEqual(
      ['https://cdn.test/a.mp4', 'https://cdn.test/lunch.png'].sort(),
    );
  });

  it('keeps working offline: the schedule is on the device and the clock does the rest', async () => {
    serve([{ body: scheduled() }]);
    await SignagePlaylist.sync(CREDS, 's:abc');
    (globalThis as any).fetch = jest.fn(() => Promise.reject(new Error('offline')));
    expect((await SignagePlaylist.getActive(at(3, 11, 30))).id).toBe('lunch');
    expect((await SignagePlaylist.getActive(at(3, 14, 0))).id).toBe('menu');
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  it('puts the device in Media Player mode like a plain playlist', async () => {
    await StorageService.saveDisplayMode('webview');
    serve([{ body: scheduled() }]);
    await SignagePlaylist.sync(CREDS, 's:abc');
    expect(await StorageService.getDisplayMode()).toBe('media_player');
    await SignagePlaylist.sync(CREDS, null);
    expect(await StorageService.getDisplayMode()).toBe('webview');
  });

  it('is not a schedule when the manifest has none: the playlist plays whatever the time', async () => {
    serve([{ body: manifest('p1:1', [VIDEO]) }]);
    await SignagePlaylist.sync(CREDS, 'p1:1');
    const active = await SignagePlaylist.getActive(at(2, 12, 0));
    expect(active.scheduled).toBe(false);
    expect(active.prefetch).toEqual([]);
    expect(active.items.length).toBe(1);
  });

  it('plays the default alone when the schedule is not well formed', async () => {
    serve([{ body: scheduled({ schedule: 'garbage' }) }]);
    await SignagePlaylist.sync(CREDS, 's:abc');
    const active = await SignagePlaylist.getActive(at(2, 12, 0));
    expect(active.scheduled).toBe(false);
    expect(active.items.map((i: any) => i.id)).toEqual(['i1']);
  });
});

describe('parseSchedule', () => {
  it('drops what is not usable and keeps the rest', () => {
    const parsed = parseSchedule({
      default_playlist: 'menu',
      playlists: {
        menu: { name: 'Menu', items: [VIDEO, { id: 'x', kind: 'video', url: 'javascript:alert(1)' }] },
        broken: null as any,
      },
      rules: [
        { playlist: 'menu', days: [1, 'x', 3], start: '09:00', end: '10:00', from: null, to: null },
        { playlist: 5, days: [1] },
        { playlist: 'menu' },
        null,
      ],
    });
    expect(Object.keys(parsed.playlists)).toEqual(['menu']);
    expect(parsed.playlists.menu.items.length).toBe(1); // the unsafe address is gone
    expect(parsed.rules).toEqual([
      { playlist: 'menu', days: [1, 3], start: '09:00', end: '10:00', from: null, to: null },
    ]);
  });

  it('returns nothing for what is not a schedule', () => {
    expect(parseSchedule(undefined)).toBeUndefined();
    expect(parseSchedule(null)).toBeUndefined();
    expect(parseSchedule('x' as any)).toBeUndefined();
    expect(parseSchedule({} as any)).toBeUndefined();
  });
});
