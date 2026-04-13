import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '@/theme';
import type { EventStatus } from '@/types';

const STATUS_CONFIG: Record<EventStatus, {
  label: string;
  bg: string;
  fg: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = {
  live: { label: 'LIVE', bg: '#EF444420', fg: colors.error, icon: 'radio' },
  upcoming: { label: 'UPCOMING', bg: '#7C3AED20', fg: colors.primary, icon: 'time-outline' },
  past: { label: 'ENDED', bg: '#6B6B8020', fg: colors.textMuted, icon: 'checkmark-circle-outline' },
  recurring: { label: 'RECURRING', bg: '#22C55E20', fg: colors.success, icon: 'repeat' },
};

export function EventTag({ status }: { status: EventStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <View style={[styles.tag, { backgroundColor: config.bg }]}>
      <Ionicons name={config.icon} size={10} color={config.fg} />
      <Text style={[styles.label, { color: config.fg }]}>{config.label}</Text>
      {status === 'live' && <View style={[styles.liveDot, { backgroundColor: config.fg }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    gap: 3,
  },
  label: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});
