/**
 * The rules of the Media Player's offline cache, without a device:
 *   - which items are kept on the device (http(s) only, each once, nothing local)
 *   - which URL the player is handed (the local file when there is one, the URL otherwise)
 *   - when two cache states are the same (so the player is not restarted for nothing)
 *   - the default: on for a TV, off everywhere else, so a tablet plays exactly as before
 *   - the setting travels in the synced config and does not disturb an older config
 */
// A module of its own so the helpers do not collide with another test file's
export {};

const { NativeModules, Platform } = require('react-native');
NativeModules.HttpServerModule = {
  executeNativeCommand: jest.fn(),
  captureScreenshotBase64: jest.fn(),
};

const AsyncStorage = require('@react-native-async-storage/async-storage');
const { StorageService } = require('../src/utils/storage');
const {
  collectCacheableUrls,
  withCachedUrls,
  sameCacheMap,
  defaultMediaCacheEnabled,
  defaultMediaUnattended,
  formatBytes,
  DEFAULT_MEDIA_CACHE_LIMIT_MB,
} = require('../src/utils/MediaCache');

const store = AsyncStorage.default ?? AsyncStorage;

const item = (id: string, url: string, extra: any = {}) => ({ id, url, type: 'video', ...extra });

describe('collectCacheableUrls', () => {
  it('keeps the http and https items, in playlist order', () => {
    const urls = collectCacheableUrls([
      item('1', 'https://cdn.test/a.mp4'),
      item('2', 'http://cdn.test/b.jpg', { type: 'image' }),
    ]);
    expect(urls).toEqual(['https://cdn.test/a.mp4', 'http://cdn.test/b.jpg']);
  });

  it('never downloads a web page or a YouTube video: they are shown live', () => {
    const urls = collectCacheableUrls([
      item('1', 'https://cdn.test/a.mp4'),
      item('2', 'https://example.com/menu', { type: 'web' }),
      item('3', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', { type: 'youtube' }),
    ]);
    expect(urls).toEqual(['https://cdn.test/a.mp4']);
  });

  it('lists a URL once even when the playlist plays it twice', () => {
    const urls = collectCacheableUrls([
      item('1', 'https://cdn.test/a.mp4'),
      item('2', 'https://cdn.test/b.mp4'),
      item('3', 'https://cdn.test/a.mp4'),
    ]);
    expect(urls).toEqual(['https://cdn.test/a.mp4', 'https://cdn.test/b.mp4']);
  });

  it('skips what is already local or has nothing to download', () => {
    const urls = collectCacheableUrls([
      item('1', 'file:///data/user/0/com.freekiosk/files/media_player/a.mp4', { isLocal: true }),
      item('2', 'https://cdn.test/own-storage.mp4', { isLocal: true }),
      item('3', 'data:image/png;base64,AAAA', { type: 'image' }),
      item('4', ''),
      item('5', 'https://cdn.test/ok.mp4'),
    ]);
    expect(urls).toEqual(['https://cdn.test/ok.mp4']);
  });

  it('copes with an empty or missing playlist', () => {
    expect(collectCacheableUrls([])).toEqual([]);
    expect(collectCacheableUrls(undefined as any)).toEqual([]);
  });
});

describe('withCachedUrls', () => {
  const items = [
    item('1', 'https://cdn.test/a.mp4'),
    item('2', 'https://cdn.test/b.mp4'),
    item('3', 'file:///x/c.mp4', { isLocal: true }),
  ];

  it('points a cached item at its local file and leaves the others alone', () => {
    const out = withCachedUrls(items, {
      'https://cdn.test/a.mp4': 'file:///files/media_cache/aaa.mp4',
      'https://cdn.test/b.mp4': null,
    });
    expect(out[0].url).toBe('file:///files/media_cache/aaa.mp4');
    expect(out[1].url).toBe('https://cdn.test/b.mp4');
    expect(out[2].url).toBe('file:///x/c.mp4');
  });

  it('keeps every other field of the item', () => {
    const out = withCachedUrls([item('1', 'https://cdn.test/a.mp4', { duration: 7, title: 'Menu' })], {
      'https://cdn.test/a.mp4': 'file:///files/media_cache/aaa.mp4',
    });
    expect(out[0]).toMatchObject({ id: '1', type: 'video', duration: 7, title: 'Menu' });
  });

  it('never rewrites an item that is local already, whatever the map says', () => {
    const out = withCachedUrls(items, { 'file:///x/c.mp4': 'file:///elsewhere.mp4' });
    expect(out[2].url).toBe('file:///x/c.mp4');
  });

  it('does not change the playlist it is given', () => {
    const before = JSON.stringify(items);
    withCachedUrls(items, { 'https://cdn.test/a.mp4': 'file:///files/media_cache/aaa.mp4' });
    expect(JSON.stringify(items)).toBe(before);
  });
});

describe('sameCacheMap', () => {
  it('treats a missing entry and a null entry as the same', () => {
    expect(sameCacheMap({ a: null }, {})).toBe(true);
    expect(sameCacheMap({}, { a: null })).toBe(true);
  });

  it('is true for the same files, whatever the order', () => {
    expect(sameCacheMap({ a: 'f1', b: 'f2' }, { b: 'f2', a: 'f1' })).toBe(true);
  });

  it('is false as soon as one file differs or appears', () => {
    expect(sameCacheMap({ a: 'f1' }, { a: 'f2' })).toBe(false);
    expect(sameCacheMap({ a: null }, { a: 'f1' })).toBe(false);
    expect(sameCacheMap({}, { a: 'f1' })).toBe(false);
  });
});

describe('the cache setting', () => {
  const original = Platform.isTV;
  const setTv = (value: boolean) => {
    Object.defineProperty(Platform, 'isTV', { configurable: true, get: () => value });
  };

  beforeEach(async () => {
    await store.clear();
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'isTV', { configurable: true, get: () => original });
  });

  it('is off by default on a tablet, so nothing changes there', async () => {
    setTv(false);
    expect(defaultMediaCacheEnabled()).toBe(false);
    expect(await StorageService.getMediaPlayerCache()).toBe(false);
    const config: any = await StorageService.exportConfig();
    expect(config.general.mediaPlayer.cache).toBe(false);
  });

  it('is on by default on a TV', async () => {
    setTv(true);
    expect(defaultMediaCacheEnabled()).toBe(true);
    expect(await StorageService.getMediaPlayerCache()).toBe(true);
    const config: any = await StorageService.exportConfig();
    expect(config.general.mediaPlayer.cache).toBe(true);
  });

  it('keeps what was chosen, on either kind of device', async () => {
    setTv(true);
    await StorageService.saveMediaPlayerCache(false);
    expect(await StorageService.getMediaPlayerCache()).toBe(false);
    setTv(false);
    await StorageService.saveMediaPlayerCache(true);
    expect(await StorageService.getMediaPlayerCache()).toBe(true);
  });

  it('is imported from the synced config and exported back unchanged', async () => {
    setTv(false);
    await StorageService.importConfig({ general: { mediaPlayer: { cache: true } } });
    expect(await StorageService.getMediaPlayerCache()).toBe(true);
    const config: any = await StorageService.exportConfig();
    expect(config.general.mediaPlayer.cache).toBe(true);
  });

  it('is left alone by a config that does not carry it (an older cloud)', async () => {
    setTv(false);
    await StorageService.saveMediaPlayerCache(true);
    await StorageService.importConfig({ general: { mediaPlayer: { loop: false } } });
    expect(await StorageService.getMediaPlayerCache()).toBe(true);
  });
});


