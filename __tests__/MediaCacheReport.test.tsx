/**
 * What the device reports to the cloud about its offline media cache:
 *   - the numbers (wanted, cached, size, partial size) and the time of the last check
 *   - an error is a short code, never the native message (a message can carry a URL token)
 *   - nothing is reported by a device that never used the cache; a cache switched off is
 *     reported once as off, so the cloud stops showing old numbers
 *   - a failing or missing getStats never costs the report, nor playback
 */
export {};

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

const mockGetCached = jest.fn();
const mockSync = jest.fn();
const mockGetStats = jest.fn();

const { NativeModules } = require('react-native');
NativeModules.MediaCacheModule = {
  getCached: (...args: any[]) => mockGetCached(...args),
  sync: (...args: any[]) => mockSync(...args),
  getStats: (...args: any[]) => mockGetStats(...args),
};

const { useCachedMediaItems, MEDIA_CACHE_RECHECK_MS } = require('../src/utils/useCachedMediaItems');
const {
  buildReport,
  errorCode,
  getMediaCacheReport,
  setMediaCacheReport,
} = require('../src/utils/MediaCacheReport');

const A = 'https://cdn.test/a.mp4';
const B = 'https://cdn.test/b.jpg';
const items = [
  { id: '1', url: A, type: 'video' },
  { id: '2', url: B, type: 'image' },
];

function Probe({ list, enabled }: { list: any[]; enabled: boolean }) {
  useCachedMediaItems(list, enabled);
  return null;
}
async function render(enabled: boolean) {
  let renderer: any;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(Probe, { list: items, enabled }));
  });
  return renderer;
}
async function flush() {
  await act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
}

describe('buildReport', () => {
  const stats = { files: 1, bytes: 1500.4, partialBytes: 20 };

  it('counts what is on the device against what the playlist needs', () => {
    const r = buildReport([A, B], { [A]: 'file:///a.mp4', [B]: null }, stats, new Date('2026-10-14T20:00:00Z'), null);
    expect(r).toEqual({
      enabled: true,
      wanted: 2,
      cached: 1,
      bytes: 1500,
      partial_bytes: 20,
      last_check_at: '2026-10-14T20:00:00.000Z',
      error: null,
    });
  });

  it('has no check time before the first check, and zero sizes when they are unknown', () => {
    const r = buildReport([A], {}, null, null, null);
    expect(r.last_check_at).toBeNull();
    expect(r.bytes).toBe(0);
    expect(r.partial_bytes).toBe(0);
    expect(r.cached).toBe(0);
  });
});

describe('errorCode', () => {
  it('keeps the code of the native module', () => {
    expect(errorCode({ code: 'CACHE_ERROR', message: 'GET https://x.test/a.mp4?token=SECRET failed' })).toBe('CACHE_ERROR');
  });
  it('never passes a message on, and falls back to a generic code', () => {
    expect(errorCode(new Error('https://x.test/a.mp4?token=SECRET'))).toBe('SYNC_FAILED');
    expect(errorCode({ code: 'has spaces and a https://url' })).toBe('SYNC_FAILED');
    expect(errorCode(null)).toBe('SYNC_FAILED');
  });
});

