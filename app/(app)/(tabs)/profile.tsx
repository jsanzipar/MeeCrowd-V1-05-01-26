import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/Avatar';
import { CrowdStatsBar } from '@/components/profile/CrowdStatsBar';
import { CreatorStatsTab } from '@/components/profile/CreatorStatsTab';
import { SyncPlatformSheet } from '@/components/profile/SyncPlatformSheet';
import { ProfileFeedList } from '@/components/profile/ProfileFeedList';
import { useAuthStore } from '@/stores/authStore';
import { useCrowdStats, useMeecrowdFollowerCount } from '@/hooks/useProfile';
import { useProfileFeed, useMyCreatorConnections, useCreatorStats } from '@/hooks/useCreator';
import type { CrowdStats, Platform } from '@/types';
import { notificationsService } from '@/services/notifications';
import { colors, spacing, radius, typography } from '@/theme';

type Tab = 'posts' | 'personal' | 'stats';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, session } = useAuthStore();
  const userId = session?.user?.id ?? '';
  const { data: legacyStats } = useCrowdStats(userId);
  const { data: creatorStats, isLoading: creatorStatsLoading } = useCreatorStats(userId);
  const { data: meecrowdFollowers } = useMeecrowdFollowerCount(userId);
  const [activeTab, setActiveTab] = React.useState<Tab>('posts');

  // Connected-creator-account state — drives the "Connect your channels"
  // banner and (eventually) the Personal-tab visibility.
  const { data: connections } = useMyCreatorConnections();
  const hasConnections = (connections?.length ?? 0) > 0;

  // Modal state for the magnet-icon "Connect a platform" sheet.
  const [showSyncSheet, setShowSyncSheet] = React.useState(false);

  // Combine the legacy platform_metrics-based stats with the newer
  // OAuth-synced channel data. Synced channels' subscriber_count wins
  // over the legacy follower_count whenever both exist for the same
  // platform — it's the freshest signal we have.
  const stats: CrowdStats = React.useMemo(() => {
    const base: any = legacyStats
      ? { ...legacyStats }
      : { youtube: 0, twitch: 0, kick: 0, instagram: 0, tiktok: 0, x: 0, facebook: 0, linkedin: 0, total: 0 };
    if (creatorStats?.length) {
      for (const cs of creatorStats) {
        if (cs.platform_slug in base) {
          base[cs.platform_slug] = cs.subscriber_count;
        }
      }
      // Recompute total from whatever ended up per-platform.
      const platformKeys: Platform[] = [
        'youtube', 'twitch', 'kick', 'instagram',
        'tiktok', 'x', 'facebook', 'linkedin',
      ];
      base.total = platformKeys.reduce((s, k) => s + (Number(base[k]) || 0), 0);
    }
    return base as CrowdStats;
  }, [legacyStats, creatorStats]);

  // Every platform the user has actively synced via creator OAuth. Drives
  // which logo rows render in CrowdStatsBar — even ones with 0 subs.
  const connectedPlatforms: Platform[] = React.useMemo(() => {
    return (creatorStats ?? [])
      .map((s) => s.platform_slug)
      .filter((slug): slug is Platform =>
        ['youtube', 'twitch', 'kick', 'instagram', 'tiktok', 'x', 'facebook', 'linkedin'].includes(slug),
      );
  }, [creatorStats]);

  // Unified profile feed — native posts + external content from claimed
  // channels, scoped to the active tab's visibility set.
  const publicFeed = useProfileFeed(userId, 'public');
  const personalFeed = useProfileFeed(userId, 'personal');

  const { data: unreadCount } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => notificationsService.getUnreadCount(),
    refetchInterval: 30000,
  });

  const defaultStats = { youtube: 0, twitch: 0, kick: 0, instagram: 0, tiktok: 0, x: 0, facebook: 0, linkedin: 0, total: 0 };
  const hasUnread = (unreadCount ?? 0) > 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header bar */}
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity
            onPress={() => router.push('/(app)/settings')}
            style={styles.settingsBtn}
            accessibilityRole="button"
            accessibilityLabel={hasUnread ? 'Settings (unread notifications)' : 'Settings'}
            hitSlop={8}
          >
            <Ionicons name="settings-outline" size={24} color={colors.text} />
            {hasUnread && <View style={styles.notifDot} />}
          </TouchableOpacity>
        </View>

        {/* User info */}
        <View style={styles.userArea}>
          <Avatar
            uri={profile?.avatar_url ?? null}
            name={profile?.display_name ?? session?.user?.email}
            size={72}
          />
          <Text style={styles.displayName}>
            {profile?.display_name ?? 'New User'}
          </Text>
          <Text style={styles.username}>
            @{profile?.username ?? 'username'}
          </Text>
          {profile?.bio && (
            <Text style={styles.bio}>{profile.bio}</Text>
          )}
        </View>

        {/* Crowd Stats */}
        <View style={styles.statsArea}>
          <CrowdStatsBar
            stats={stats ?? defaultStats}
            meecrowdFollowers={meecrowdFollowers ?? 0}
            connectedPlatforms={connectedPlatforms}
            onSyncMore={() => setShowSyncSheet(true)}
          />
        </View>

        {/* Connect-creator-channels prompt — only shown when zero connected */}
        {!hasConnections && (
          <TouchableOpacity
            style={styles.connectBanner}
            onPress={() => router.push('/(app)/settings/platforms')}
            accessibilityRole="button"
            accessibilityLabel="Connect your creator channels"
          >
            <View style={styles.connectIcon}>
              <Ionicons name="link" size={18} color={colors.primary} />
            </View>
            <View style={styles.connectText}>
              <Text style={styles.connectTitle}>Are you a creator?</Text>
              <Text style={styles.connectBody}>
                Connect your YouTube or Kick to import your videos as posts.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Tab strip — same look as the Trending/Upcoming feed tabs:
            equal-width, centered white labels with a purple underline on
            the active tab. No icons, matching the feed for visual unity. */}
        <View style={styles.tabsRow}>
          <TabButton label="Posts" active={activeTab === 'posts'} onPress={() => setActiveTab('posts')} />
          <TabButton label="Personal" active={activeTab === 'personal'} onPress={() => setActiveTab('personal')} />
          <TabButton label="Stats" active={activeTab === 'stats'} onPress={() => setActiveTab('stats')} />
        </View>

        <View style={styles.tabContent}>
          {activeTab === 'posts' ? (
            <ProfileFeedList
              items={publicFeed.data ?? []}
              isLoading={publicFeed.isLoading}
              emptyTitle="No posts yet"
              emptyMessage="Tap the + tab to create one, or connect a creator account to import your videos."
              emptyIcon="newspaper-outline"
            />
          ) : activeTab === 'personal' ? (
            <ProfileFeedList
              items={personalFeed.data ?? []}
              isLoading={personalFeed.isLoading}
              emptyTitle="No private videos yet"
              emptyMessage={
                hasConnections
                  ? "Unlisted and private videos from your synced channels will appear here."
                  : "Connect a creator account to sync your private videos."
              }
              emptyIcon="lock-closed-outline"
            />
          ) : (
            <CreatorStatsTab
              stats={creatorStats ?? []}
              isLoading={creatorStatsLoading}
            />
          )}
        </View>
      </ScrollView>

      <SyncPlatformSheet
        visible={showSyncSheet}
        onClose={() => setShowSyncSheet(false)}
        userId={userId}
        connectedPlatforms={connectedPlatforms}
      />
    </SafeAreaView>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.tabBtn}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} tab`}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {label}
      </Text>
      {active && <View style={styles.tabIndicator} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingBottom: spacing['5xl'],
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.text,
  },
  settingsBtn: {
    position: 'relative',
  },
  notifDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.error,
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  userArea: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  displayName: {
    ...typography.h2,
    color: colors.text,
    marginTop: spacing.md,
  },
  username: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  bio: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing['3xl'],
    marginTop: spacing.sm,
  },
  statsArea: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  connectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  connectIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(124, 58, 237, 0.12)',
  },
  connectText: {
    flex: 1,
  },
  connectTitle: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 14,
  },
  connectBody: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  // Tab strip — visual parity with FeedTabs (equal-width, centered labels,
  // purple underline indicator on the active tab, white text active).
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    position: 'relative',
  },
  tabLabel: {
    ...typography.bodyBold,
    color: colors.textMuted,
  },
  tabLabelActive: {
    color: colors.text,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    height: 3,
    width: '60%',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
  },
  tabContent: {
    minHeight: 200,
  },
});
