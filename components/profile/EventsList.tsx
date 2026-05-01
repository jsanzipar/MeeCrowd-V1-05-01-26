import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PostCard } from '@/components/feed/PostCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { PostListSkeleton } from '@/components/ui/Skeleton';
import { colors, spacing, typography } from '@/theme';
import { getEventStatus } from '@/types';
import type { Post, EventStatus } from '@/types';

const SECTION_CONFIG: { status: EventStatus; title: string; icon: string }[] = [
  { status: 'live', title: 'Live Now', icon: 'radio' },
  { status: 'upcoming', title: 'Upcoming', icon: 'time-outline' },
  { status: 'recurring', title: 'Recurring', icon: 'repeat' },
  { status: 'past', title: 'Past Events', icon: 'checkmark-circle-outline' },
];

interface EventsListProps {
  posts: Post[];
  isLoading: boolean;
  emptyMessage?: string;
}

export function EventsList({ posts, isLoading, emptyMessage = 'No events yet' }: EventsListProps) {
  if (isLoading) {
    return <PostListSkeleton count={3} />;
  }

  if (posts.length === 0) {
    return <EmptyState icon="calendar-outline" title={emptyMessage} />;
  }

  // Group posts by event status
  const grouped: Record<EventStatus, Post[]> = {
    live: [],
    upcoming: [],
    recurring: [],
    past: [],
  };

  for (const post of posts) {
    const status = getEventStatus(post);
    grouped[status].push(post);
  }

  // Check if all sections are empty (shouldn't happen since posts.length > 0, but be safe)
  const hasAny = SECTION_CONFIG.some((s) => grouped[s.status].length > 0);
  if (!hasAny) return <EmptyState icon="calendar-outline" title={emptyMessage} />;

  return (
    <View style={styles.container}>
      {SECTION_CONFIG.map(({ status, title }) => {
        const sectionPosts = grouped[status];
        if (sectionPosts.length === 0) return null;

        return (
          <View key={status} style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.statusDot, status === 'live' && styles.liveDot, status === 'upcoming' && styles.upcomingDot, status === 'recurring' && styles.recurringDot, status === 'past' && styles.pastDot]} />
              <Text style={styles.sectionTitle}>{title}</Text>
              <Text style={styles.sectionCount}>{sectionPosts.length}</Text>
            </View>
            {sectionPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  loader: {
    marginTop: spacing['3xl'],
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textMuted,
  },
  liveDot: {
    backgroundColor: colors.error,
  },
  upcomingDot: {
    backgroundColor: colors.primary,
  },
  recurringDot: {
    backgroundColor: colors.success,
  },
  pastDot: {
    backgroundColor: colors.textMuted,
  },
  sectionTitle: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 14,
    flex: 1,
  },
  sectionCount: {
    ...typography.small,
    color: colors.textMuted,
  },
});
