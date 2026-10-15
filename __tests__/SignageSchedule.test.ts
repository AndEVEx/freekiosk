/**
 * Which playlist plays now, decided by the device with its own clock:
 *   - the first rule that matches wins (the cloud sends them in order of precedence)
 *   - days are ISO weekdays; the start time is included and the end time excluded
 *   - dates are inclusive and either bound may be missing
 *   - a rule that runs past midnight belongs to the day it starts on
 *   - nothing matches: the default playlist, or a blank screen when there is none
 *   - a malformed rule never matches and never breaks the others
 */
// A module of its own so the helpers do not collide with another test file's
export {};

const { activePlaylistId, ruleMatches } = require('../src/utils/SignageSchedule');

// 2026-11-02 is a Monday
const at = (day: number, hour = 0, minute = 0, second = 0, month = 11, year = 2026) =>
  new Date(year, month - 1, day, hour, minute, second);
const MON = 2, TUE = 3, WED = 4, THU = 5, FRI = 6, SAT = 7, SUN = 8;

const rule = (overrides: any = {}) => ({
  playlist: 'lunch', days: [1, 2, 3, 4, 5, 6, 7], start: null, end: null, from: null, to: null, ...overrides,
});

describe('ruleMatches', () => {
  it('matches the whole day on a listed day only', () => {
    const r = rule({ days: [1, 3] });
    expect(ruleMatches(r, at(MON, 0, 0))).toBe(true);
    expect(ruleMatches(r, at(MON, 23, 59))).toBe(true);
    expect(ruleMatches(r, at(TUE, 12))).toBe(false);
    expect(ruleMatches(r, at(WED, 12))).toBe(true);
  });

  it('counts Sunday as 7 and Monday as 1', () => {
    expect(ruleMatches(rule({ days: [7] }), at(SUN, 12))).toBe(true);
    expect(ruleMatches(rule({ days: [7] }), at(MON, 12))).toBe(false);
    expect(ruleMatches(rule({ days: [1] }), at(MON, 12))).toBe(true);
    expect(ruleMatches(rule({ days: [1] }), at(SUN, 12))).toBe(false);
  });

  it('includes the start and excludes the end', () => {
    const r = rule({ start: '11:00', end: '14:00' });
    expect(ruleMatches(r, at(MON, 10, 59))).toBe(false);
    expect(ruleMatches(r, at(MON, 11, 0))).toBe(true);
    expect(ruleMatches(r, at(MON, 13, 59))).toBe(true);
    expect(ruleMatches(r, at(MON, 14, 0))).toBe(false);
  });

  it('ignores the seconds: the minute of the end is already over', () => {
    const r = rule({ start: '11:00', end: '14:00' });
    expect(ruleMatches(r, at(MON, 13, 59, 59))).toBe(true);
    expect(ruleMatches(r, at(MON, 14, 0, 30))).toBe(false);
  });

  it('accepts a single digit hour', () => {
    expect(ruleMatches(rule({ start: '7:00', end: '9:00' }), at(MON, 8))).toBe(true);
  });

  it('keeps the dates inclusive', () => {
    const r = rule({ from: '2026-11-03', to: '2026-11-05' });
    expect(ruleMatches(r, at(MON, 12))).toBe(false);
    expect(ruleMatches(r, at(TUE, 0, 0))).toBe(true);
    expect(ruleMatches(r, at(THU, 23, 59))).toBe(true);
    expect(ruleMatches(r, at(FRI, 0, 0))).toBe(false);
  });

  it('takes a date range with one bound only', () => {
    expect(ruleMatches(rule({ from: '2026-11-04' }), at(TUE, 12))).toBe(false);
    expect(ruleMatches(rule({ from: '2026-11-04' }), at(WED, 12))).toBe(true);
    expect(ruleMatches(rule({ from: '2026-11-04' }), at(1, 12, 0, 0, 12))).toBe(true);
    expect(ruleMatches(rule({ to: '2026-11-04' }), at(WED, 12))).toBe(true);
    expect(ruleMatches(rule({ to: '2026-11-04' }), at(THU, 12))).toBe(false);
  });

  it('compares dates across months and years', () => {
    const r = rule({ from: '2026-12-25', to: '2027-01-02' });
    expect(ruleMatches(r, at(24, 12, 0, 0, 12, 2026))).toBe(false);
    expect(ruleMatches(r, at(31, 12, 0, 0, 12, 2026))).toBe(true);
    expect(ruleMatches(r, at(2, 12, 0, 0, 1, 2027))).toBe(true);
    expect(ruleMatches(r, at(3, 12, 0, 0, 1, 2027))).toBe(false);
  });

  describe('past midnight (Friday 22:00 to 02:00)', () => {
    const r = rule({ days: [5], start: '22:00', end: '02:00' });

    it('plays on the evening of the listed day', () => {
      expect(ruleMatches(r, at(FRI, 21, 59))).toBe(false);
      expect(ruleMatches(r, at(FRI, 22, 0))).toBe(true);
      expect(ruleMatches(r, at(FRI, 23, 59))).toBe(true);
    });

    it('goes on after midnight, on the next day, until the end', () => {
      expect(ruleMatches(r, at(SAT, 0, 0))).toBe(true);
      expect(ruleMatches(r, at(SAT, 1, 59))).toBe(true);
      expect(ruleMatches(r, at(SAT, 2, 0))).toBe(false);
    });

    it('does not play the morning of the listed day, nor the evening of the next', () => {
      expect(ruleMatches(r, at(FRI, 1, 30))).toBe(false);
      expect(ruleMatches(r, at(SAT, 23, 0))).toBe(false);
    });

    it('follows the day across a month boundary', () => {
      const sunday = rule({ days: [7], start: '22:00', end: '06:00' });
      expect(ruleMatches(sunday, at(2, 1, 0))).toBe(true); // Monday 2 Nov 01:00, Sunday 1 Nov's rule
      // 31 Dec 2026 is a Thursday: its 23:00-01:00 rule goes on into Friday 1 Jan 2027, over the new year
      const thursday = rule({ days: [4], start: '23:00', end: '01:00' });
      expect(ruleMatches(thursday, at(1, 0, 30, 0, 1, 2027))).toBe(true);
      expect(ruleMatches(thursday, at(1, 1, 0, 0, 1, 2027))).toBe(false);
      const wednesday = rule({ days: [3], start: '23:00', end: '01:00' });
      expect(ruleMatches(wednesday, at(1, 0, 30, 0, 1, 2027))).toBe(false);
    });

    it('checks the dates against the day the rule started on', () => {
      const dated = rule({ days: [5], start: '22:00', end: '02:00', from: '2026-11-06', to: '2026-11-06' });
      expect(ruleMatches(dated, at(FRI, 23, 0))).toBe(true);
      expect(ruleMatches(dated, at(SAT, 1, 0))).toBe(true); // Saturday 7 Nov is outside the dates, the rule began on the 6th
      expect(ruleMatches(dated, at(SAT, 23, 0))).toBe(false);
    });
  });

  describe('a malformed rule never matches', () => {
    it.each([
      ['days is not a list', rule({ days: 'all' })],
      ['days is missing', { playlist: 'lunch' }],
      ['only a start', rule({ start: '09:00' })],
      ['only an end', rule({ end: '09:00' })],
      ['a time that is not one', rule({ start: '25:00', end: '09:00' })],
      ['minutes out of range', rule({ start: '09:60', end: '10:00' })],
      ['text for a time', rule({ start: 'noon', end: '14:00' })],
      ['an empty slot', rule({ start: '09:00', end: '09:00' })],
      ['a date that is not one', rule({ from: '01/11/2026' })],
      ['a date bound of the wrong type', rule({ to: 20261105 })],
    ])('%s', (_name, bad) => {
      expect(ruleMatches(bad as any, at(MON, 9, 0))).toBe(false);
      expect(ruleMatches(bad as any, at(WED, 12, 0))).toBe(false);
    });

    it('null and undefined are not rules', () => {
      expect(ruleMatches(null as any, at(MON))).toBe(false);
      expect(ruleMatches(undefined as any, at(MON))).toBe(false);
    });
  });
});

