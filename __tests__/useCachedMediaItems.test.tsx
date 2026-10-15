/**
 * The hook that hands the Media Player its playlist.
 *
 *   - cache off: the playlist as it is, ready at once, the native module never touched
 *     (a device that does not use the cache must not change at all)
 *   - cache on: what is on the device is looked up first, with no network, so a device that
 *     starts offline plays at once; then the files are brought up to date in the background
 *   - the playlist is replaced only when a file really changed: the player restarts from the
 *     first item whenever it is given a new one
 *   - a check that fails (offline) leaves the files, and is tried again later
 */
// A module of its own so the helpers do not collide with another test file's
export {};

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

const mockGetCached = jest.fn();
const mockSync = jest.fn();

const { NativeModules } = require('react-native');
NativeModules.MediaCacheModule = {
  getCached: (...args: any[]) => mockGetCached(...args),
  sync: (...args: any[]) => mockSync(...args),
};

const { useCachedMediaItems, MEDIA_CACHE_RECHECK_MS } = require('../src/utils/useCachedMediaItems');

const A = 'https://cdn.test/a.mp4';
const B = 'https://cdn.test/b.jpg';
const items = [
  { id: '1', url: A, type: 'video' },
  { id: '2', url: B, type: 'image', duration: 5 },
];

let latest: { items: any[]; ready: boolean } | null = null;
const seen: any[][] = [];

function Probe({ list, enabled }: { list: any[]; enabled: boolean }) {
  const result = useCachedMediaItems(list, enabled);
  latest = result;
  if (seen[seen.length - 1] !== result.items) seen.push(result.items);
  return null;
}

function LimitProbe({ list, enabled, limitMb }: { list: any[]; enabled: boolean; limitMb: number }) {
  useCachedMediaItems(list, enabled, limitMb);
  return null;
}

async function render(list: any[], enabled: boolean) {
  let renderer: any;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(Probe, { list, enabled }));
  });
  return renderer;
}

/** Lets the promises that are already resolved run, without moving the clock */
async function flush() {
  await act(async () => {
    // Enough turns for a resolved native call, and what follows it, to reach the hook
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

describe('useCachedMediaItems', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGetCached.mockReset();
    mockSync.mockReset();
    latest = null;
    seen.length = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('with the cache off, returns the playlist itself and never touches the native module', async () => {
    await render(items, false);

    expect(latest!.ready).toBe(true);
    expect(latest!.items).toBe(items);
    expect(mockGetCached).not.toHaveBeenCalled();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('with the cache on, plays the files already on the device before any download', async () => {
    mockGetCached.mockResolvedValue({ [A]: 'file:///files/media_cache/a.mp4', [B]: null });
    mockSync.mockReturnValue(new Promise(() => {})); // the download is still running

    await render(items, true);
    await flush();

    expect(latest!.ready).toBe(true);
    expect(latest!.items[0].url).toBe('file:///files/media_cache/a.mp4');
    expect(latest!.items[1].url).toBe(B); // not on the device yet: plays from its URL
    expect(latest!.items[1].duration).toBe(5);
    expect(mockGetCached).toHaveBeenCalledWith([A, B]);
    expect(mockSync).toHaveBeenCalledWith([A, B], 2048 * 1024 * 1024);
  });

  it('is not ready until the look-up of the device has answered', async () => {
    let answer: (v: any) => void = () => {};
    mockGetCached.mockReturnValue(new Promise(resolve => { answer = resolve; }));
    mockSync.mockReturnValue(new Promise(() => {}));

    await render(items, true);
    expect(latest!.ready).toBe(false);

    await act(async () => { answer({}); });
    await flush();
    expect(latest!.ready).toBe(true);
  });

  it('swaps in a file once its download is done', async () => {
    mockGetCached.mockResolvedValue({});
    mockSync.mockResolvedValue({ [A]: 'file:///files/media_cache/a.mp4', [B]: 'file:///files/media_cache/b.jpg' });

    await render(items, true);
    await flush();

    expect(latest!.items.map((i: any) => i.url)).toEqual([
      'file:///files/media_cache/a.mp4',
      'file:///files/media_cache/b.jpg',
    ]);
  });

  it('does not hand the player a new playlist when a re-check finds nothing new', async () => {
    const map = { [A]: 'file:///files/media_cache/a.mp4', [B]: 'file:///files/media_cache/b.jpg' };
    mockGetCached.mockResolvedValue(map);
    // A new object on every call, as the native module returns: only its content may matter
    mockSync.mockImplementation(async () => ({ ...map }));

    await render(items, true);
    await flush();
    const settled = latest!.items;
    const rendersBefore = seen.length;

    await act(async () => { jest.advanceTimersByTime(MEDIA_CACHE_RECHECK_MS); });
    await flush();

    expect(mockSync).toHaveBeenCalledTimes(2);
    expect(latest!.items).toBe(settled); // same array: the player keeps playing
    expect(seen.length).toBe(rendersBefore);
  });

  it('keeps playing the files when the check fails, and tries again later', async () => {
    const map = { [A]: 'file:///files/media_cache/a.mp4', [B]: null };
    mockGetCached.mockResolvedValue(map);
    mockSync.mockRejectedValue(new Error('offline'));

    await render(items, true);
    await flush();
    expect(latest!.items[0].url).toBe('file:///files/media_cache/a.mp4');

    await act(async () => { jest.advanceTimersByTime(MEDIA_CACHE_RECHECK_MS); });
    await flush();

    expect(mockSync).toHaveBeenCalledTimes(2);
    expect(latest!.items[0].url).toBe('file:///files/media_cache/a.mp4');
  });

  it('plays from the URLs when the look-up of the device fails', async () => {
    mockGetCached.mockRejectedValue(new Error('no storage'));
    mockSync.mockReturnValue(new Promise(() => {}));

    await render(items, true);
    await flush();

    expect(latest!.ready).toBe(true);
    expect(latest!.items.map((i: any) => i.url)).toEqual([A, B]);
  });

  it('starts again for a new list of URLs', async () => {
    mockGetCached.mockResolvedValue({});
    mockSync.mockReturnValue(new Promise(() => {}));
    const renderer = await render(items, true);
    await flush();
    expect(mockGetCached).toHaveBeenCalledTimes(1);

    const next = [{ id: '1', url: 'https://cdn.test/c.mp4', type: 'video' }];
    await act(async () => { renderer.update(React.createElement(Probe, { list: next, enabled: true })); });
    await flush();

    expect(mockGetCached).toHaveBeenLastCalledWith(['https://cdn.test/c.mp4']);
  });

  it('does not start again for the same URLs in a new array', async () => {
    mockGetCached.mockResolvedValue({});
    mockSync.mockReturnValue(new Promise(() => {}));
    const renderer = await render(items, true);
    await flush();

    const copy = items.map(i => ({ ...i }));
    await act(async () => { renderer.update(React.createElement(Probe, { list: copy, enabled: true })); });
    await flush();

    expect(mockGetCached).toHaveBeenCalledTimes(1);
  });

  it('hands the native module the limit it was given, in bytes', async () => {
    mockGetCached.mockResolvedValue({});
    mockSync.mockReturnValue(new Promise(() => {}));

    let renderer: any;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(LimitProbe, { list: items, enabled: true, limitMb: 5 }));
    });
    await flush();

    expect(mockSync).toHaveBeenCalledWith([A, B], 5 * 1024 * 1024);
    renderer.unmount();
  });

  it('starts again when the limit changes', async () => {
    mockGetCached.mockResolvedValue({});
    mockSync.mockReturnValue(new Promise(() => {}));
    let renderer: any;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(LimitProbe, { list: items, enabled: true, limitMb: 5 }));
    });
    await flush();

    await act(async () => { renderer.update(React.createElement(LimitProbe, { list: items, enabled: true, limitMb: 50 })); });
    await flush();

    expect(mockSync).toHaveBeenLastCalledWith([A, B], 50 * 1024 * 1024);
  });

  it('stops checking once it is unmounted', async () => {
    mockGetCached.mockResolvedValue({});
    mockSync.mockResolvedValue({});
    const renderer = await render(items, true);
    await flush();
    expect(mockSync).toHaveBeenCalledTimes(1);

    await act(async () => { renderer.unmount(); });
    await act(async () => { jest.advanceTimersByTime(MEDIA_CACHE_RECHECK_MS * 3); });

    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it('goes back to the plain playlist when the cache is turned off', async () => {
    mockGetCached.mockResolvedValue({ [A]: 'file:///files/media_cache/a.mp4' });
    mockSync.mockReturnValue(new Promise(() => {}));
    const renderer = await render(items, true);
    await flush();
    expect(latest!.items[0].url).toBe('file:///files/media_cache/a.mp4');

    await act(async () => { renderer.update(React.createElement(Probe, { list: items, enabled: false })); });
    await flush();

    expect(latest!.items).toBe(items);
    expect(latest!.ready).toBe(true);
  });
});

