import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '@/theme';
import type { CrowdStats, Platform } from '@/types';

const STORAGE_BASE = 'https://nfreggighhtvznvcofql.supabase.co/storage/v1/object/public/assets/logos';

const ALL_PLATFORMS: { key: Platform; logo: string }[] = [
  { key: 'youtube', logo: `${STORAGE_BASE}/YouTubeLogo.png` },
  { key: 'twitch', logo: `${STORAGE_BASE}/TwitchLogo.png` },
  { key: 'kick', logo: `${STORAGE_BASE}/KickLogo.png` },
  { key: 'instagram', logo: `${STORAGE_BASE}/InstagramLogo.png` },
  { key: 'tiktok', logo: `${STORAGE_BASE}/TikTokLogo.png` },
  { key: 'x', logo: `${STORAGE_BASE}/XLogo.png` },
  { key: 'facebook', logo: `${STORAGE_BASE}/FacebookLogo.png` },
  { key: 'linkedin', logo: `${STORAGE_BASE}/LinkedInLogo.png` },
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
  // Only show platforms that have a nonzero count
  const activePlatforms = ALL_PLATFORMS.filter(({ key }) => (stats[key] ?? 0) > 0);

  return (
    <View style={styles.container}>
      {/* Platform stats */}
      <View style={styles.platformsRow}>
        {activePlatforms.length > 0 ? (
          activePlatforms.map(({ key, logo }) => (
            <View key={key} style={styles.stat}>
              <Image source={{ uri: logo }} style={styles.logo} resizeMode="contain" />
              <Text style={styles.count}>{formatStat(stats[key] ?? 0)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.noPlatforms}>No platforms connected</Text>
        )}
      </View>

      {/* Separator */}
      <View style={styles.separator} />

      {/* Total crowd */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>TOTAL CROWD</Text>
        <Text style={styles.totalCount}>{formatStat(stats.total)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.sm,
  },
  platformsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  stat: {
    alignItems: 'center',
    gap: 4,
  },
  logo: {
    width: 20,
    height: 20,
  },
  count: {
    ...typography.bodyBold,
    color: colors.textSecondary,
    fontSize: 13,
  },
  noPlatforms: {
    ...typography.body,
    color: colors.textMuted,
    fontSize: 13,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
    opacity: 0.5,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
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