describe('activePlaylistId', () => {
  const playlists = { menu: { name: 'Menu', items: [] }, lunch: { name: 'Lunch', items: [] }, promo: { name: 'Promo', items: [] } };

  it('plays the first rule that matches', () => {
    const schedule = {
      default_playlist: 'menu',
      playlists,
      rules: [
        rule({ playlist: 'promo', days: [1], start: '12:00', end: '13:00' }),
        rule({ playlist: 'lunch', start: '11:00', end: '14:00' }),
      ],
    };
    expect(activePlaylistId(schedule, at(MON, 12, 30))).toBe('promo');
    expect(activePlaylistId(schedule, at(MON, 11, 30))).toBe('lunch');
    expect(activePlaylistId(schedule, at(TUE, 12, 30))).toBe('lunch');
    expect(activePlaylistId(schedule, at(MON, 15, 0))).toBe('menu');
  });

  it('follows the order it was given, not the priority number', () => {
    const schedule = {
      default_playlist: null,
      playlists,
      rules: [rule({ playlist: 'lunch', priority: 1 }), rule({ playlist: 'promo', priority: 9 })],
    };
    expect(activePlaylistId(schedule, at(MON, 12))).toBe('lunch');
  });

  it('falls back to the default playlist when nothing is due', () => {
    const schedule = { default_playlist: 'menu', playlists, rules: [rule({ start: '11:00', end: '14:00' })] };
    expect(activePlaylistId(schedule, at(MON, 9))).toBe('menu');
  });

  it('is a blank screen when nothing is due and there is no default', () => {
    const schedule = { default_playlist: null, playlists, rules: [rule({ start: '11:00', end: '14:00' })] };
    expect(activePlaylistId(schedule, at(MON, 9))).toBeNull();
  });

  it('skips a rule whose playlist is not in the schedule', () => {
    const schedule = {
      default_playlist: 'menu',
      playlists,
      rules: [rule({ playlist: 'ghost' }), rule({ playlist: 'lunch', start: '11:00', end: '14:00' })],
    };
    expect(activePlaylistId(schedule, at(MON, 12))).toBe('lunch');
    expect(activePlaylistId(schedule, at(MON, 9))).toBe('menu');
  });

  it('is blank when the default playlist is not in the schedule either', () => {
    expect(activePlaylistId({ default_playlist: 'ghost', playlists, rules: [] }, at(MON))).toBeNull();
  });

  it('does not let one malformed rule stop the others', () => {
    const schedule = {
      default_playlist: 'menu',
      playlists,
      rules: [rule({ days: 'x' }), rule({ start: '25:00', end: '26:00' }), rule({ playlist: 'promo', days: [1] })],
    };
    expect(activePlaylistId(schedule, at(MON, 10))).toBe('promo');
  });

  it('copes with a schedule that is not well formed', () => {
    expect(activePlaylistId(null as any, at(MON))).toBeNull();
    expect(activePlaylistId({} as any, at(MON))).toBeNull();
    expect(activePlaylistId({ default_playlist: 'menu', playlists, rules: 'no' } as any, at(MON))).toBe('menu');
  });
});
