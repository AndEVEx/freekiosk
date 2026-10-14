/**
 * What the cloud receives from a device with no battery (an Android TV or a box):
 *
 *   - no `battery` key at all, so the cloud keeps the field empty instead of storing a
 *     made-up level and raising a critical-battery alert
 *   - a tablet still sends its battery
 *   - a box on Ethernet says so, since its Wi-Fi reads as disconnected
 */
// A module of its own so the helpers below do not collide with another test file's
export {};

const { NativeModules, Platform } = require('react-native');
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

const { CloudSyncService } = require('../src/utils/CloudSyncService');

const CREDS = {
  deviceId: 'dev-1',
  apiKey: 'fk_test',
  cloudUrl: 'https://cloud.test',
  organizationName: 'Test Org',
};

function statusWith(overrides: { battery?: any; wifi?: any }) {
  return {
    battery: { level: 80, charging: false, plugged: 'none', present: true, ...overrides.battery },
    screen: { on: true, brightness: 50 },
    webview: { currentUrl: 'https://example.test' },
    device: {
      ip: '192.168.1.20',
      kioskMode: true,
      isDeviceOwner: false,
      version: '2.0.0',
      model: 'Test',
      manufacturer: 'Test',
      androidVersion: '15',
      freeStorageMb: 1000,
      freeMemoryMb: 500,
      uptime: 10,
    },
    wifi: { ssid: 'home', signalStrength: -50, connected: true, ethernet: false, ...overrides.wifi },
    cellular: { connected: false, carrier: '', networkType: '', signalDbm: 0, airplaneMode: false },
    timestamp: 0,
  };
}

/** Sends one heartbeat and returns the JSON body the cloud would have received. */
async function heartbeatBody(status: any) {
  mockGetStatus.mockResolvedValue(status);
  let body: any;
  (globalThis as any).fetch = jest.fn((_url: string, init: any) => {
    body = JSON.parse(init.body);
    return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ config_version: 0 }) });
  });
  await CloudSyncService.sendHeartbeat(CREDS, { force: true });
  return body;
}

describe('heartbeat telemetry on a TV', () => {
  it('sends the battery of a tablet', async () => {
    const body = await heartbeatBody(statusWith({}));

    expect(body.battery).toEqual({ level: 80, charging: false });
  });

  it('leaves the battery out for a device that has none', async () => {
    const body = await heartbeatBody(statusWith({ battery: { level: 0, present: false } }));

    expect(body).not.toHaveProperty('battery');
    // the rest of the telemetry is still there
    expect(body.network.ip_address).toBe('192.168.1.20');
    expect(body.system.model).toBe('Test');
  });

  it('reports that a box is on Ethernet while its Wi-Fi is down', async () => {
    const body = await heartbeatBody(
      statusWith({ wifi: { ssid: '', signalStrength: 0, connected: false, ethernet: true } }),
    );

    expect(body.network.ethernet_connected).toBe(true);
    expect(body.network.wifi_ssid).toBe('');
  });

  it('says Ethernet is off when the status does not know', async () => {
    const body = await heartbeatBody(statusWith({ wifi: { ethernet: undefined } }));

    expect(body.network.ethernet_connected).toBe(false);
  });
});


describe('form factor reported to the cloud', () => {
  const original = Platform.isTV;
  const setTv = (value: boolean) => {
    Object.defineProperty(Platform, 'isTV', { configurable: true, get: () => value });
  };

  afterEach(() => {
    Object.defineProperty(Platform, 'isTV', { configurable: true, get: () => original });
  });

  /** The enrolment request the cloud would receive (a refusal stops the app after the fetch) */
  async function enrolBody() {
    let body: any;
    (globalThis as any).fetch = jest.fn((_url: string, init: any) => {
      body = JSON.parse(init.body);
      return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ error: 'refused' }) });
    });
    await CloudSyncService.enroll('https://cloud.test', 'TOKEN1', { model: 'Chromecast', manufacturer: 'Google' });
    return body;
  }

  it('says tablet in the heartbeat on a tablet', async () => {
    setTv(false);
    const body = await heartbeatBody(statusWith({}));
    expect(body.system.form_factor).toBe('tablet');
  });

  it('says tv in the heartbeat on a TV', async () => {
    setTv(true);
    const body = await heartbeatBody(statusWith({}));
    expect(body.system.form_factor).toBe('tv');
  });

  it('says tv when it enrols on a TV, and keeps what the caller sent', async () => {
    setTv(true);
    const body = await enrolBody();
    expect(body.device_info.form_factor).toBe('tv');
    expect(body.device_info.model).toBe('Chromecast');
    expect(body.token).toBe('TOKEN1');
  });

  it('says tablet when it enrols on a tablet', async () => {
    setTv(false);
    const body = await enrolBody();
    expect(body.device_info.form_factor).toBe('tablet');
  });
});


describe('offline media cache in the heartbeat', () => {
  const { setMediaCacheReport } = require('../src/utils/MediaCacheReport');
  afterEach(() => setMediaCacheReport(undefined));

  it('sends nothing for a device that never used the cache', async () => {
    const body = await heartbeatBody(statusWith({}));
    expect(body.system).not.toHaveProperty('media_cache');
  });

  it('sends the report once the cache has been on', async () => {
    const report = {
      enabled: true, wanted: 3, cached: 2, bytes: 1000, partial_bytes: 0,
      last_check_at: '2026-10-14T20:00:00.000Z', error: null,
    };
    setMediaCacheReport(report);
    const body = await heartbeatBody(statusWith({}));
    expect(body.system.media_cache).toEqual(report);
    // the rest of the telemetry is unchanged
    expect(body.system.model).toBe('Test');
  });
});