describe('formatBytes', () => {
  it('writes a size the way the settings show it', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(-5)).toBe('0 KB');
    expect(formatBytes(NaN)).toBe('0 KB');
    expect(formatBytes(512)).toBe('1 KB');
    expect(formatBytes(788493)).toBe('770 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(1572864)).toBe('1.5 MB');
    expect(formatBytes(12582912)).toBe('12 MB');
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2 GB');
    expect(formatBytes(1536 * 1024 * 1024)).toBe('1.5 GB');
  });

  it('keeps the default limit at 2 GB', () => {
    expect(DEFAULT_MEDIA_CACHE_LIMIT_MB).toBe(2048);
  });
});

describe('the unattended playback setting', () => {
  const original = Platform.isTV;
  const setTv = (value: boolean) => {
    Object.defineProperty(Platform, 'isTV', { configurable: true, get: () => value });
  };

  beforeEach(async () => {
    await store.clear();
  });
  afterEach(() => {
    Object.defineProperty(Platform, 'isTV', { configurable: true, get: () => original });
  });

  it('is off by default on a tablet, so nothing changes there', async () => {
    setTv(false);
    expect(defaultMediaUnattended()).toBe(false);
    expect(await StorageService.getMediaPlayerUnattended()).toBe(false);
  });

  it('is on by default on a TV', async () => {
    setTv(true);
    expect(defaultMediaUnattended()).toBe(true);
    expect(await StorageService.getMediaPlayerUnattended()).toBe(true);
  });

  it('keeps what was chosen, on either kind of device', async () => {
    setTv(true);
    await StorageService.saveMediaPlayerUnattended(false);
    expect(await StorageService.getMediaPlayerUnattended()).toBe(false);
    setTv(false);
    await StorageService.saveMediaPlayerUnattended(true);
    expect(await StorageService.getMediaPlayerUnattended()).toBe(true);
  });
});
