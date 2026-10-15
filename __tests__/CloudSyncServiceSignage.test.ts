/**
 * The digital signage part of the heartbeat:
 *   - until a cloud has spoken of playlists, the heartbeat carries nothing new
 *   - a version in the answer that this screen does not play yet downloads the manifest and
 *     tells the screen to reload; the version applied is then reported back
 *   - an older cloud (no playlist_version) triggers no download and no reload
 */
// A module of its own so the helpers below do not collide with another test file's
export {};

const { NativeModules, DeviceEventEmitter } = require('react-native');
NativeModules.HttpServerModule = {
  executeNativeCommand: jest.fn(),
  captureScreenshotBase64: jest.fn(),
};

const mockGetStatus = jest.fn();
jest.mock('../src/services/DeviceControlService', () => ({
  __esModule: true,
  default: { getStatus: (...args: any[]) => mockGetStatus(...args) },
}));

jest.mock('../src/utils/capabilities', () => ({
  getCapabilities: () => Promise.resolve(['brightness']),
}));

jest.mock('../src/utils/secureStorage', () => ({
  ...jest.requireActual('../src/utils/secureStorage'),
  getCloudCredentials: jest.fn(),
  clearCloudCredentials: jest.fn(() => Promise.resolve()),
}));

const AsyncStorage = require('@react-native-async-storage/async-storage');
const { CloudSyncService, CONFIG_UPDATED_EVENT } = require('../src/utils/CloudSyncService');
const { SignagePlaylist } = require('../src/utils/SignagePlaylist');

const store = AsyncStorage.default ?? AsyncStorage;
const CREDS = { deviceId: 'dev-1', apiKey: 'fk_test', cloudUrl: 'https://cloud.test', organizationName: 'Test Org' };

const STATUS = {
  battery: { level: 80, charging: false, plugged: 'none', present: true },
  screen: { on: true, brightness: 50 },
  webview: { currentUrl: 'https://example.test' },
  device: {
    ip: '192.168.1.20', kioskMode: true, isDeviceOwner: false, version: '2.0.0', model: 'Test',
    manufacturer: 'Test', androidVersion: '15', freeStorageMb: 1000, freeMemoryMb: 500, uptime: 10,
  },
  wifi: { ssid: 'home', signalStrength: -50, connected: true, ethernet: false },
  cellular: { connected: false, carrier: '', networkType: '', signalDbm: 0, airplaneMode: false },
  timestamp: 0,
};

const MANIFEST = {
  version: 'p1:1',
  playlist: { id: 'p1', name: 'Menu' },
  items: [{ id: 'i1', kind: 'video', url: 'https://cdn.test/a.mp4', title: '', duration_seconds: null }],
};

let heartbeatBodies: any[];
let manifestCalls: any[];

/** A cloud that answers the heartbeat with `answer` and serves `MANIFEST` when asked. */
function cloud(answer: Record<string, unknown>) {
  (globalThis as any).fetch = jest.fn((url: string, init: any) => {
    if (url.endsWith('/playlist/')) {
      manifestCalls.push({ url, init });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(MANIFEST) });
    }
    heartbeatBodies.push(JSON.parse(init.body));
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        status: 'ok', pending_commands: 0, server_time: 'now', sync_action: 'none', config: null,
        sensitive_config: null, config_version: 0, force_unenroll: false, ...answer,
      }),
    });
  });
}

describe('heartbeat and digital signage', () => {
  let reloads: number;
  let subscription: { remove: () => void };

  beforeEach(async () => {
    await store.clear();
    heartbeatBodies = [];
    manifestCalls = [];
    reloads = 0;
    mockGetStatus.mockResolvedValue(STATUS);
    subscription = DeviceEventEmitter.addListener(CONFIG_UPDATED_EVENT, () => { reloads += 1; });
  });
  afterEach(() => subscription.remove());

  const beat = () => CloudSyncService.sendHeartbeat(CREDS, { force: true });

  it('carries nothing new until the cloud has spoken of playlists', async () => {
    cloud({});
    await beat();
    expect(heartbeatBodies[0].system).not.toHaveProperty('signage_playlist_version');
  });

  it('downloads the manifest for a version it does not play, reloads, and reports it next', async () => {
    cloud({ playlist_version: 'p1:1' });
    await beat();

    expect(manifestCalls.length).toBe(1);
    expect(manifestCalls[0].url).toBe('https://cloud.test/api/v1/devices/dev-1/playlist/');
    expect(manifestCalls[0].init.headers.Authorization).toBe('Bearer fk_test');
    expect(reloads).toBe(1);
    expect((await SignagePlaylist.getActive()).items[0].url).toBe('https://cdn.test/a.mp4');

    await beat();
    expect(heartbeatBodies[1].system.signage_playlist_version).toBe('p1:1');
    // the same version again: no new download, no new reload
    expect(manifestCalls.length).toBe(1);
    expect(reloads).toBe(1);
  });

  it('does not download anything for an older cloud', async () => {
    cloud({});
    await beat();
    await beat();
    expect(manifestCalls.length).toBe(0);
    expect(reloads).toBe(0);
    expect(heartbeatBodies[1].system).not.toHaveProperty('signage_playlist_version');
  });

  it('reports "none" once the cloud says there is no playlist, without a download', async () => {
    cloud({ playlist_version: null });
    await beat();
    expect(manifestCalls.length).toBe(0);
    expect(reloads).toBe(0);
    await beat();
    expect(heartbeatBodies[1].system.signage_playlist_version).toBe('');
  });

  it('leaves the rest of the heartbeat as it was', async () => {
    cloud({ playlist_version: 'p1:1' });
    await beat();
    const system = heartbeatBodies[0].system;
    expect(system.model).toBe('Test');
    expect(system.app_version).toBe('2.0.0');
    expect(heartbeatBodies[0].battery).toEqual({ level: 80, charging: false });
  });
});
