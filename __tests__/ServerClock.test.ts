/**
 * The time a schedule is judged by. A TV box can be hours off (no battery-backed clock, no network
 * time): the heartbeat answer says what time it is, the gap is kept, and the digital signage
 * schedule reads the time through ServerClock.
 *   - a clock hours off is corrected
 *   - a gap under a minute is network and rounding: the device's clock is used
 *   - a slow exchange, or a time that is not a time, is not measured with
 *   - the gap survives a restart
 *   - the schedule of the signage follows it
 */
// A module of its own so the helpers do not collide with another test file's
export {};

const { NativeModules } = require('react-native');
NativeModules.HttpServerModule = {
  executeNativeCommand: jest.fn(),
  captureScreenshotBase64: jest.fn(),
};

const AsyncStorage = require('@react-native-async-storage/async-storage');
const { ServerClock, MIN_OFFSET_MS, MAX_ROUND_TRIP_MS, parseServerTime } = require('../src/utils/ServerClock');
const { SignagePlaylist } = require('../src/utils/SignagePlaylist');

const store = AsyncStorage.default ?? AsyncStorage;
const CREDS = { cloudUrl: 'https://cloud.test', deviceId: 'dev-1', apiKey: 'fk_test' };
const HOUR = 3600_000;

// The cloud says it is Monday 2026-11-02 12:00:00 UTC, the device says it is 10 h 30 earlier
const SERVER_NOW = Date.UTC(2026, 10, 2, 12, 0, 0);
const DEVICE_NOW = SERVER_NOW - 10.5 * HOUR;
const serverTime = (epoch: number) => new Date(epoch).toISOString().replace('.000Z', 'Z');

describe('ServerClock', () => {
  let dateNow: jest.SpyInstance;

  beforeEach(async () => {
    await store.clear();
    ServerClock._reset();
    dateNow = jest.spyOn(Date, 'now').mockReturnValue(DEVICE_NOW);
  });
  afterEach(() => dateNow.mockRestore());

  it('reads the time the way the cloud writes it, microseconds and +00:00 included', () => {
    const expected = Date.UTC(2026, 9, 15, 16, 0, 0, 169);
    expect(parseServerTime('2026-10-15T16:00:00.169773+00:00')).toBe(expected);
    expect(parseServerTime('2026-10-15T16:00:00.169Z')).toBe(expected);
    expect(parseServerTime('2026-10-15T16:00:00.1Z')).toBe(expected - 69);
    expect(parseServerTime('2026-10-15T16:00:00Z')).toBe(expected - 169);
    expect(parseServerTime('2026-10-15T18:00:00.169+02:00')).toBe(expected);
    expect(parseServerTime('now')).toBeNaN();
    expect(parseServerTime('2026-10-15')).toBeNaN();
    expect(parseServerTime('2026-13-45T00:00:00Z')).toBeNaN();
  });

  it('measures with a time written the way the cloud writes it', async () => {
    const cloudWrites = new Date(SERVER_NOW).toISOString().replace('Z', '123+00:00'); // microseconds, +00:00
    await ServerClock.observe(cloudWrites, DEVICE_NOW, DEVICE_NOW);
    expect(await ServerClock.offset()).toBeGreaterThan(10.4 * HOUR);
  });

  it('uses the device clock until a heartbeat has spoken', async () => {
    expect(await ServerClock.offset()).toBe(0);
    expect((await ServerClock.now()).getTime()).toBe(DEVICE_NOW);
  });

  it('corrects a clock that is hours off', async () => {
    await ServerClock.observe(serverTime(SERVER_NOW), DEVICE_NOW - 200, DEVICE_NOW + 200);
    expect(await ServerClock.offset()).toBe(10.5 * HOUR);
    expect((await ServerClock.now()).getTime()).toBe(SERVER_NOW);
  });

  it('corrects a clock that is ahead too', async () => {
    dateNow.mockReturnValue(SERVER_NOW + 3 * HOUR);
    await ServerClock.observe(serverTime(SERVER_NOW), SERVER_NOW + 3 * HOUR, SERVER_NOW + 3 * HOUR);
    expect(await ServerClock.offset()).toBe(-3 * HOUR);
  });

  it('puts the server time in the middle of the exchange', async () => {
    // sent at 0, answered at 4 s: the server answered at about 2 s
    await ServerClock.observe(serverTime(SERVER_NOW), DEVICE_NOW, DEVICE_NOW + 4000);
    expect(await ServerClock.offset()).toBe(10.5 * HOUR - 2000);
  });

  it('ignores a gap that is only network and rounding', async () => {
    dateNow.mockReturnValue(SERVER_NOW);
    await ServerClock.observe(serverTime(SERVER_NOW + MIN_OFFSET_MS - 5000), SERVER_NOW, SERVER_NOW);
    expect(await ServerClock.offset()).toBe(0);
  });

  it('goes back to the device clock once it is right again', async () => {
    await ServerClock.observe(serverTime(SERVER_NOW), DEVICE_NOW, DEVICE_NOW);
    expect(await ServerClock.offset()).not.toBe(0);
    dateNow.mockReturnValue(SERVER_NOW);
    await ServerClock.observe(serverTime(SERVER_NOW), SERVER_NOW, SERVER_NOW);
    expect(await ServerClock.offset()).toBe(0);
  });

  it('does not measure with a slow exchange', async () => {
    await ServerClock.observe(serverTime(SERVER_NOW), DEVICE_NOW, DEVICE_NOW + MAX_ROUND_TRIP_MS + 1);
    expect(await ServerClock.offset()).toBe(0);
  });

  it('does not measure with something that is not a time', async () => {
    for (const value of ['now', '', null, undefined, 12345, {}, 'not a date']) {
      await ServerClock.observe(value, DEVICE_NOW, DEVICE_NOW);
    }
    expect(await ServerClock.offset()).toBe(0);
  });

  it('survives a restart', async () => {
    await ServerClock.observe(serverTime(SERVER_NOW), DEVICE_NOW, DEVICE_NOW);
    ServerClock._reset(); // the app starts again: nothing in memory
    expect(await ServerClock.offset()).toBe(10.5 * HOUR);
  });

  it('copes with a stored value that is not a number', async () => {
    await store.setItem('@kiosk_server_clock_offset', 'garbage');
    expect(await ServerClock.offset()).toBe(0);
  });
});

