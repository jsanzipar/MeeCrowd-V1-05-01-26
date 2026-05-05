import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Pressable,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { CrowdStatsBar } from '@/components/profile/CrowdStatsBar';
import { EventsList } from '@/components/profile/EventsList';
import { EmptyState } from '@/components/ui/EmptyState';
import { useProfile, useCrowdStats, useIsFollowing, useMeecrowdFollowerCount } from '@/hooks/useProfile';
import { useCreatorStats } from '@/hooks/useCreator';
import { useUserPosts } from '@/hooks/useFeed';
import { usersService } from '@/services/users';
import { moderationService } from '@/services/moderation';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/lib/toast';
import { haptics } from '@/lib/haptics';
import { colors, spacing, typography } from '@/theme';
import { ReportSheet } from '@/components/moderation/ReportSheet';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((s) => s.session?.user?.id);
  const isOwnProfile = currentUserId === id;

  const [reportOpen, setReportOpen] = React.useState(false);

  const { data: user, isLoading: userLoading } = useProfile(id!);
  const { data: legacyStats } = useCrowdStats(id!);
  const { data: creatorStats } = useCreatorStats(id!);
  const { data: meecrowdFollowers } = useMeecrowdFollowerCount(id!);
  const { data: isFollowing } = useIsFollowing(id!);

  // Mirror tabs/profile.tsx: prefer OAuth-synced subscriber counts over
  // the legacy platform_metrics-based numbers, then sum the total.
  const stats = React.useMemo(() => {
    const base: any = legacyStats
      ? { ...legacyStats }
      : { youtube: 0, twitch: 0, kick: 0, instagram: 0, tiktok: 0, x: 0, facebook: 0, linkedin: 0, total: 0 };
    if (creatorStats?.length) {
      for (const cs of creatorStats) {
        if (cs.platform_slug in base) base[cs.platform_slug] = cs.subscriber_count;
      }
      const keys = ['youtube', 'twitch', 'kick', 'instagram', 'tiktok', 'x', 'facebook', 'linkedin'] as const;
      base.total = keys.reduce((s, k) => s + (Number(base[k]) || 0), 0);
    }
    return base;
  }, [legacyStats, creatorStats]);

  const connectedPlatforms = React.useMemo(
    () =>
      (creatorStats ?? [])
        .map((s) => s.platform_slug)
        .filter((slug): slug is any =>
          ['youtube', 'twitch', 'kick', 'instagram', 'tiktok', 'x', 'facebook', 'linkedin'].includes(slug),
        ),
    [creatorStats],
  );
  const { data: postsData, isLoading: postsLoading } = useUserPosts(id!);
  const { data: isBlocked } = useQuery({
    queryKey: ['is-blocked', id],
    queryFn: () => moderationService.isBlocked(id!),
    enabled: !!id && !isOwnProfile,
  });

  const posts = postsData?.pages.flat() ?? [];
  const defaultStats = {
    youtube: 0,
    twitch: 0,
    kick: 0,
    instagram: 0,
    tiktok: 0,
    x: 0,
    facebook: 0,
    linkedin: 0,
    total: 0,
  };

  const followMutation = useMutation({
    mutationFn: () =>
      isFollowing ? usersService.unfollowUser(id!) : usersService.followUser(id!),
    onMutate: () => {
      haptics.light();
    },
    onSuccess: (_data, _vars, _ctx) => {
      queryClient.invalidateQueries({ queryKey: ['is-following', id] });
      // No toast on follow — the button state flip is self-evident.
    },
    onError: (err: any) => {
      haptics.error();
      toast.fromError(err, isFollowing ? "Couldn't unfollow" : "Couldn't follow");
    },
  });

  const blockMutation = useMutation({
    mutationFn: (block: boolean) =>
      block
        ? moderationService.blockUser(id!)
        : moderationService.unblockUser(id!),
    onSuccess: (_data, block) => {
      queryClient.invalidateQueries({ queryKey: ['is-blocked', id] });
      queryClient.invalidateQueries({ queryKey: ['is-following', id] });
      haptics.success();
      if (block) {
        toast.success({
          title: 'User blocked',
          message: "You won't see their content anymore.",
        });
        router.back();
      } else {
        toast.success({ title: 'User unblocked' });
      }
    },
    onError: (err: any) => {
      haptics.error();
      toast.fromError(err);
    },
  });

  const openMenu = () => {
    if (isOwnProfile) return;
    Alert.alert(
      user?.display_name ?? 'User',
      undefined,
      [
        {
          text: 'Report',
          onPress: () => setReportOpen(true),
        },
        {
          text: isBlocked ? 'Unblock' : 'Block',
          style: 'destructive',
          onPress: () => {
            if (isBlocked) {
              blockMutation.mutate(false);
            } else {
              Alert.alert(
                `Block @${user?.username ?? 'user'}?`,
                "They won't be able to see your profile or posts, and you won't see theirs.",
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Block',
                    style: 'destructive',
                    onPress: () => blockMutation.mutate(true),
                  },
                ]
              );
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  if (userLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!user) {
    return <EmptyState icon="person-outline" title="User not found" />;
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () =>
            isOwnProfile ? null : (
              <Pressable
                onPress={openMenu}
                style={styles.headerBtn}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="More options"
              >
                <Ionicons
                  name="ellipsis-horizontal"
                  size={22}
                  color={colors.text}
                />
              </Pressable>
            ),
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* User info */}
        <View style={styles.userArea}>
          <Avatar uri={user.avatar_url} name={user.display_name} size={80} />
          <Text style={styles.displayName}>{user.display_name}</Text>
          <Text style={styles.username}>@{user.username}</Text>
          {user.bio && <Text style={styles.bio}>{user.bio}</Text>}

          {!isOwnProfile && !isBlocked && (
            <Button
              title={isFollowing ? 'Unfollow' : 'Follow'}
              onPress={() => followMutation.mutate()}
              variant={isFollowing ? 'secondary' : 'primary'}
              size="sm"
              loading={followMutation.isPending}
              style={styles.followBtn}
            />
          )}

          {isBlocked && (
            <View style={styles.blockedBanner}>
              <Ionicons
                name="ban-outline"
                size={16}
                color={colors.textSecondary}
              />
              <Text style={styles.blockedText}>
                You've blocked this user. Unblock from Settings → Blocked Users.
              </Text>
            </View>
          )}
        </View>

        {/* Crowd Stats */}
        {!isBlocked && (
          <View style={styles.statsArea}>
            <CrowdStatsBar
              stats={stats ?? defaultStats}
              meecrowdFollowers={meecrowdFollowers ?? 0}
              connectedPlatforms={connectedPlatforms}
            />
          </View>
        )}

        {/* Events section */}
        {!isBlocked && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Events</Text>
            </View>
            <View style={styles.content}>
              <EventsList
                posts={posts}
                isLoading={postsLoading}
                emptyMessage="No events yet"
              />
            </View>
          </>
        )}
      </ScrollView>

      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        target={{ target_type: 'profile', target_id: id! }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  scroll: {
    paddingBottom: spacing['5xl'],
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userArea: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
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
  followBtn: {
    marginTop: spacing.lg,
    minWidth: 120,
  },
  blockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 8,
    marginHorizontal: spacing.xl,
  },
  blockedText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  statsArea: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
  },
  content: {
    minHeight: 200,
  },
});
