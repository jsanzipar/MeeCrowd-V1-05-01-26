// Stats tab on the profile page: lists every platform the user has
// connected via creator-sync OAuth, with a card showing subscriber count,
// total views/likes/comments aggregated from synced content.
//
// If nothing is connected → shows the standard "Connect a creator account"
// nudge so the tab feels actionable rather than empty.
import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { PostListSkeleton } from '@/components/ui/Skeleton';
import { formatCount } from '@/lib/format';
import { colors, spacing, radius, typography } from '@/theme';
import type { CreatorPlatformStats } from '@/services/creator';

const STORAGE_BASE =
  'https://nfreggighhtvznvcofql.supabase.co/storage/v1/object/public/assets/logos';

const PLATFORM_LOGOS: Record<string, string> = {
  youtube: `${STORAGE_BASE}/YouTubeLogo.png`,
  twitch: `${STORAGE_BASE}/TwitchLogo.png`,
  kick: `${STORAGE_BASE}/KickLogo.png`,
  instagram: `${STORAGE_BASE}/InstagramLogo.png`,
  tiktok: `${STORAGE_BASE}/TikTokLogo.png`,
  x: `${STORAGE_BASE}/XLogo.png`,
  facebook: `${STORAGE_BASE}/FacebookLogo.png`,
  linkedin: `${STORAGE_BASE}/LinkedInLogo.png`,
};

interface Props {
  stats: CreatorPlatformStats[];
  isLoading: boolean;
}

export function CreatorStatsTab({ stats, isLoading }: Props) {
  const router = useRouter();

  if (isLoading) return <PostListSkeleton count={2} />;

  if (!stats.length) {
    return (
      <View style={styles.emptyWrap}>
        <EmptyState
          icon="bar-chart-outline"
          title="No connected platforms"
          message="Connect your YouTube or Kick to see your stats here."
        />
        <TouchableOpacity
          style={styles.connectBtn}
          onPress={() => router.push('/(app)/settings/platforms')}
        >
          <Ionicons name="link" size={16} color={colors.white} />
          <Text style={styles.connectBtnText}>Connect a platform</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {stats.map((s) => (
        <PlatformCard key={s.platform_slug} stats={s} />
      ))}
    </View>
  );
}

function PlatformCard({ stats: s }: { stats: CreatorPlatformStats }) {
  const logo = PLATFORM_LOGOS[s.platform_slug];
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        {logo && <Image source={{ uri: logo }} style={styles.platformLogo} resizeMode="contain" />}
        <Avatar uri={s.avatar_url} name={s.channel_display_name ?? '?'} size={36} />
        <View style={styles.headerText}>
          <Text style={styles.channelName} numberOfLines={1}>
            {s.channel_display_name ?? s.handle ?? s.platform_name}
          </Text>
          {s.handle && (
            <Text style={styles.handle} numberOfLines={1}>
              {s.handle.startsWith('@') ? s.handle : `@${s.handle}`}
            </Text>
          )}
        </View>
      </View>

      {/* Headline subscriber count */}
      <View style={styles.subRow}>
        <Text style={styles.subValue}>{formatCount(s.subscriber_count)}</Text>
        <Text style={styles.subLabel}>subscribers</Text>
      </View>

      {/* Engagement grid */}
      <View style={styles.metricsGrid}>
        <Metric label="Synced videos" value={formatCount(s.synced_videos)} />
        <Metric label="Views" value={formatCount(s.total_views)} />
        <Metric label="Likes" value={formatCount(s.total_likes)} />
        <Metric label="Comments" value={formatCount(s.total_comments)} />
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    gap: spacing.lg,
  },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  connectBtnText: {
    ...typography.bodyBold,
    color: colors.white,
    fontSize: 14,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  platformLogo: {
    width: 22,
    height: 22,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  channelName: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 15,
  },
  handle: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 1,
  },
  subRow: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  subValue: {
    ...typography.h2,
    color: colors.text,
  },
  subLabel: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  metricsGrid: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
  },
  metricValue: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 14,
  },
  metricLabel: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
    fontSize: 11,
  },
});
