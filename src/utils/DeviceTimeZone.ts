/**
 * The time zone of the device, for FreeKiosk Cloud.
 *
 * A schedule says "9:00" in the local time of the screen, and a screen does not otherwise tell the cloud
 * where it is. The heartbeat carries the zone (a name such as "Europe/Paris", when the platform gives one) and
 * the offset from UTC in minutes at this moment (east is positive, so Paris in summer is 120), which is
 * always there and is what the cloud falls back on. The dashboard uses them to say when a screen
 * changes playlist next.
 */
const ZONE_NAME = /^[A-Za-z0-9_+\-/]{1,64}$/;

export interface DeviceTimeZone {
  timezone?: string;
  utc_offset_minutes: number;
}

export function deviceTimeZone(now: Date = new Date()): DeviceTimeZone {
  let name: unknown;
  try {
    name = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // No Intl on this engine: only the offset
  }
  return {
    ...(typeof name === 'string' && ZONE_NAME.test(name) ? { timezone: name } : {}),
    // getTimezoneOffset is minutes west of UTC; the cloud wants east
    utc_offset_minutes: Math.round(-now.getTimezoneOffset()) || 0, // "|| 0": not minus zero
  };
}