describe('files that play later (the other playlists of a schedule)', () => {
  const C = 'https://cdn.test/c.mp4';
  let result: { items: any[]; ready: boolean } | null = null;

  function PrefetchProbe({ list, prefetch }: { list: any[]; prefetch: any[] }) {
    result = useCachedMediaItems(list, true, 2048, prefetch);
    return null;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    mockGetCached.mockReset();
    mockSync.mockReset();
    result = null;
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps them on the device too, without playing them', async () => {
    mockGetCached.mockResolvedValue({ [A]: 'file:///files/a.mp4', [C]: 'file:///files/c.mp4' });
    mockSync.mockReturnValue(new Promise(() => {}));

    await act(async () => {
      TestRenderer.create(React.createElement(PrefetchProbe, {
        list: [{ id: '1', url: A, type: 'video' }],
        prefetch: [{ id: '3', url: C, type: 'video' }],
      }));
    });
    await flush();

    // both are looked up and downloaded, the list being played first
    expect(mockGetCached).toHaveBeenCalledWith([A, C]);
    expect(mockSync).toHaveBeenCalledWith([A, C], 2048 * 1024 * 1024);
    // but only the playlist that plays now is handed to the player
    expect(result!.items.map((i: any) => i.url)).toEqual(['file:///files/a.mp4']);
  });

  it('asks for a file once when it is in both', async () => {
    mockGetCached.mockResolvedValue({});
    mockSync.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      TestRenderer.create(React.createElement(PrefetchProbe, {
        list: [{ id: '1', url: A, type: 'video' }],
        prefetch: [{ id: '1b', url: A, type: 'video' }, { id: '3', url: C, type: 'video' }],
      }));
    });
    await flush();
    expect(mockSync).toHaveBeenCalledWith([A, C], 2048 * 1024 * 1024);
  });

  it('changes nothing for a device with no schedule', async () => {
    mockGetCached.mockResolvedValue({});
    mockSync.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      TestRenderer.create(React.createElement(PrefetchProbe, { list: [{ id: '1', url: A, type: 'video' }], prefetch: [] }));
    });
    await flush();
    expect(mockSync).toHaveBeenCalledWith([A], 2048 * 1024 * 1024);
  });
});
