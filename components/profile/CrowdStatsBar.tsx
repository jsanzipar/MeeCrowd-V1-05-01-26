import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '@/theme';
import type { CrowdStats, Platform } from '@/types';

const STORAGE_BASE = 'https://nfreggighhtvznvcofql.supabase.co/storage/v1/object/public/assets/logos';

// Native MeeCrowd entry — always rendered as the leftmost stat regardless
// of which external platforms the user has connected. Count comes from
// the meecrowdFollowers prop (counted from the `follows` table by the
// parent screen).
const MEECROWD_LOGO = `${STORAGE_BASE}/MeeCrowdLogoW.png`;

const EXTERNAL_PLATFORMS: { key: Platform; logo: string }[] = [
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
  /**
   * MeeCrowd-native follower count (from the `follows` table). Rendered
   * as the always-visible leftmost stat — this is what's unique to our
   * platform and is shown for every profile, regardless of external syncs.
   */
  meecrowdFollowers: number;
  /**
   * External platforms the user has actively synced (creator OAuth). When
   * omitted, falls back to "any external platform with stats > 0".
   */
  connectedPlatforms?: Platform[];
  /** Tap handler for the magnet icon. When provided, the icon renders. */
  onSyncMore?: () => void;
}

export function CrowdStatsBar({
  stats,
  meecrowdFollowers,
  connectedPlatforms,
  onSyncMore,
}: CrowdStatsBarProps) {
  // External platforms after MeeCrowd. Two render modes:
  //   1) connectedPlatforms passed → show those exactly, in canonical order
  //   2) no list passed → show any platform with stats > 0 (legacy fallback)
  const visibleExternals = connectedPlatforms
    ? EXTERNAL_PLATFORMS.filter(({ key }) => connectedPlatforms.includes(key))
    : EXTERNAL_PLATFORMS.filter(({ key }) => (stats[key] ?? 0) > 0);

  const showMagnet = !!onSyncMore;

  return (
    <View style={styles.container}>
      {/* Platform stats — MeeCrowd is always the leftmost entry */}
      <View style={styles.platformsRow}>
        <View style={styles.stat}>
          <Image source={{ uri: MEECROWD_LOGO }} style={styles.logo} resizeMode="contain" />
          <Text style={styles.count}>{formatStat(meecrowdFollowers)}</Text>
        </View>

        {visibleExternals.map(({ key, logo }) => (
          <View key={key} style={styles.stat}>
            <Image source={{ uri: logo }} style={styles.logo} resizeMode="contain" />
            <Text style={styles.count}>{formatStat(stats[key] ?? 0)}</Text>
          </View>
        ))}

        {showMagnet && (
          <TouchableOpacity
            onPress={onSyncMore}
            style={styles.magnetBtn}
            accessibilityRole="button"
            accessibilityLabel="Connect another platform"
            hitSlop={8}
          >
            <Ionicons name="magnet" size={18} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Separator */}
      <View style={styles.separator} />

      {/* MeeCrowd total — native followers + every connected platform's subs */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>MeeCrowd</Text>
        <Text style={styles.totalCount}>
          {formatStat((stats.total ?? 0) + meecrowdFollowers)}
        </Text>
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
    alignItems: 'center',
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
  magnetBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginLeft: spacing.xs,
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
    ...typography.bodyBold,
    color: colors.text, // white per spec
    letterSpacing: 0.4,
  },
  totalCount: {
    ...typography.h3,
    color: colors.text,
  },
});