describe('the digital signage schedule', () => {
  let dateNow: jest.SpyInstance;
  // Monday 11:00 to 14:00 is lunch, the menu otherwise. The test runs in the local zone of the machine:
  // the device and the server times are built from local clock readings, so the zone does not matter.
  const local = (hour: number) => new Date(2026, 10, 2, hour, 0, 0).getTime();
  const VIDEO = { id: 'i1', kind: 'video', url: 'https://cdn.test/a.mp4', title: '', duration_seconds: null };
  const LUNCH = { id: 'l1', kind: 'image', url: 'https://cdn.test/lunch.png', title: 'Lunch', duration_seconds: 6 };
  const body = {
    version: 's:abc', playlist: { id: 'menu', name: 'Menu' }, items: [VIDEO],
    schedule: {
      default_playlist: 'menu',
      playlists: { menu: { name: 'Menu', items: [VIDEO] }, lunch: { name: 'Lunch', items: [LUNCH] } },
      rules: [{ playlist: 'lunch', days: [1], start: '11:00', end: '14:00', from: null, to: null, priority: 1 }],
    },
  };

  beforeEach(async () => {
    await store.clear();
    ServerClock._reset();
    (globalThis as any).fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) }));
    await SignagePlaylist.sync(CREDS, 's:abc');
    dateNow = jest.spyOn(Date, 'now');
  });
  afterEach(() => dateNow.mockRestore());

  it('follows the cloud time when the device clock is off', async () => {
    // The device believes it is 9:00 (menu), the cloud says it is 12:00 (lunch)
    dateNow.mockReturnValue(local(9));
    expect((await SignagePlaylist.getActive()).id).toBe('menu');
    await ServerClock.observe(serverTime(local(12)), local(9), local(9));
    expect((await SignagePlaylist.getActive()).id).toBe('lunch');
  });

  it('still takes a time given by the caller as it is', async () => {
    dateNow.mockReturnValue(local(9));
    await ServerClock.observe(serverTime(local(12)), local(9), local(9));
    expect((await SignagePlaylist.getActive(new Date(local(9)))).id).toBe('menu');
  });

  it('plays by the device clock when nothing has been measured', async () => {
    dateNow.mockReturnValue(local(12));
    expect((await SignagePlaylist.getActive()).id).toBe('lunch');
  });
});
