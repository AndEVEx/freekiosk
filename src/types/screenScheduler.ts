/**
 * FreeKiosk v1.3 - Screen Sleep Scheduler Types
 * Allows defining automatic screen-off/on times to save energy
 */

export interface DaySchedule {
  day: number;          // 0=Minggu/Sun, 1=Senin/Mon, ..., 6=Sabtu/Sat
  name: string;         // e.g. "Senin", "Selasa", etc.
  enabled: boolean;     // true = Tablet aktif/nyala hari ini, false = Libur/mati seharian
  onTime: string;       // "HH:MM" — Jam Layar Nyala (contoh: "06:30")
  offTime: string;      // "HH:MM" — Jam Layar Mati (contoh: "16:00")
}

export const DEFAULT_DAY_SCHEDULES: DaySchedule[] = [
  { day: 1, name: 'Senin', enabled: true, onTime: '06:30', offTime: '16:00' },
  { day: 2, name: 'Selasa', enabled: true, onTime: '06:30', offTime: '16:00' },
  { day: 3, name: 'Rabu', enabled: true, onTime: '06:30', offTime: '16:00' },
  { day: 4, name: 'Kamis', enabled: true, onTime: '06:30', offTime: '16:00' },
  { day: 5, name: 'Jumat', enabled: true, onTime: '06:30', offTime: '15:30' },
  { day: 6, name: 'Sabtu', enabled: false, onTime: '06:30', offTime: '13:00' },
  { day: 0, name: 'Minggu', enabled: false, onTime: '06:30', offTime: '16:00' },
];

export interface ScreenScheduleRule {
  id: string;
  name: string;                  // e.g., "Night (weekdays)", "Weekend"
  enabled: boolean;
  days: number[];                // [0=Sun, 1=Mon, ..., 6=Sat]
  sleepTime: string;             // "HH:MM" - screen off time
  wakeTime: string;              // "HH:MM" - screen on time
}

export interface ScreenSchedulerConfig {
  enabled: boolean;
  rules: ScreenScheduleRule[];
  dailySchedules?: DaySchedule[];
  wakeOnTouch: boolean;          // Allow waking screen by touching during sleep window
}

// Day names for UI
export const DAY_NAMES_SHORT = ['M', 'S', 'S', 'R', 'K', 'J', 'S'];
export const DAY_NAMES_FULL = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/**
 * Generate unique rule ID
 */
export const generateRuleId = (): string => {
  return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Validate time format HH:MM
 */
export const isValidTime = (time: string): boolean => {
  const regex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
  return regex.test(time);
};

/**
 * Get current time as "HH:MM" string
 */
export const getCurrentTimeString = (now?: Date): string => {
  const d = now || new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

/**
 * Parse "HH:MM" into { hours, minutes }
 */
export const parseTime = (time: string): { hours: number; minutes: number } => {
  const [h, m] = time.split(':').map(Number);
  return { hours: h, minutes: m };
};

/**
 * Check if the tablet screen should be ON right now according to the daily schedule.
 * Returns true if the screen should be ON (active).
 * Returns false if the screen should be OFF (sleeping / outside active hours / holiday).
 */
export const shouldScreenBeOnDailySchedule = (schedules: DaySchedule[], now?: Date): boolean => {
  if (!schedules || schedules.length === 0) return true;

  const d = now || new Date();
  const currentDay = d.getDay(); // 0=Sun/Minggu, 1=Mon/Senin, ..., 6=Sat/Sabtu
  const currentTime = getCurrentTimeString(d);

  const dayConfig = schedules.find(s => s.day === currentDay);
  if (!dayConfig || !dayConfig.enabled) {
    // Hari libur / tidak aktif -> layar MATI
    return false;
  }

  const { onTime, offTime } = dayConfig;
  if (!isValidTime(onTime) || !isValidTime(offTime)) return true;
  if (onTime === offTime) return false;

  if (onTime < offTime) {
    // Jam aktif normal dalam 1 hari (contoh 06:30 s/d 16:00)
    return currentTime >= onTime && currentTime < offTime;
  } else {
    // Shift malam melewati tengah malam (contoh 20:00 s/d 04:00)
    return currentTime >= onTime || currentTime < offTime;
  }
};

/**
 * Compute the next time the screen should turn ON (Wake) based on daily schedule.
 */
export const getNextDailyWakeTime = (schedules: DaySchedule[], now?: Date): Date | null => {
  if (!schedules || schedules.length === 0) return null;

  const d = now || new Date();

  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(d);
    candidate.setDate(candidate.getDate() + offset);
    const candidateDay = candidate.getDay();
    const dayConfig = schedules.find(s => s.day === candidateDay);

    if (dayConfig && dayConfig.enabled && isValidTime(dayConfig.onTime)) {
      const { hours, minutes } = parseTime(dayConfig.onTime);
      candidate.setHours(hours, minutes, 0, 0);

      if (candidate > d) {
        return candidate;
      }
    }
  }

  return null;
};

/**
 * Compute the next time the screen should turn OFF (Sleep) based on daily schedule.
 */
export const getNextDailySleepTime = (schedules: DaySchedule[], now?: Date): Date | null => {
  if (!schedules || schedules.length === 0) return null;

  const d = now || new Date();

  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(d);
    candidate.setDate(candidate.getDate() + offset);
    const candidateDay = candidate.getDay();
    const dayConfig = schedules.find(s => s.day === candidateDay);

    if (dayConfig && dayConfig.enabled && isValidTime(dayConfig.offTime)) {
      const { hours, minutes } = parseTime(dayConfig.offTime);
      candidate.setHours(hours, minutes, 0, 0);

      if (candidate > d) {
        return candidate;
      }
    }
  }

  return null;
};

