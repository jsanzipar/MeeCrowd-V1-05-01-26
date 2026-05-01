import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  SectionList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PostCard } from '@/components/feed/PostCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PostListSkeleton } from '@/components/ui/Skeleton';
import { useBookmarkedPosts } from '@/hooks/useFeed';
import { usePostActions } from '@/hooks/usePostActions';
import { getEventStatus } from '@/types';
import { colors, spacing, typography } from '@/theme';
import type { EventStatus } from '@/types';

const STATUS_ORDER: EventStatus[] = ['live', 'upcoming', 'recurring', 'past'];
const STATUS_LABELS: Record<EventStatus, string> = {
  live: 'Happening Now',
  upcoming: 'Coming Up',
  recurring: 'Recurring Events',
  past: 'Past Events',
};

export default function ScheduleScreen() {
  const { data: posts, isLoading, isError, refetch, isRefetching } = useBookmarkedPosts();
  const { toggleLike, toggleBookmark } = usePostActions();

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
        <Text style={styles.headerTitle}>Saved</Text>
        <Text style={styles.headerSub}>
          {posts?.length ?? 0} event{(posts?.length ?? 0) !== 1 ? 's' : ''} in your lineup
        </Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostCard
            post={{ ...item, is_bookmarked: true }}
            onLike={() => toggleLike(item)}
            onBookmark={() => toggleBookmark(item)}
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
            <PostListSkeleton count={5} />
          ) : isError ? (
            <ErrorState onRetry={refetch} />
          ) : (
            <EmptyState
              icon="bookmark-outline"
              title="Nothing saved yet"
              message="Tap Save on any post to catch it later"
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
    flexGrow: 1,
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