describe('the report published by the hook', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-14T20:00:00Z'));
    mockGetCached.mockReset();
    mockSync.mockReset();
    mockGetStats.mockReset();
    setMediaCacheReport(undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports nothing for a device that never used the cache', async () => {
    mockGetStats.mockResolvedValue({ files: 0, bytes: 0, partialBytes: 0 });
    await render(false);
    await flush();
    expect(getMediaCacheReport()).toBeUndefined();
    expect(mockGetCached).not.toHaveBeenCalled();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('says it is off after a restart when files of an earlier cache are still there', async () => {
    mockGetStats.mockResolvedValue({ files: 2, bytes: 4096, partialBytes: 0 });
    await render(false);
    await flush();
    expect(getMediaCacheReport()).toMatchObject({ enabled: false, cached: 0, bytes: 0 });
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('says it is off after a restart when only a cut download is left', async () => {
    mockGetStats.mockResolvedValue({ files: 0, bytes: 0, partialBytes: 900 });
    await render(false);
    await flush();
    expect(getMediaCacheReport()).toMatchObject({ enabled: false });
  });

  it('reports nothing, and does not fail, when the sizes cannot be read with the cache off', async () => {
    mockGetStats.mockRejectedValue(new Error('no stats'));
    await render(false);
    await flush();
    expect(getMediaCacheReport()).toBeUndefined();
  });

  it('reports the state, then the result of each check', async () => {
    mockGetCached.mockResolvedValue({ [A]: 'file:///a.mp4', [B]: null });
    mockSync.mockResolvedValue({ [A]: 'file:///a.mp4', [B]: 'file:///b.jpg' });
    mockGetStats.mockResolvedValue({ files: 2, bytes: 4096, partialBytes: 0 });

    await render(true);
    await flush();

    expect(getMediaCacheReport()).toEqual({
      enabled: true,
      wanted: 2,
      cached: 2,
      bytes: 4096,
      partial_bytes: 0,
      last_check_at: '2026-10-14T20:00:00.000Z',
      error: null,
    });
  });

  it('reports a failed check with a code and keeps what is on the device', async () => {
    mockGetCached.mockResolvedValue({ [A]: 'file:///a.mp4', [B]: null });
    mockSync.mockRejectedValue(Object.assign(new Error('GET https://cdn.test/a.mp4?token=SECRET'), { code: 'CACHE_ERROR' }));
    mockGetStats.mockResolvedValue({ files: 1, bytes: 100, partialBytes: 5 });

    await render(true);
    await flush();

    const r = getMediaCacheReport();
    expect(r.error).toBe('CACHE_ERROR');
    expect(r.cached).toBe(1);
    expect(r.last_check_at).not.toBeNull();
    expect(JSON.stringify(r)).not.toContain('SECRET');
  });

  it('clears the error once a later check works', async () => {
    mockGetCached.mockResolvedValue({});
    mockSync.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ [A]: 'file:///a.mp4', [B]: 'file:///b.jpg' });
    mockGetStats.mockResolvedValue({ files: 2, bytes: 10, partialBytes: 0 });

    await render(true);
    await flush();
    expect(getMediaCacheReport().error).toBe('SYNC_FAILED');

    await act(async () => {
      jest.advanceTimersByTime(MEDIA_CACHE_RECHECK_MS);
    });
    await flush();
    expect(getMediaCacheReport().error).toBeNull();
    expect(getMediaCacheReport().cached).toBe(2);
  });

  it('still reports when the sizes cannot be read', async () => {
    mockGetCached.mockResolvedValue({ [A]: 'file:///a.mp4', [B]: null });
    mockSync.mockResolvedValue({ [A]: 'file:///a.mp4', [B]: null });
    mockGetStats.mockRejectedValue(new Error('no stats'));

    await render(true);
    await flush();

    const r = getMediaCacheReport();
    expect(r.cached).toBe(1);
    expect(r.bytes).toBe(0);
  });

  it('retracts the numbers when the cache is switched off', async () => {
    mockGetCached.mockResolvedValue({});
    mockSync.mockResolvedValue({ [A]: 'file:///a.mp4', [B]: null });
    mockGetStats.mockResolvedValue({ files: 1, bytes: 10, partialBytes: 0 });

    const renderer = await render(true);
    await flush();
    expect(getMediaCacheReport().enabled).toBe(true);

    await act(async () => {
      renderer.update(React.createElement(Probe, { list: items, enabled: false }));
    });
    expect(getMediaCacheReport()).toMatchObject({ enabled: false, wanted: 0, cached: 0, bytes: 0 });
  });
});
