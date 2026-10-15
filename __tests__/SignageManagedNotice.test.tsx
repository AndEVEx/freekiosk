/**
 * The notice above the Media Playlist in Settings: it says the playlist comes from FreeKiosk
 * Cloud while one is assigned, with its name, and says nothing for a device that has none.
 */
// A module of its own so the helpers do not collide with another test file's
export {};

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key} ${JSON.stringify(vars)}` : key),
  }),
}));

const { NativeModules } = require('react-native');
NativeModules.HttpServerModule = { executeNativeCommand: jest.fn(), captureScreenshotBase64: jest.fn() };

const AsyncStorage = require('@react-native-async-storage/async-storage');
const SignageManagedNotice = require('../src/components/settings/SignageManagedNotice').default;
const store = AsyncStorage.default ?? AsyncStorage;

const render = async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<SignageManagedNotice />);
  });
  return renderer;
};
const texts = (r: ReactTestRenderer.ReactTestRenderer) =>
  r.root
    .findAll(n => (n.type as unknown) === 'Text')
    .map(n => [].concat(n.props.children as any).join(''));

describe('SignageManagedNotice', () => {
  beforeEach(async () => {
    await store.clear();
  });

  it('says nothing for a device with no cloud playlist', async () => {
    expect(texts(await render())).toEqual([]);
  });

  it('names the playlist when one is assigned', async () => {
    await store.setItem(
      '@kiosk_signage_playlist',
      JSON.stringify({ version: 'p1:1', name: 'Lobby loop', items: [] }),
    );
    const out = texts(await render());
    expect(out.length).toBe(1);
    expect(out[0]).toContain('general.mediaPlaylist.cloudManaged');
    expect(out[0]).toContain('Lobby loop');
  });

  it('says nothing when what is stored is not a playlist', async () => {
    await store.setItem('@kiosk_signage_playlist', 'not json');
    expect(texts(await render())).toEqual([]);
  });
});
