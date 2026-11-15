/**
 * FreeKiosk - DailyScheduleEditor Component
 * Manage per-day tablet screen on/off schedule (Senin - Minggu)
 * Supports multiple active intervals (e.g. Sesi 1 Pagi & Sesi 2 Sore) to save battery.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';
import Icon from '../Icon';
import TimeInput from './TimeInput';
import { DaySchedule, DEFAULT_DAY_SCHEDULES } from '../../types/screenScheduler';

interface DailyScheduleEditorProps {
  schedules: DaySchedule[];
  onChange: (schedules: DaySchedule[]) => void;
}

const DailyScheduleEditor: React.FC<DailyScheduleEditorProps> = ({
  schedules,
  onChange,
}) => {
  const currentSchedules = (schedules && schedules.length === 7 ? schedules : DEFAULT_DAY_SCHEDULES).map(item => {
    const def = DEFAULT_DAY_SCHEDULES.find(d => d.day === item.day) || item;
    return {
      ...def,
      ...item,
      enableSession2: item.enableSession2 ?? def.enableSession2 ?? false,
      onTime2: item.onTime2 || def.onTime2 || '14:45',
      offTime2: item.offTime2 || def.offTime2 || '17:00',
    };
  });

  const handleUpdateDay = (dayIndex: number, updates: Partial<DaySchedule>) => {
    const updated = currentSchedules.map(item => {
      if (item.day === dayIndex) {
        return { ...item, ...updates };
      }
      return item;
    });
    onChange(updated);
  };

  const applySchoolPreset = () => {
    onChange([
      // Senin - Kamis: nyala1 05:30, mati1 08:30, nyala2 14:45, mati2 17:00
      { day: 1, name: 'Senin', enabled: true, onTime: '05:30', offTime: '08:30', enableSession2: true, onTime2: '14:45', offTime2: '17:00' },
      { day: 2, name: 'Selasa', enabled: true, onTime: '05:30', offTime: '08:30', enableSession2: true, onTime2: '14:45', offTime2: '17:00' },
      { day: 3, name: 'Rabu', enabled: true, onTime: '05:30', offTime: '08:30', enableSession2: true, onTime2: '14:45', offTime2: '17:00' },
      { day: 4, name: 'Kamis', enabled: true, onTime: '05:30', offTime: '08:30', enableSession2: true, onTime2: '14:45', offTime2: '17:00' },
      // Khusus Jumat: nyala1 05:30, mati1 08:30, nyala2 11:30, mati2 15:30
      { day: 5, name: 'Jumat', enabled: true, onTime: '05:30', offTime: '08:30', enableSession2: true, onTime2: '11:30', offTime2: '15:30' },
      // Libur
      { day: 6, name: 'Sabtu', enabled: false, onTime: '06:30', offTime: '13:00', enableSession2: false, onTime2: '14:00', offTime2: '17:00' },
      { day: 0, name: 'Minggu', enabled: false, onTime: '06:30', offTime: '16:00', enableSession2: false, onTime2: '14:00', offTime2: '17:00' },
    ]);
  };

  const applyEverydayPreset = () => {
    onChange(
      currentSchedules.map(item => ({
        ...item,
        enabled: true,
        onTime: '06:30',
        offTime: '16:00',
        enableSession2: false,
      }))
    );
  };

  // Sort: Senin (1) to Sabtu (6) then Minggu (0)
  const sortedDays = [...currentSchedules].sort((a, b) => {
    const orderA = a.day === 0 ? 7 : a.day;
    const orderB = b.day === 0 ? 7 : b.day;
    return orderA - orderB;
  });

  return (
    <View style={styles.container}>
      {/* Preset Buttons */}
      <View style={styles.presetContainer}>
        <TouchableOpacity style={styles.presetButton} onPress={applySchoolPreset}>
          <Icon name="school-outline" size={16} color={Colors.primary} />
          <Text style={styles.presetButtonText}>Preset Jam Sekolah (Damay SMKN 2)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.presetButton} onPress={applyEverydayPreset}>
          <Icon name="calendar-outline" size={16} color={Colors.primary} />
          <Text style={styles.presetButtonText}>Setiap Hari Penuh</Text>
        </TouchableOpacity>
      </View>

      {/* Day Cards */}
      {sortedDays.map(item => (
        <View key={item.day} style={[styles.dayCard, !item.enabled && styles.dayCardDisabled]}>
          <View style={styles.dayHeader}>
            <View style={styles.dayTitleRow}>
              <Text style={styles.dayName}>{item.name}</Text>
              <View style={[styles.badge, item.enabled ? styles.badgeActive : styles.badgeInactive]}>
                <Text style={[styles.badgeText, item.enabled ? styles.badgeTextActive : styles.badgeTextInactive]}>
                  {item.enabled ? 'AKTIF' : 'LIBUR / MATI'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.toggleButton, item.enabled ? styles.toggleActive : styles.toggleInactive]}
              onPress={() => handleUpdateDay(item.day, { enabled: !item.enabled })}
            >
              <Text style={styles.toggleText}>{item.enabled ? 'Nonaktifkan' : 'Aktifkan'}</Text>
            </TouchableOpacity>
          </View>

          {item.enabled ? (
            <View style={styles.scheduleBody}>
              {/* Sesi 1 (Pagi) */}
              <View style={styles.sessionSection}>
                <Text style={styles.sessionLabel}>Sesi 1 (Pagi / Masuk):</Text>
                <View style={styles.timeRow}>
                  <View style={styles.timeCol}>
                    <TimeInput
                      label="Nyala 1"
                      value={item.onTime}
                      onChange={time => handleUpdateDay(item.day, { onTime: time })}
                    />
                  </View>
                  <View style={styles.timeArrow}>
                    <Text style={styles.arrowText}>— s/d —</Text>
                  </View>
                  <View style={styles.timeCol}>
                    <TimeInput
                      label="Mati 1"
                      value={item.offTime}
                      onChange={time => handleUpdateDay(item.day, { offTime: time })}
                    />
                  </View>
                </View>
              </View>

              {/* Sesi 2 (Sore / Pulang) */}
              <View style={styles.sessionSection}>
                <View style={styles.sessionHeaderRow}>
                  <Text style={styles.sessionLabel}>Sesi 2 (Siang / Sore):</Text>
                  <TouchableOpacity
                    style={[styles.miniBadgeToggle, item.enableSession2 ? styles.miniBadgeActive : styles.miniBadgeInactive]}
                    onPress={() => handleUpdateDay(item.day, { enableSession2: !item.enableSession2 })}
                  >
                    <Text style={styles.miniBadgeText}>
                      {item.enableSession2 ? 'Aktif (Ada Sesi 2)' : '+ Tambah Sesi 2'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {item.enableSession2 && (
                  <View style={styles.timeRow}>
                    <View style={styles.timeCol}>
                      <TimeInput
                        label="Nyala 2"
                        value={item.onTime2 || '14:45'}
                        onChange={time => handleUpdateDay(item.day, { onTime2: time })}
                      />
                    </View>
                    <View style={styles.timeArrow}>
                      <Text style={styles.arrowText}>— s/d —</Text>
                    </View>
                    <View style={styles.timeCol}>
                      <TimeInput
                        label="Mati 2"
                        value={item.offTime2 || '17:00'}
                        onChange={time => handleUpdateDay(item.day, { offTime2: time })}
                      />
                    </View>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <Text style={styles.disabledHint}>Tablet akan mati / layar padam sepanjang hari.</Text>
          )}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.sm,
  },
  presetContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  presetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceVariant,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.xs,
  },
  presetButtonText: {
    ...Typography.caption,
    color: Colors.primary,
    fontWeight: '700',
  },
  dayCard: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dayCardDisabled: {
    opacity: 0.65,
    backgroundColor: Colors.surfaceVariant,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dayName: {
    ...Typography.subtitle,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeActive: {
    backgroundColor: Colors.successLight || '#E8F5E9',
  },
  badgeInactive: {
    backgroundColor: Colors.surfaceVariant,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextActive: {
    color: Colors.successDark || '#2E7D32',
  },
  badgeTextInactive: {
    color: Colors.textSecondary,
  },
  toggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  toggleActive: {
    backgroundColor: Colors.surfaceVariant,
  },
  toggleInactive: {
    backgroundColor: Colors.primary,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  scheduleBody: {
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  sessionSection: {
    backgroundColor: Colors.surfaceVariant,
    padding: Spacing.sm,
    borderRadius: 8,
  },
  sessionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sessionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  miniBadgeToggle: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  miniBadgeActive: {
    backgroundColor: Colors.primaryLight || '#E3F2FD',
  },
  miniBadgeInactive: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  miniBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  timeCol: {
    flex: 1,
  },
  timeArrow: {
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowText: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  disabledHint: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    fontStyle: 'italic',
  },
});

export default DailyScheduleEditor;
