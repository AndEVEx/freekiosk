/**
 * FreeKiosk v1.3 - Screen Sleep Scheduler Types
 * Allows defining automatic screen-off/on times to save energy
 */

export interface DaySchedule {
  day: number;          // 0=Minggu/Sun, 1=Senin/Mon, ..., 6=Sabtu/Sat
  name: string;         // e.g. "Senin", "Selasa", etc.
  enabled: boolean;     // true = Tablet aktif/nyala hari ini, false = Libur/mati seharian
  onTime: string;       // "HH:MM" — Sesi 1: Jam Layar Nyala (contoh: "05:30")
  offTime: string;      // "HH:MM" — Sesi 1: Jam Layar Mati (contoh: "08:30")
  enableSession2?: boolean; // Aktifkan sesi kedua dalam hari yang sama
  onTime2?: string;     // "HH:MM" — Sesi 2: Jam Layar Nyala (contoh: "14:45")
  offTime2?: string;    // "HH:MM" — Sesi 2: Jam Layar Mati (contoh: "17:00")
}

export const DEFAULT_DAY_SCHEDULES: DaySchedule[] = [
  // Senin - Kamis: nyala1 05:30, mati1 08:30, nyala2: 14:45, mati2: 17:00
  { day: 1, name: 'Senin', enabled: true, onTime: '05:30', offTime: '08:30', enableSession2: true, onTime2: '14:45', offTime2: '17:00' },
  { day: 2, name: 'Selasa', enabled: true, onTime: '05:30', offTime: '08:30', enableSession2: true, onTime2: '14:45', offTime2: '17:00' },
  { day: 3, name: 'Rabu', enabled: true, onTime: '05:30', offTime: '08:30', enableSession2: true, onTime2: '14:45', offTime2: '17:00' },
  { day: 4, name: 'Kamis', enabled: true, onTime: '05:30', offTime: '08:30', enableSession2: true, onTime2: '14:45', offTime2: '17:00' },
  // Khusus Jumat: nyala1 05:30, mati1 08:30, nyala2: 11:30, mati2: 15:30
  { day: 5, name: 'Jumat', enabled: true, onTime: '05:30', offTime: '08:30', enableSession2: true, onTime2: '11:30', offTime2: '15:30' },
  // Libur
  { day: 6, name: 'Sabtu', enabled: false, onTime: '06:30', offTime: '13:00', enableSession2: false, onTime2: '14:00', offTime2: '17:00' },
  { day: 0, name: 'Minggu', enabled: false, onTime: '06:30', offTime: '16:00', enableSession2: false, onTime2: '14:00', offTime2: '17:00' },
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
export const isValidTime = (time?: string): boolean => {
  if (!time) return false;
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
 * Check if currentTime falls within onTime .. offTime interval
 */
const isTimeInWindow = (current: string, start: string, end: string): boolean => {
  if (!isValidTime(start) || !isValidTime(end) || start === end) return false;
  if (start < end) {
    return current >= start && current < end;
  } else {
    return current >= start || current < end;
  }
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

  // Sesi 1
  if (isTimeInWindow(currentTime, dayConfig.onTime, dayConfig.offTime)) {
    return true;
  }

  // Sesi 2 (jika diaktifkan)
  if (dayConfig.enableSession2 && dayConfig.onTime2 && dayConfig.offTime2) {
    if (isTimeInWindow(currentTime, dayConfig.onTime2, dayConfig.offTime2)) {
      return true;
    }
  }

  return false;
};

/**
 * Compute the next time the screen should turn ON (Wake) based on daily schedule.
 */
export const getNextDailyWakeTime = (schedules: DaySchedule[], now?: Date): Date | null => {
  if (!schedules || schedules.length === 0) return null;

  const d = now || new Date();

  for (let offset = 0; offset <= 7; offset++) {
    const candidateDay = (d.getDay() + offset) % 7;
    const dayConfig = schedules.find(s => s.day === candidateDay);

    if (dayConfig && dayConfig.enabled) {
      const timesToCheck: string[] = [];
      if (isValidTime(dayConfig.onTime)) timesToCheck.push(dayConfig.onTime);
      if (dayConfig.enableSession2 && isValidTime(dayConfig.onTime2)) {
        timesToCheck.push(dayConfig.onTime2!);
      }

      for (const timeStr of timesToCheck) {
        const candidate = new Date(d);
        candidate.setDate(candidate.getDate() + offset);
        const { hours, minutes } = parseTime(timeStr);
        candidate.setHours(hours, minutes, 0, 0);

        if (candidate > d) {
          return candidate;
        }
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
    const candidateDay = (d.getDay() + offset) % 7;
    const dayConfig = schedules.find(s => s.day === candidateDay);

    if (dayConfig && dayConfig.enabled) {
      const timesToCheck: string[] = [];
      if (isValidTime(dayConfig.offTime)) timesToCheck.push(dayConfig.offTime);
      if (dayConfig.enableSession2 && isValidTime(dayConfig.offTime2)) {
        timesToCheck.push(dayConfig.offTime2!);
      }

      for (const timeStr of timesToCheck) {
        const candidate = new Date(d);
        candidate.setDate(candidate.getDate() + offset);
        const { hours, minutes } = parseTime(timeStr);
        candidate.setHours(hours, minutes, 0, 0);

        if (candidate > d) {
          return candidate;
        }
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
    } else if (currentTime < wakeTime) {
      const prevDay = currentDay === 0 ? 6 : currentDay - 1;
      return days.includes(prevDay);
    }
  }

  return false;
};

/**
 * Check if any rule in the list is currently active (screen should be off).
 */
export const isAnyRuleActiveNow = (rules: ScreenScheduleRule[], now?: Date): boolean => {
  return rules.some(rule => isRuleActiveNow(rule, now));
};

/**
 * Get the currently active sleep rule, if any.
 */
export const getActiveSleepRule = (rules: ScreenScheduleRule[], now?: Date): ScreenScheduleRule | null => {
  return rules.find(rule => isRuleActiveNow(rule, now)) || null;
};

/**
 * Compute the next Date when the screen should wake up for a given rule.
 */
export const getNextWakeTime = (rule: ScreenScheduleRule, now?: Date): Date | null => {
  if (!rule.enabled || !isValidTime(rule.wakeTime)) return null;

  const d = now || new Date();
  const { hours, minutes } = parseTime(rule.wakeTime);

  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(d);
    candidate.setDate(candidate.getDate() + offset);
    candidate.setHours(hours, minutes, 0, 0);

    if (candidate > d) {
      return candidate;
    }
  }

  return null;
};

/**
 * Compute the next sleep event across all rules.
 */
export const getNextSleepTime = (
  rules: ScreenScheduleRule[],
  now?: Date
): { date: Date; rule: ScreenScheduleRule } | null => {
  const d = now || new Date();
  let nearest: { date: Date; rule: ScreenScheduleRule } | null = null;

  for (const rule of rules) {
    if (!rule.enabled || !isValidTime(rule.sleepTime)) continue;

    const { hours, minutes } = parseTime(rule.sleepTime);

    for (let offset = 0; offset <= 7; offset++) {
      const candidate = new Date(d);
      candidate.setDate(candidate.getDate() + offset);
      const dayOfWeek = candidate.getDay();

      if (!rule.days.includes(dayOfWeek)) continue;

      candidate.setHours(hours, minutes, 0, 0);

      if (candidate > d) {
        if (!nearest || candidate < nearest.date) {
          nearest = { date: candidate, rule };
        }
        break;
      }
    }
  }

  return nearest;
};
