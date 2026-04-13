import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '@/theme';
import { Avatar } from '@/components/ui/Avatar';
import { PlatformBadge } from '@/components/feed/PlatformBadge';
import type { Post } from '@/types';

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

interface PostCardProps {
  post: Post;
  onLike?: () => void;
  onBookmark?: () => void;
}

export function PostCard({ post, onLike, onBookmark }: PostCardProps) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onPress={() => router.push(`/(app)/post/${post.id}`)}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.userInfo}
          onPress={() => router.push(`/(app)/user/${post.user_id}`)}
        >
          <Avatar uri={post.user?.avatar_url ?? null} name={post.user?.display_name} size={36} />
          <View style={styles.userText}>
            <Text style={styles.displayName} numberOfLines={1}>
              {post.user?.display_name ?? 'Unknown'}
            </Text>
            <Text style={styles.username}>@{post.user?.username ?? 'unknown'}</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <PlatformBadge platform={post.platform} />
          <Text style={styles.time}>{timeAgo(post.created_at)}</Text>
        </View>
      </View>

      {/* Content */}
      <Text style={styles.title} numberOfLines={2}>{post.title}</Text>
      {post.body && (
        <Text style={styles.body} numberOfLines={3}>{post.body}</Text>
      )}

      {/* Thumbnail */}
      {post.thumbnail_url && (
        <Image source={{ uri: post.thumbnail_url }} style={styles.thumbnail} />
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.action} onPress={onLike}>
          <Ionicons
            name={post.is_liked ? 'heart' : 'heart-outline'}
            size={20}
            color={post.is_liked ? colors.error : colors.textMuted}
          />
          <Text style={styles.actionText}>{formatCount(post.like_count)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.action}
          onPress={() => router.push(`/(app)/post/${post.id}`)}
        >
          <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted} />
          <Text style={styles.actionText}>{formatCount(post.comment_count)}</Text>
        </TouchableOpacity>

        <View style={styles.action}>
          <Ionicons name="eye-outline" size={18} color={colors.textMuted} />
          <Text style={styles.actionText}>{formatCount(post.view_count)}</Text>
        </View>

        <TouchableOpacity style={styles.action} onPress={onBookmark}>
          <Ionicons
            name={post.is_bookmarked ? 'bookmark' : 'bookmark-outline'}
            size={18}
            color={post.is_bookmarked ? colors.primary : colors.textMuted}
          />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userText: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  displayName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  username: {
    ...typography.caption,
    color: colors.textMuted,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  time: {
    ...typography.caption,
    color: colors.textMuted,
  },
  title: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  thumbnail: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    marginTop: spacing.sm,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
