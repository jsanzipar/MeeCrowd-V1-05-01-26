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
import { EventsList } from '@/components/profile/EventsList';
import { useAuthStore } from '@/stores/authStore';
import { useCrowdStats } from '@/hooks/useProfile';
import { useUserPosts } from '@/hooks/useFeed';
import { notificationsService } from '@/services/notifications';
import { colors, spacing, typography } from '@/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, session } = useAuthStore();
  const userId = session?.user?.id ?? '';
  const { data: stats } = useCrowdStats(userId);
  const { data: postsData, isLoading } = useUserPosts(userId);

  const { data: unreadCount } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => notificationsService.getUnreadCount(),
    refetchInterval: 30000,
  });

  const posts = postsData?.pages.flat() ?? [];
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
          <CrowdStatsBar stats={stats ?? defaultStats} />
        </View>

        {/* Events section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Events</Text>
        </View>
        <View style={styles.tabContent}>
          <EventsList
            posts={posts}
            isLoading={isLoading}
            emptyMessage="No events yet — tap the + tab to create one"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
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
  tabContent: {
    minHeight: 200,
  },
});