/**
 * Check if the current time falls within a sleep window for a given rule.
 * Legacy support.
 */
export const isRuleActiveNow = (rule: ScreenScheduleRule, now?: Date): boolean => {
  if (!rule.enabled) return false;

  const d = now || new Date();
  const currentDay = d.getDay(); // 0=Sun, 6=Sat

  const currentTime = getCurrentTimeString(d);
  const { sleepTime, wakeTime, days } = rule;

  if (!isValidTime(sleepTime) || !isValidTime(wakeTime)) return false;
  if (sleepTime === wakeTime) return false;

  if (sleepTime < wakeTime) {
    if (!days.includes(currentDay)) return false;
    return currentTime >= sleepTime && currentTime < wakeTime;
  } else {
    if (currentTime >= sleepTime) {
      return days.includes(currentDay);
    }
    if (currentTime < wakeTime) {
      const yesterday = (currentDay + 6) % 7;
      return days.includes(yesterday);
    }
    return false;
  }
};

/**
 * Check if the screen should be sleeping based on all enabled rules.
 */
export const getActiveSleepRule = (rules: ScreenScheduleRule[], now?: Date): ScreenScheduleRule | null => {
  for (const rule of rules) {
    if (isRuleActiveNow(rule, now)) {
      return rule;
    }
  }
  return null;
};

export const isInSleepWindow = (rules: ScreenScheduleRule[], now?: Date): boolean => {
  return getActiveSleepRule(rules, now) !== null;
};

export const getDaysDisplayString = (days: number[]): string => {
  if (days.length === 0) return 'No days';
  if (days.length === 7) return 'Setiap Hari';
  if (days.length === 5 && !days.includes(0) && !days.includes(6)) return 'Senin - Jumat';
  if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Akhir Pekan (Sabtu - Minggu)';

  return days
    .sort((a, b) => a - b)
    .map(d => DAY_NAMES_FULL[d].substring(0, 3))
    .join(', ');
};

export const createDefaultRule = (name?: string): ScreenScheduleRule => ({
  id: generateRuleId(),
  name: name || 'Jadwal Malam',
  enabled: true,
  days: [1, 2, 3, 4, 5],
  sleepTime: '16:00',
  wakeTime: '06:30',
});

export const getNextWakeTime = (rule: ScreenScheduleRule, now?: Date): Date | null => {
  if (!rule.enabled || !isValidTime(rule.wakeTime)) return null;
  
  const d = now || new Date();
  const { hours, minutes } = parseTime(rule.wakeTime);
  const currentTime = getCurrentTimeString(d);

  if (rule.sleepTime < rule.wakeTime) {
    const wakeDate = new Date(d);
    wakeDate.setHours(hours, minutes, 0, 0);
    if (wakeDate > d) return wakeDate;
    return getNextTimeOnScheduledDay(rule.wakeTime, rule.days, d, 1);
  } else {
    if (currentTime >= rule.sleepTime) {
      const wakeDate = new Date(d);
      wakeDate.setDate(wakeDate.getDate() + 1);
      wakeDate.setHours(hours, minutes, 0, 0);
      return wakeDate;
    } else if (currentTime < rule.wakeTime) {
      const wakeDate = new Date(d);
      wakeDate.setHours(hours, minutes, 0, 0);
      return wakeDate;
    }
  }
  
  return null;
};

export const getNextSleepTime = (rules: ScreenScheduleRule[], now?: Date): { date: Date; rule: ScreenScheduleRule } | null => {
  const d = now || new Date();
  let earliest: { date: Date; rule: ScreenScheduleRule } | null = null;

  for (const rule of rules) {
    if (!rule.enabled || !isValidTime(rule.sleepTime)) continue;
    
    const nextSleep = getNextTimeOnScheduledDay(rule.sleepTime, rule.days, d, 0);
    if (nextSleep && (!earliest || nextSleep < earliest.date)) {
      earliest = { date: nextSleep, rule };
    }
  }

  return earliest;
};

const getNextTimeOnScheduledDay = (time: string, days: number[], from: Date, startOffset: number): Date | null => {
  const { hours, minutes } = parseTime(time);
  
  for (let offset = startOffset; offset <= 7; offset++) {
    const candidate = new Date(from);
    candidate.setDate(candidate.getDate() + offset);
    candidate.setHours(hours, minutes, 0, 0);
    
    if (candidate <= from) continue;
    if (days.includes(candidate.getDay())) {
      return candidate;
    }
  }

  return null;
};
