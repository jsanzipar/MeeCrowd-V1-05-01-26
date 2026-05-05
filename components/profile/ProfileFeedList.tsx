// Renders the unified Profile feed (native posts + claimed-channel videos).
//
// The profile_feed view returns rows of two `source` types — 'post' (a
// native MeeCrowd post we already know how to render via PostCard) and
// 'external' (a video from a synced YouTube/Kick channel rendered via
// ExternalContentRow). This component dispatches to the right card type.
//
// Used by both the public Posts tab and the owner-only Personal tab.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { PostCard } from '@/components/feed/PostCard';
import { ExternalContentRow } from '@/components/aggregation/ExternalContentRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { PostListSkeleton } from '@/components/ui/Skeleton';
import { postsService } from '@/services/posts';
import { aggregationService } from '@/services/aggregation';
import { colors, spacing } from '@/theme';
import type { ProfileFeedItem } from '@/services/creator';

interface Props {
  items: ProfileFeedItem[];
  isLoading: boolean;
  emptyTitle: string;
  emptyMessage?: string;
  emptyIcon?: 'newspaper-outline' | 'lock-closed-outline' | 'film-outline';
}

export function ProfileFeedList({
  items,
  isLoading,
  emptyTitle,
  emptyMessage,
  emptyIcon = 'newspaper-outline',
}: Props) {
  if (isLoading) return <PostListSkeleton count={3} />;
  if (!items.length) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} />;
  }

  return (
    <View style={styles.container}>
      {items.map((item) =>
        item.source === 'post' ? (
          <NativePostRenderer key={`p-${item.id}`} item={item} />
        ) : (
          <ExternalRenderer key={`e-${item.id}`} item={item} />
        ),
      )}
    </View>
  );
}

/**
 * Hydrates a 'post' source row into a full Post (with author + counts)
 * and renders via the existing PostCard. The profile_feed view doesn't
 * include like/comment counts to keep the JOIN cheap, so we fetch the
 * full post here.
 */
function NativePostRenderer({ item }: { item: ProfileFeedItem }) {
  const { data: post } = useQuery({
    queryKey: ['post-detail', item.id],
    queryFn: () => postsService.getPost(item.id),
    staleTime: 60_000,
  });
  if (!post) return null;
  return <PostCard post={post} />;
}

/**
 * Same idea for external_content — the row in profile_feed has just the
 * title + thumbnail; we fetch the full ExternalContent (with channel +
 * latest_metrics) so the row matches what the aggregation tab shows.
 */
function ExternalRenderer({ item }: { item: ProfileFeedItem }) {
  const { data: content } = useQuery({
    queryKey: ['external-content', item.id],
    queryFn: () => aggregationService.getContent(item.id),
    staleTime: 60_000,
  });
  if (!content) return null;
  return <ExternalContentRow content={content} />;
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.sm,
  },
});
