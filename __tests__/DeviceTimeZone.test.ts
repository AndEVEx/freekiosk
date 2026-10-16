/**
 * The time zone a screen reports: its name when the platform gives one, and always the offset from UTC
 * in minutes, east positive, as the schedule of the cloud needs it.
 */
// A module of its own so the helpers do not collide with another test file's
export {};

const { deviceTimeZone } = require('../src/utils/DeviceTimeZone');

describe('the time zone of the device', () => {
  const real = Intl.DateTimeFormat;
  afterEach(() => {
    (Intl as any).DateTimeFormat = real;
  });

  it('reports the offset east of UTC, as the schedule reads it', () => {
    const paris = new Date('2026-07-15T10:00:00Z');
    jest.spyOn(paris, 'getTimezoneOffset').mockReturnValue(-120); // Paris in summer: two hours ahead
    expect(deviceTimeZone(paris).utc_offset_minutes).toBe(120);
    const newYork = new Date('2026-07-15T10:00:00Z');
    jest.spyOn(newYork, 'getTimezoneOffset').mockReturnValue(240);
    expect(deviceTimeZone(newYork).utc_offset_minutes).toBe(-240);
    const utc = new Date('2026-07-15T10:00:00Z');
    jest.spyOn(utc, 'getTimezoneOffset').mockReturnValue(0);
    expect(deviceTimeZone(utc).utc_offset_minutes).toBe(0);
  });

  it('reports a zone with half an hour', () => {
    const india = new Date();
    jest.spyOn(india, 'getTimezoneOffset').mockReturnValue(-330);
    expect(deviceTimeZone(india).utc_offset_minutes).toBe(330);
  });

  it('reports the name of the zone when the platform has one', () => {
    (Intl as any).DateTimeFormat = () => ({ resolvedOptions: () => ({ timeZone: 'Europe/Paris' }) });
    expect(deviceTimeZone().timezone).toBe('Europe/Paris');
  });

  it('reports the offset alone when there is no name', () => {
    (Intl as any).DateTimeFormat = () => ({ resolvedOptions: () => ({}) });
    expect(deviceTimeZone()).not.toHaveProperty('timezone');
    expect(typeof deviceTimeZone().utc_offset_minutes).toBe('number');
  });

  it('survives an engine without Intl', () => {
    (Intl as any).DateTimeFormat = () => { throw new Error('no Intl'); };
    const result = deviceTimeZone();
    expect(result).not.toHaveProperty('timezone');
    expect(Number.isInteger(result.utc_offset_minutes)).toBe(true);
  });

  it('does not report a name that is not a zone name', () => {
    for (const name of ['', 'x'.repeat(65), 'Europe/Paris; drop table', '<script>', 42]) {
      (Intl as any).DateTimeFormat = () => ({ resolvedOptions: () => ({ timeZone: name }) });
      expect(deviceTimeZone()).not.toHaveProperty('timezone');
    }
  });
});
