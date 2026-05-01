import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { usersService } from '@/services/users';
import { postsService } from '@/services/posts';
import { Avatar } from '@/components/ui/Avatar';
import { PostCard } from '@/components/feed/PostCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PostListSkeleton, UserRowSkeleton } from '@/components/ui/Skeleton';
import { useDebounce } from '@/hooks/useDebounce';
import { usePostActions } from '@/hooks/usePostActions';
import { colors, spacing, radius, typography } from '@/theme';
import type { User, Post } from '@/types';

export default function DiscoverScreen() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'users' | 'posts'>('users');
  const router = useRouter();

  // Debounce: fire the actual query 300ms after the user stops typing.
  // Without this, every keystroke spawned a network request — on top of a
  // 2-char minimum that meant 3+ redundant searches for even short terms.
  const debouncedQuery = useDebounce(query.trim(), 300);
  const { toggleLike, toggleBookmark } = usePostActions();

  const users = useQuery({
    queryKey: ['search-users', debouncedQuery],
    queryFn: () => usersService.searchUsers(debouncedQuery),
    enabled: debouncedQuery.length >= 2 && mode === 'users',
  });

  const posts = useQuery({
    queryKey: ['search-posts', debouncedQuery],
    queryFn: () => postsService.searchPosts(debouncedQuery),
    enabled: debouncedQuery.length >= 2 && mode === 'posts',
  });

  const hasMinChars = debouncedQuery.length >= 2;
  // While the user is still typing (query != debouncedQuery), show skeleton
  // so the UI doesn't feel frozen. Otherwise defer to the query's own state.
  const pendingDebounce = query.trim() !== debouncedQuery && query.trim().length >= 2;
  const loading = mode === 'users'
    ? users.isLoading || pendingDebounce
    : posts.isLoading || pendingDebounce;
  const hasError = mode === 'users' ? users.isError : posts.isError;
  const retry = mode === 'users' ? users.refetch : posts.refetch;

  const renderUser = useCallback(({ item }: { item: User }) => (
    <TouchableOpacity
      style={styles.userRow}
      onPress={() => router.push(`/(app)/user/${item.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.display_name}'s profile`}
    >
      <Avatar uri={item.avatar_url} name={item.display_name} size={44} />
      <View style={styles.userInfo}>
        <Text style={styles.displayName} numberOfLines={1}>{item.display_name}</Text>
        <Text style={styles.username}>@{item.username}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </TouchableOpacity>
  ), [router]);

  const renderPost = useCallback(({ item }: { item: Post }) => (
    <PostCard
      post={item}
      onLike={() => toggleLike(item)}
      onBookmark={() => toggleBookmark(item)}
    />
  ), [toggleLike, toggleBookmark]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search creators or posts..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Search creators or posts"
        />
        {query.length > 0 && (
          <Pressable
            onPress={() => setQuery('')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Mode toggle */}
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'users' && styles.modeBtnActive]}
          onPress={() => setMode('users')}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'users' }}
        >
          <Text style={[styles.modeText, mode === 'users' && styles.modeTextActive]}>
            Creators
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'posts' && styles.modeBtnActive]}
          onPress={() => setMode('posts')}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'posts' }}
        >
          <Text style={[styles.modeText, mode === 'posts' && styles.modeTextActive]}>
            Posts
          </Text>
        </TouchableOpacity>
      </View>

      {/* Results */}
      {!hasMinChars ? (
        <EmptyState
          icon="search"
          title="Discover"
          message="Type at least 2 characters to search creators or posts"
        />
      ) : hasError ? (
        <ErrorState onRetry={retry} />
      ) : loading ? (
        mode === 'users' ? (
          <View style={styles.list}>
            {Array.from({ length: 6 }).map((_, i) => (
              <UserRowSkeleton key={i} />
            ))}
          </View>
        ) : (
          <PostListSkeleton count={5} />
        )
      ) : mode === 'users' ? (
        <FlatList
          data={users.data ?? []}
          renderItem={renderUser}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState icon="people-outline" title="No creators found" />
          }
        />
      ) : (
        <FlatList
          data={posts.data ?? []}
          renderItem={renderPost}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState icon="newspaper-outline" title="No posts found" />
          }
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: spacing.lg,
    paddingHorizontal: spacing.lg,
    height: 44,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
  },
  modeToggle: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  modeBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
  modeTextActive: {
    color: colors.white,
  },
  list: {
    paddingBottom: spacing['5xl'],
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  userInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  displayName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  username: {
    ...typography.caption,
    color: colors.textMuted,
  },
  loader: {
    marginTop: spacing['4xl'],
  },
});
