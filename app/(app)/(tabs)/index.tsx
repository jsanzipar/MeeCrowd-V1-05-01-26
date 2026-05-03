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
import { router } from 'expo-router';
import { FeedTabs } from '@/components/feed/FeedTabs';
import { PostCard } from '@/components/feed/PostCard';
import { LivePostCard } from '@/components/feed/LivePostCard';
import { SortFilters, ActiveFilterChips, CountryPicker } from '@/components/feed/SortFilters';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PostListSkeleton } from '@/components/ui/Skeleton';
import { useFeed, useSearchPosts } from '@/hooks/useFeed';
import { useLiveNow } from '@/hooks/useAggregation';
import { useFeedStore } from '@/stores/feedStore';
import { usePostActions } from '@/hooks/usePostActions';
import { colors, spacing, radius, typography } from '@/theme';
import type { Post, ExternalLiveNowRow, SortFilter } from '@/types';

// Filters that name a platform. Live data is filtered to streams matching
// any selected external platform; if only `meecrowd` is selected (no
// external platforms), live streams are hidden because the meecrowd
// platform has no external live content.
const PLATFORM_FILTERS = [
  'meecrowd', 'youtube', 'twitch', 'kick',
  'instagram', 'tiktok', 'x', 'facebook', 'linkedin',
] as const;

// Filters that don't have a clean mapping onto external live data
// (categories, "following", "broadcasters", country/location). When any
// of these is active, hide live streams rather than show irrelevant ones.
const LIVE_SUPPRESSING_FILTERS: SortFilter[] = [
  'following', 'broadcasters', 'near-me', 'location',
  'gaming', 'music', 'sports', 'education', 'entertainment',
];

// Discriminated union so the same FlatList can render both regular posts
// and ingested live streams without coercing one into the other.
type FeedItem =
  | { kind: 'post'; data: Post }
  | { kind: 'live'; data: ExternalLiveNowRow };

const LOGO = require('@/assets/images/logo-w.png');

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
  // Only fetch live streams while on Trending and not searching — keeps
  // the Upcoming tab and the search results focused.
  const liveQuery = useLiveNow();
  // Cap visible live cards to keep the Trending feed from being dominated
  // by auto-discovered streams. We still ingest the full trending list
  // (~50 streams) so users browsing /aggregation see them all.
  const LIVE_CAP_IN_TRENDING = 25;

  // Apply the same filter logic to live streams that the server applies to
  // posts. Without this, picking 'kick' would filter posts but leave every
  // YouTube + Twitch + Kick stream visible at the top.
  const liveData = React.useMemo<ExternalLiveNowRow[]>(() => {
    if (isSearching || activeTab !== 'trending') return [];
    // Any filter that doesn't map cleanly onto external live data → hide.
    if (activeFilters.some((f) => LIVE_SUPPRESSING_FILTERS.includes(f))) return [];

    const platformsSelected = activeFilters.filter(
      (f): f is typeof PLATFORM_FILTERS[number] => PLATFORM_FILTERS.includes(f as any),
    );
    const externalPlatformsSelected = platformsSelected.filter((p) => p !== 'meecrowd');

    // User picked only `meecrowd` → no external live to show.
    if (platformsSelected.length > 0 && externalPlatformsSelected.length === 0) return [];

    let live = liveQuery.data ?? [];
    if (externalPlatformsSelected.length > 0) {
      live = live.filter((row) =>
        externalPlatformsSelected.includes(row.platform_slug as any),
      );
    }
    return live.slice(0, LIVE_CAP_IN_TRENDING);
  }, [liveQuery.data, activeFilters, isSearching, activeTab]);
  const { toggleLike, toggleBookmark } = usePostActions();

  // Build the unified feed list. Live streams pin to the top of Trending,
  // ordered by viewer count (already sorted by useLiveNow).
  const items = React.useMemo<FeedItem[]>(() => {
    if (isSearching && searchQuery.length >= 2) {
      return (search.data ?? []).map((p) => ({ kind: 'post', data: p }));
    }
    const posts = feed.data?.pages.flat() ?? [];
    const liveItems: FeedItem[] = liveData.map((row) => ({ kind: 'live', data: row }));
    const postItems: FeedItem[] = posts.map((p) => ({ kind: 'post', data: p }));
    return [...liveItems, ...postItems];
  }, [isSearching, searchQuery, search.data, feed.data, liveData]);

  const isLoading = isSearching ? search.isLoading : feed.isLoading;
  const isError = isSearching ? search.isError : feed.isError;

  const renderItem = useCallback(({ item }: { item: FeedItem }) => {
    if (item.kind === 'live') {
      return <LivePostCard row={item.data} />;
    }
    return (
      <PostCard
        post={item.data}
        onLike={() => toggleLike(item.data)}
        onBookmark={() => toggleBookmark(item.data)}
      />
    );
  }, [toggleLike, toggleBookmark]);

  const keyExtractor = useCallback(
    (item: FeedItem) =>
      item.kind === 'live' ? `live-${item.data.content_id}` : item.data.id,
    []
  );

  const closePanels = () => {
    setShowSortPanel(false);
    Keyboard.dismiss();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header with logo + split search/sort bar */}
      <View style={styles.headerBar}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
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
              accessibilityLabel="Search events and creators"
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => {
                  setSearchQuery('');
                  setIsSearching(false);
                  searchRef.current?.blur();
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Ionicons
                  name="close-circle"
                  size={14}
                  color={colors.textMuted}
                />
              </Pressable>
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
            accessibilityRole="button"
            accessibilityLabel="Sort and filter"
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
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
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
            <PostListSkeleton count={6} />
          ) : isError ? (
            <ErrorState
              onRetry={() => (isSearching ? search.refetch() : feed.refetch())}
            />
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

      {/* Create post is now the "+" tab in the bottom bar — no FAB. */}
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
    // Clears the tab bar (~80px) so the last card isn't hidden behind it.
    paddingBottom: spacing.xl + 64,
    flexGrow: 1,
  },
  footer: {
    paddingVertical: spacing.xl,
  },
  center: {
    marginTop: spacing['5xl'],
  },
});
