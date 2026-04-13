import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
import type { EventStatus } from '@/types';

const STATUS_CONFIG: Record<EventStatus, {
  fg: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = {
  live: { fg: colors.error, icon: 'radio' },
  upcoming: { fg: colors.primary, icon: 'time-outline' },
  past: { fg: colors.textMuted, icon: 'checkmark-circle-outline' },
  recurring: { fg: colors.success, icon: 'repeat' },
};

export function EventTag({ status }: { status: EventStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <Ionicons name={config.icon} size={14} color={config.fg} />
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});
