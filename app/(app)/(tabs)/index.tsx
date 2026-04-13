import React, { useCallback, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FeedTabs } from '@/components/feed/FeedTabs';
import { PostCard } from '@/components/feed/PostCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { useFeed, useSearchPosts } from '@/hooks/useFeed';
import { useFeedStore } from '@/stores/feedStore';
import { postsService } from '@/services/posts';
import { queryClient } from '@/lib/queryClient';
import { colors, spacing, radius, typography } from '@/theme';
import type { Post } from '@/types';

const LOGO_URL = 'https://nfreggighhtvznvcofql.supabase.co/storage/v1/object/public/assets/logos/MeeCrowdLogoW.png';

export default function FeedScreen() {
  const { activeTab, setActiveTab, searchQuery, setSearchQuery } = useFeedStore();
  const [isSearching, setIsSearching] = useState(false);

  const feed = useFeed(activeTab);
  const search = useSearchPosts(searchQuery);

  const posts = isSearching && searchQuery.length >= 2
    ? (search.data ?? [])
    : (feed.data?.pages.flat() ?? []);

  const isLoading = isSearching ? search.isLoading : feed.isLoading;

  const handleLike = useCallback(async (post: Post) => {
    try {
      if (post.is_liked) {
        await postsService.unlikePost(post.id);
      } else {
        await postsService.likePost(post.id);
      }
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['search-posts'] });
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
      queryClient.invalidateQueries({ queryKey: ['search-posts'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarked-posts'] });
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
      {/* Header with logo + search */}
      <View style={styles.headerBar}>
        <Image source={{ uri: LOGO_URL }} style={styles.logo} resizeMode="contain" />
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search events..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              setIsSearching(text.length > 0);
            }}
            onFocus={() => setIsSearching(true)}
            onBlur={() => {
              if (!searchQuery) setIsSearching(false);
            }}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Ionicons
              name="close-circle"
              size={16}
              color={colors.textMuted}
              onPress={() => {
                setSearchQuery('');
                setIsSearching(false);
              }}
            />
          )}
        </View>
      </View>

      {/* Feed tabs — hidden during search */}
      {!isSearching && (
        <FeedTabs activeTab={activeTab} onTabChange={setActiveTab} />
      )}

      <FlatList
        data={posts}
        renderItem={renderPost}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          !isSearching ? (
            <RefreshControl
              refreshing={feed.isRefetching}
              onRefresh={feed.refetch}
              tintColor={colors.primary}
            />
          ) : undefined
        }
        onEndReached={() => {
          if (!isSearching && feed.hasNextPage && !feed.isFetchingNextPage) {
            feed.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <ActivityIndicator color={colors.primary} style={styles.footer} />
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.center} />
          ) : isSearching && searchQuery.length >= 2 ? (
            <EmptyState
              icon="search-outline"
              title="No results"
              message={`No events found for "${searchQuery}"`}
            />
          ) : isSearching ? (
            <EmptyState
              icon="search-outline"
              title="Search events"
              message="Type at least 2 characters to search"
            />
          ) : (
            <EmptyState
              icon="newspaper-outline"
              title="No events yet"
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
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  logo: {
    width: 32,
    height: 32,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    height: 36,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    fontSize: 14,
    paddingVertical: 0,
  },
  list: {
    paddingTop: spacing.sm,
    paddingBottom: spacing['5xl'],
  },
  footer: {
    paddingVertical: spacing.xl,
  },
  center: {
    marginTop: spacing['5xl'],
  },
});
