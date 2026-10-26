/**
 * FreeKiosk - DailyScheduleEditor Component
 * Manage per-day tablet screen on/off schedule (Senin - Minggu)
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
  const currentSchedules = schedules && schedules.length === 7 ? schedules : DEFAULT_DAY_SCHEDULES;

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
      { day: 1, name: 'Senin', enabled: true, onTime: '06:30', offTime: '16:00' },
      { day: 2, name: 'Selasa', enabled: true, onTime: '06:30', offTime: '16:00' },
      { day: 3, name: 'Rabu', enabled: true, onTime: '06:30', offTime: '16:00' },
      { day: 4, name: 'Kamis', enabled: true, onTime: '06:30', offTime: '16:00' },
      { day: 5, name: 'Jumat', enabled: true, onTime: '06:30', offTime: '15:30' },
      { day: 6, name: 'Sabtu', enabled: false, onTime: '06:30', offTime: '13:00' },
      { day: 0, name: 'Minggu', enabled: false, onTime: '06:30', offTime: '16:00' },
    ]);
  };

  const applyEverydayPreset = () => {
    onChange(
      currentSchedules.map(item => ({
        ...item,
        enabled: true,
        onTime: '06:30',
        offTime: '16:00',
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
          <Text style={styles.presetButtonText}>Preset Jam Sekolah (Senin-Jumat)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.presetButton} onPress={applyEverydayPreset}>
          <Icon name="calendar-outline" size={16} color={Colors.primary} />
          <Text style={styles.presetButtonText}>Setiap Hari</Text>
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
            <View style={styles.timeRow}>
              <View style={styles.timeCol}>
                <TimeInput
                  label="Jam Layar Nyala"
                  value={item.onTime}
                  onChange={time => handleUpdateDay(item.day, { onTime: time })}
                />
              </View>
              <View style={styles.timeArrow}>
                <Text style={styles.arrowText}>— s/d —</Text>
              </View>
              <View style={styles.timeCol}>
                <TimeInput
                  label="Jam Layar Mati"
                  value={item.offTime}
                  onChange={time => handleUpdateDay(item.day, { offTime: time })}
                />
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
    paddingVertical: Spacing.xs + 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.xs,
  },
  presetButtonText: {
    ...Typography.caption,
    color: Colors.primary,
    fontWeight: '600',
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
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  badgeInactive: {
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  badgeTextActive: {
    color: '#16a34a',
  },
  badgeTextInactive: {
    color: Colors.textSecondary,
  },
  toggleButton: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs,
    borderRadius: 6,
  },
  toggleActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  toggleInactive: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  timeCol: {
    flex: 1,
  },
  timeArrow: {
    paddingTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  disabledHint: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: Spacing.xs,
  },
});

export default DailyScheduleEditor;
