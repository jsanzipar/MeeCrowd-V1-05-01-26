import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
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
import { colors, spacing, radius, typography } from '@/theme';
import type { User, Post } from '@/types';

export default function DiscoverScreen() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'users' | 'posts'>('users');
  const router = useRouter();

  const searchQuery = query.trim();

  const users = useQuery({
    queryKey: ['search-users', searchQuery],
    queryFn: () => usersService.searchUsers(searchQuery),
    enabled: searchQuery.length >= 2 && mode === 'users',
  });

  const posts = useQuery({
    queryKey: ['search-posts', searchQuery],
    queryFn: () => postsService.searchPosts(searchQuery),
    enabled: searchQuery.length >= 2 && mode === 'posts',
  });

  const isSearching = searchQuery.length >= 2;
  const loading = mode === 'users' ? users.isLoading : posts.isLoading;

  const renderUser = useCallback(({ item }: { item: User }) => (
    <TouchableOpacity
      style={styles.userRow}
      onPress={() => router.push(`/(app)/user/${item.id}`)}
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
    <PostCard post={item} />
  ), []);

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
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Mode toggle */}
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'users' && styles.modeBtnActive]}
          onPress={() => setMode('users')}
        >
          <Text style={[styles.modeText, mode === 'users' && styles.modeTextActive]}>
            Creators
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'posts' && styles.modeBtnActive]}
          onPress={() => setMode('posts')}
        >
          <Text style={[styles.modeText, mode === 'posts' && styles.modeTextActive]}>
            Posts
          </Text>
        </TouchableOpacity>
      </View>

      {/* Results */}
      {!isSearching ? (
        <EmptyState
          icon="search"
          title="Discover"
          message="Search for creators or posts"
        />
      ) : loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
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
