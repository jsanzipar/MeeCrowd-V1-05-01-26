import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { CrowdStatsBar } from '@/components/profile/CrowdStatsBar';
import { PostCard } from '@/components/feed/PostCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuthStore } from '@/stores/authStore';
import { useCrowdStats } from '@/hooks/useProfile';
import { useUserPosts } from '@/hooks/useFeed';
import { colors, spacing, radius, typography } from '@/theme';
import type { Post } from '@/types';

type ProfileTab = 'posts' | 'vip' | 'achievements';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, session } = useAuthStore();
  const userId = session?.user?.id ?? '';
  const { data: stats } = useCrowdStats(userId);
  const { data: postsData, isLoading } = useUserPosts(userId);
  const [tab, setTab] = useState<ProfileTab>('posts');

  const posts = postsData?.pages.flat() ?? [];

  const renderPost = useCallback(({ item }: { item: Post }) => (
    <PostCard post={item} />
  ), []);

  const defaultStats = { youtube: 0, twitch: 0, kick: 0, instagram: 0, total: 0 };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={tab === 'posts' ? posts : []}
        renderItem={renderPost}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            {/* Header bar */}
            <View style={styles.headerBar}>
              <Text style={styles.headerTitle}>Profile</Text>
              <TouchableOpacity onPress={() => router.push('/(app)/settings')}>
                <Ionicons name="settings-outline" size={24} color={colors.text} />
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
              <CrowdStatsBar stats={stats ?? defaultStats} />
            </View>

            {/* Profile Tabs */}
            <View style={styles.tabRow}>
              {(['posts', 'vip', 'achievements'] as ProfileTab[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.tab, tab === t && styles.activeTab]}
                  onPress={() => setTab(t)}
                >
                  <Text style={[styles.tabText, tab === t && styles.activeTabText]}>
                    {t === 'posts' ? 'Posts' : t === 'vip' ? 'VIP Crowd' : 'Achievements'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : tab === 'posts' ? (
            <EmptyState icon="newspaper-outline" title="No posts yet" />
          ) : tab === 'vip' ? (
            <EmptyState icon="star-outline" title="VIP Crowd" message="Coming soon" />
          ) : (
            <EmptyState icon="trophy-outline" title="Achievements" message="Coming soon" />
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
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
  userArea: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
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
    marginBottom: spacing.xl,
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  activeTab: {
    borderBottomWidth: 3,
    borderBottomColor: colors.primary,
  },
  tabText: {
    ...typography.bodyBold,
    color: colors.textMuted,
  },
  activeTabText: {
    color: colors.text,
  },
  loader: {
    marginTop: spacing['3xl'],
  },
});
