/**
 * The notice under "Launch on Boot" on a TV without Device Owner: it says whether Android will
 * let FreeKiosk start at boot ("display over other apps"), and when it will not, gives the
 * command to grant it, since a TV has no screen for it. When the state cannot be read it says
 * nothing rather than something wrong.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockCanDraw = jest.fn();
const { NativeModules } = require('react-native');
NativeModules.OverlayPermissionModule = {
  canDrawOverlays: (...args: any[]) => mockCanDraw(...args),
  requestOverlayPermission: jest.fn(),
};

// Required after the native module is in place: the module reads it when it loads
const TvBootPermissionNotice = require('../src/components/settings/TvBootPermissionNotice').default;
const { OVERLAY_GRANT_COMMAND } = require('../src/components/settings/TvBootPermissionNotice');

const render = async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<TvBootPermissionNotice />);
  });
  return renderer;
};
const texts = (r: ReactTestRenderer.ReactTestRenderer) =>
  r.root
    .findAll(n => (n.type as unknown) === 'Text')
    .map(n => [].concat(n.props.children as any).join(''));

describe('TvBootPermissionNotice', () => {
  beforeEach(() => mockCanDraw.mockReset());

  it('warns, and gives the command, when the permission is missing', async () => {
    mockCanDraw.mockResolvedValue(false);
    const out = texts(await render());
    expect(out).toContain('security.autoLaunch.tvBootBlocked');
    expect(out).toContain(OVERLAY_GRANT_COMMAND);
    expect(out).not.toContain('security.autoLaunch.tvBootGranted');
  });

  it('says it is fine when the permission is granted, with no command', async () => {
    mockCanDraw.mockResolvedValue(true);
    const out = texts(await render());
    expect(out).toContain('security.autoLaunch.tvBootGranted');
    expect(out).not.toContain(OVERLAY_GRANT_COMMAND);
    expect(out).not.toContain('security.autoLaunch.tvBootBlocked');
  });

  it('says nothing when the state cannot be read', async () => {
    mockCanDraw.mockRejectedValue(new Error('no module'));
    expect(texts(await render())).toEqual([]);
  });

  it('says nothing when the answer is not a yes or a no', async () => {
    mockCanDraw.mockResolvedValue(undefined);
    expect(texts(await render())).toEqual([]);
  });

  it('gives a command that grants the permission to this app', () => {
    expect(OVERLAY_GRANT_COMMAND).toBe('adb shell appops set com.freekiosk SYSTEM_ALERT_WINDOW allow');
  });
});
