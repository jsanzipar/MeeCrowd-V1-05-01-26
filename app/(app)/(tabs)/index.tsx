import React, { useCallback, useState, useRef } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Image,
  TouchableOpacity,
  Pressable,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FeedTabs } from '@/components/feed/FeedTabs';
import { PostCard } from '@/components/feed/PostCard';
import { SortFilters, ActiveFilterChips, CountryPicker } from '@/components/feed/SortFilters';
import { EmptyState } from '@/components/ui/EmptyState';
import { useFeed, useSearchPosts } from '@/hooks/useFeed';
import { useFeedStore } from '@/stores/feedStore';
import { postsService } from '@/services/posts';
import { queryClient } from '@/lib/queryClient';
import { colors, spacing, radius, typography } from '@/theme';
import type { Post } from '@/types';

const LOGO_URL = 'https://nfreggighhtvznvcofql.supabase.co/storage/v1/object/public/assets/logos/MeeCrowdLogoW.png';

export default function FeedScreen() {
  const {
    activeTab, setActiveTab,
    searchQuery, setSearchQuery,
    activeFilters, toggleFilter, clearFilters,
    selectedCountry, setSelectedCountry,
    showSortPanel, toggleSortPanel, setShowSortPanel,
    showCountryPicker, setShowCountryPicker,
  } = useFeedStore();
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef<TextInput>(null);

  const feed = useFeed(activeTab, activeFilters);
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

  const closePanels = () => {
    setShowSortPanel(false);
    Keyboard.dismiss();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header with logo + split search/sort bar */}
      <View style={styles.headerBar}>
        <Image source={{ uri: LOGO_URL }} style={styles.logo} resizeMode="contain" />
        <View style={styles.barContainer}>
          {/* Search half (left) */}
          <View style={styles.searchHalf}>
            <Ionicons name="search" size={15} color={colors.textMuted} />
            <TextInput
              ref={searchRef}
              style={styles.searchInput}
              placeholder="Search..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                setIsSearching(text.length > 0);
                if (text.length > 0) setShowSortPanel(false);
              }}
              onFocus={() => {
                setIsSearching(true);
                setShowSortPanel(false);
              }}
              onBlur={() => {
                if (!searchQuery) setIsSearching(false);
              }}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <Ionicons
                name="close-circle"
                size={14}
                color={colors.textMuted}
                onPress={() => {
                  setSearchQuery('');
                  setIsSearching(false);
                  searchRef.current?.blur();
                }}
              />
            )}
          </View>

          {/* Divider */}
          <View style={styles.barDivider} />

          {/* Sort half (right) */}
          <TouchableOpacity
            style={styles.sortHalf}
            onPress={() => {
              if (isSearching) {
                setSearchQuery('');
                setIsSearching(false);
                searchRef.current?.blur();
              }
              toggleSortPanel();
            }}
            activeOpacity={0.7}
          >
            {activeFilters.length > 0 ? (
              <ActiveFilterChips
                filters={activeFilters}
                selectedCountry={selectedCountry}
                onToggle={toggleFilter}
                onClear={clearFilters}
              />
            ) : (
              <Ionicons
                name="options"
                size={16}
                color={showSortPanel ? colors.primary : colors.textMuted}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Sort panel dropdown */}
      {showSortPanel && (
        <SortFilters
          activeFilters={activeFilters}
          selectedCountry={selectedCountry}
          onToggle={toggleFilter}
          onClear={() => { clearFilters(); setShowSortPanel(false); }}
          onChooseLocation={() => setShowCountryPicker(true)}
        />
      )}

      {/* Feed tabs — hidden during search */}
      {!isSearching && !showSortPanel && (
        <FeedTabs activeTab={activeTab} onTabChange={setActiveTab} />
      )}

      <FlatList
        data={posts}
        renderItem={renderPost}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={closePanels}
        onTouchStart={showSortPanel ? closePanels : undefined}
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
              message="Follow creators or switch to Trending"
            />
          )
        }
      />

      {/* Country picker modal */}
      {showCountryPicker && (
        <CountryPicker
          visible={showCountryPicker}
          selected={selectedCountry}
          onSelect={setSelectedCountry}
          onClose={() => setShowCountryPicker(false)}
        />
      )}
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
  barContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    height: 36,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  searchHalf: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    gap: 4,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    fontSize: 13,
    paddingVertical: 0,
  },
  barDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.border,
  },
  sortHalf: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    gap: 6,
    height: '100%',
    minWidth: 36,
    justifyContent: 'center',
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
