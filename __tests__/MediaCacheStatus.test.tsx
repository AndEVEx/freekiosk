/**
 * The cache status under the switch in Settings: what is on the device, and the button that
 * empties it. The button is off while there is nothing to empty or while it is working.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

const mockGetStats = jest.fn();
const mockClear = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key} ${JSON.stringify(vars)}` : key,
  }),
}));

const { NativeModules } = require('react-native');
NativeModules.MediaCacheModule = {
  getStats: (...args: any[]) => mockGetStats(...args),
  clear: (...args: any[]) => mockClear(...args),
};

// Required after the native module is in place: the module reads it when it loads
const MediaCacheStatus = require('../src/components/settings/MediaCacheStatus').default;

const render = async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<MediaCacheStatus />);
  });
  return renderer;
};
const byId = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAll(n => n.props.testID === id)[0];
const textOf = (node: any): string => {
  const children = node.props.children;
  return Array.isArray(children) ? children.join('') : String(children);
};

describe('MediaCacheStatus', () => {
  beforeEach(() => {
    mockGetStats.mockReset();
    mockClear.mockReset();
  });

  it('says there is nothing yet, and the clear button is off', async () => {
    mockGetStats.mockResolvedValue({ files: 0, bytes: 0, partialBytes: 0 });
    const r = await render();

    expect(textOf(byId(r, 'media-cache-stats'))).toBe('general.playback.cacheEmpty');
    expect(byId(r, 'media-cache-clear').props.disabled).toBe(true);
  });

  it('shows the files and their size', async () => {
    mockGetStats.mockResolvedValue({ files: 3, bytes: 788493, partialBytes: 0 });
    const r = await render();

    expect(textOf(byId(r, 'media-cache-stats'))).toBe('general.playback.cacheStats {"files":3,"size":"770 KB"}');
    expect(byId(r, 'media-cache-clear').props.disabled).toBe(false);
  });

  it('mentions a download that was cut and will continue', async () => {
    mockGetStats.mockResolvedValue({ files: 1, bytes: 1048576, partialBytes: 3145728 });
    const r = await render();

    expect(textOf(byId(r, 'media-cache-stats'))).toBe(
      'general.playback.cacheStatsPartial {"files":1,"size":"1 MB","partial":"3 MB"}',
    );
  });

  it('lets a lone half download be cleared too', async () => {
    mockGetStats.mockResolvedValue({ files: 0, bytes: 0, partialBytes: 2048 });
    const r = await render();

    expect(byId(r, 'media-cache-clear').props.disabled).toBe(false);
  });

  it('empties the cache, then reads what is left', async () => {
    mockGetStats
      .mockResolvedValueOnce({ files: 2, bytes: 4096, partialBytes: 0 })
      .mockResolvedValueOnce({ files: 0, bytes: 0, partialBytes: 0 });
    mockClear.mockResolvedValue(true);
    const r = await render();

    await act(async () => {
      await byId(r, 'media-cache-clear').props.onPress();
    });

    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(mockGetStats).toHaveBeenCalledTimes(2);
    expect(textOf(byId(r, 'media-cache-stats'))).toBe('general.playback.cacheEmpty');
  });

  it('still reads the status when the clear fails', async () => {
    mockGetStats.mockResolvedValue({ files: 2, bytes: 4096, partialBytes: 0 });
    mockClear.mockRejectedValue(new Error('disk'));
    const r = await render();

    await act(async () => {
      await byId(r, 'media-cache-clear').props.onPress();
    });

    expect(mockGetStats).toHaveBeenCalledTimes(2);
    expect(byId(r, 'media-cache-clear').props.disabled).toBe(false);
  });

  it('shows the empty state when the status cannot be read', async () => {
    mockGetStats.mockRejectedValue(new Error('no storage'));
    const r = await render();

    expect(textOf(byId(r, 'media-cache-stats'))).toBe('general.playback.cacheEmpty');
    expect(byId(r, 'media-cache-clear').props.disabled).toBe(true);
  });
});
