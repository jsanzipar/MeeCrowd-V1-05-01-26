import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@/theme';
import type { CrowdStats, Platform } from '@/types';

const platforms: { key: Platform; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'youtube', icon: 'logo-youtube', color: colors.youtube },
  { key: 'twitch', icon: 'logo-twitch', color: colors.twitch },
  { key: 'kick', icon: 'game-controller', color: colors.kick },
  { key: 'instagram', icon: 'logo-instagram', color: colors.instagram },
];

function formatStat(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

interface CrowdStatsBarProps {
  stats: CrowdStats;
}

export function CrowdStatsBar({ stats }: CrowdStatsBarProps) {
  return (
    <View style={styles.container}>
      {platforms.map(({ key, icon, color }) => (
        <View key={key} style={styles.stat}>
          <Ionicons name={icon} size={20} color={color} />
          <Text style={[styles.count, { color }]}>{formatStat(stats[key])}</Text>
        </View>
      ))}
      <View style={styles.divider} />
      <View style={styles.stat}>
        <Text style={styles.totalLabel}>CROWD</Text>
        <Text style={styles.totalCount}>{formatStat(stats.total)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stat: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  count: {
    ...typography.bodyBold,
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },
  totalLabel: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '700',
    letterSpacing: 1,
  },
  totalCount: {
    ...typography.h3,
    color: colors.primary,
  },
});
