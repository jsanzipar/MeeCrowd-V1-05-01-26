import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { CrowdStatsBar } from '@/components/profile/CrowdStatsBar';
import { ProfileTabs } from '@/components/profile/ProfileTabs';
import { EventsList } from '@/components/profile/EventsList';
import { EmptyState } from '@/components/ui/EmptyState';
import { useProfile, useCrowdStats, useIsFollowing } from '@/hooks/useProfile';
import { useUserPosts } from '@/hooks/useFeed';
import { usersService } from '@/services/users';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { colors, spacing, typography } from '@/theme';
import type { ProfileTab } from '@/components/profile/ProfileTabs';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentUserId = useAuthStore((s) => s.session?.user?.id);
  const isOwnProfile = currentUserId === id;

  const { data: user, isLoading: userLoading } = useProfile(id!);
  const { data: stats } = useCrowdStats(id!);
  const { data: isFollowing } = useIsFollowing(id!);
  const { data: postsData, isLoading: postsLoading } = useUserPosts(id!);
  const [tab, setTab] = useState<ProfileTab>('events');

  const posts = postsData?.pages.flat() ?? [];
  const defaultStats = { youtube: 0, twitch: 0, kick: 0, instagram: 0, tiktok: 0, x: 0, facebook: 0, linkedin: 0, total: 0 };

  const followMutation = useMutation({
    mutationFn: () =>
      isFollowing ? usersService.unfollowUser(id!) : usersService.followUser(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['is-following', id] });
    },
  });

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
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {/* User info */}
      <View style={styles.userArea}>
        <Avatar uri={user.avatar_url} name={user.display_name} size={80} />
        <Text style={styles.displayName}>{user.display_name}</Text>
        <Text style={styles.username}>@{user.username}</Text>
        {user.bio && <Text style={styles.bio}>{user.bio}</Text>}

        {!isOwnProfile && (
          <Button
            title={isFollowing ? 'Unfollow' : 'Follow'}
            onPress={() => followMutation.mutate()}
            variant={isFollowing ? 'secondary' : 'primary'}
            size="sm"
            loading={followMutation.isPending}
            style={styles.followBtn}
          />
        )}
      </View>

      {/* Crowd Stats — no wrapper */}
      <View style={styles.statsArea}>
        <CrowdStatsBar stats={stats ?? defaultStats} />
      </View>

      {/* Profile Tabs — 3 tabs for other users, 4 for own */}
      <ProfileTabs
        active={tab}
        onTabChange={setTab}
        isOwnProfile={isOwnProfile}
      />

      {/* Tab content */}
      <View style={styles.tabContent}>
        {tab === 'events' && (
          <EventsList
            posts={posts}
            isLoading={postsLoading}
            emptyMessage="No events yet"
          />
        )}

        {tab === 'personal' && isOwnProfile && (
          <EventsList
            posts={posts}
            isLoading={postsLoading}
            emptyMessage="Your personal events will appear here"
          />
        )}

        {tab === 'vip' && (
          <EmptyState
            icon="star-outline"
            title="VIP Crowd"
            message="Exclusive community — coming soon"
          />
        )}

        {tab === 'achievements' && (
          <EmptyState
            icon="trophy-outline"
            title="Achievements"
            message="Badges and milestones — coming soon"
          />
        )}
      </View>
    </ScrollView>
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
  statsArea: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  tabContent: {
    minHeight: 200,
  },
});
