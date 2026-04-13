import React, { useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeedTabs } from '@/components/feed/FeedTabs';
import { PostCard } from '@/components/feed/PostCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { useFeed } from '@/hooks/useFeed';
import { useFeedStore } from '@/stores/feedStore';
import { postsService } from '@/services/posts';
import { queryClient } from '@/lib/queryClient';
import { colors, spacing } from '@/theme';
import type { Post } from '@/types';

export default function FeedScreen() {
  const { activeTab, setActiveTab } = useFeedStore();
  const {
    data,
    isLoading,
    isRefetching,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useFeed(activeTab);

  const posts = data?.pages.flat() ?? [];

  const handleLike = useCallback(async (post: Post) => {
    try {
      if (post.is_liked) {
        await postsService.unlikePost(post.id);
      } else {
        await postsService.likePost(post.id);
      }
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch {}
  }, []);

  const handleBookmark = useCallback(async (post: Post) => {
    try {
      if (post.is_bookmarked) {
        await postsService.unbookmarkPost(post.id);
      } else {
        await postsService.bookmarkPost(post.id);
      }
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch {}
  }, []);

  const renderPost = useCallback(({ item }: { item: Post }) => (
    <PostCard
      post={item}
      onLike={() => handleLike(item)}
      onBookmark={() => handleBookmark(item)}
    />
  ), [handleLike, handleBookmark]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FeedTabs activeTab={activeTab} onTabChange={setActiveTab} />

      <FlatList
        data={posts}
        renderItem={renderPost}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator color={colors.primary} style={styles.footer} />
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.center} />
          ) : (
            <EmptyState
              icon="newspaper-outline"
              title="No posts yet"
              message="Follow creators or check out Featured"
            />
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
    paddingTop: spacing.lg,
    paddingBottom: spacing['5xl'],
  },
  footer: {
    paddingVertical: spacing.xl,
  },
  center: {
    marginTop: spacing['5xl'],
  },
});
