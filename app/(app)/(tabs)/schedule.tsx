import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  SectionList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PostCard } from '@/components/feed/PostCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { useBookmarkedPosts } from '@/hooks/useFeed';
import { postsService } from '@/services/posts';
import { queryClient } from '@/lib/queryClient';
import { getEventStatus, formatEventTime } from '@/types';
import { colors, spacing, typography } from '@/theme';
import type { Post, EventStatus } from '@/types';

const STATUS_ORDER: EventStatus[] = ['live', 'upcoming', 'recurring', 'past'];
const STATUS_LABELS: Record<EventStatus, string> = {
  live: 'Happening Now',
  upcoming: 'Coming Up',
  recurring: 'Recurring Events',
  past: 'Past Events',
};

export default function ScheduleScreen() {
  const { data: posts, isLoading, refetch, isRefetching } = useBookmarkedPosts();

  const handleLike = useCallback(async (post: Post) => {
    try {
      if (post.is_liked) {
        await postsService.unlikePost(post.id);
      } else {
        await postsService.likePost(post.id);
      }
      queryClient.invalidateQueries({ queryKey: ['bookmarked-posts'] });
    } catch {}
  }, []);

  const handleBookmark = useCallback(async (post: Post) => {
    // Every post on this page is bookmarked — tapping always unbookmarks
    try {
      // Optimistically remove from schedule list immediately
      queryClient.setQueryData<Post[]>(['bookmarked-posts'], (old) =>
        old ? old.filter((p) => p.id !== post.id) : []
      );
      await postsService.unbookmarkPost(post.id);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch {
      // Revert on failure
      queryClient.invalidateQueries({ queryKey: ['bookmarked-posts'] });
    }
  }, []);

  // Group posts by event status
  const sections = STATUS_ORDER
    .map((status) => ({
      title: STATUS_LABELS[status],
      status,
      data: (posts ?? []).filter((p) => getEventStatus(p) === status),
    }))
    .filter((s) => s.data.length > 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Schedule</Text>
        <Text style={styles.headerSub}>
          {posts?.length ?? 0} event{(posts?.length ?? 0) !== 1 ? 's' : ''}
        </Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostCard
            post={{ ...item, is_bookmarked: true }}
            onLike={() => handleLike(item)}
            onBookmark={() => handleBookmark(item)}
          />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.center} />
          ) : (
            <EmptyState
              icon="calendar-outline"
              title="No events scheduled"
              message="Bookmark events from the feed to add them to your schedule"
            />
          )
        }
        stickySectionHeadersEnabled={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.text,
  },
  headerSub: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  list: {
    paddingTop: spacing.sm,
    paddingBottom: spacing['5xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    ...typography.bodyBold,
    color: colors.textSecondary,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCount: {
    ...typography.caption,
    color: colors.textMuted,
  },
  center: {
    marginTop: spacing['5xl'],
  },
});
