import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
import type { EventStatus } from '@/types';

/**
 * Compact status indicator. `live` renders as a small red dot (matching
 * the live-stream visual language used everywhere else); the other
 * statuses keep their Ionicons.
 */
export function EventTag({ status }: { status: EventStatus }) {
  if (status === 'live') {
    return <View style={styles.liveDot} accessibilityLabel="Live now" />;
  }

  const config = {
    upcoming: { fg: colors.primary, icon: 'time-outline' as const },
    past: { fg: colors.textMuted, icon: 'checkmark-circle-outline' as const },
    recurring: { fg: colors.success, icon: 'repeat' as const },
  }[status];

  return <Ionicons name={config.icon} size={14} color={config.fg} />;
}

const styles = StyleSheet.create({
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
});
