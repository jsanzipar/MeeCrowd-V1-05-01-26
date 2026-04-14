import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, LayoutAnimation, Platform as RNPlatform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '@/theme';
import { Avatar } from '@/components/ui/Avatar';
import { PlatformBadge } from '@/components/feed/PlatformBadge';
import { EventTag } from '@/components/feed/EventTag';
import { getEventStatus, formatEventTime } from '@/types';
import type { Post } from '@/types';

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

interface PostCardProps {
  post: Post;
  onLike?: () => void;
  onBookmark?: () => void;
}

export function PostCard({ post, onLike, onBookmark }: PostCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const eventStatus = getEventStatus(post);
  const timeLabel = formatEventTime(post);

  const toggleExpand = () => {
    if (RNPlatform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setExpanded(!expanded);
  };

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={toggleExpand}
    >
      {/* Compact row — always visible */}
      <View style={styles.compactRow}>
        <TouchableOpacity
          onPress={() => router.push(`/(app)/user/${post.user_id}`)}
          hitSlop={8}
        >
          <Avatar uri={post.user?.avatar_url ?? null} name={post.user?.display_name} size={32} />
        </TouchableOpacity>

        <View style={styles.compactCenter}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={expanded ? undefined : 1}>{post.title}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.username} numberOfLines={1}>
              {post.user?.display_name ?? 'Unknown'}
            </Text>
            <Text style={styles.timeText}>{timeLabel}</Text>
          </View>
        </View>

        {!expanded && post.thumbnail_url && (
          <Image source={{ uri: post.thumbnail_url }} style={styles.compactThumb} />
        )}

        <View style={styles.rightColumn}>
          <EventTag status={eventStatus} />
          <PlatformBadge platform={post.platform} size={14} />
        </View>
      </View>

      {/* Expanded content */}
      {expanded && (
        <View style={styles.expandedArea}>
          {post.body && (
            <Text style={styles.body}>{post.body}</Text>
          )}

          {post.thumbnail_url && (
            <Image source={{ uri: post.thumbnail_url }} style={styles.thumbnail} />
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.action} onPress={onLike}>
              <Ionicons
                name={post.is_liked ? 'heart' : 'heart-outline'}
                size={18}
                color={post.is_liked ? colors.error : colors.textMuted}
              />
              <Text style={styles.actionText}>{formatCount(post.like_count)}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.action}
              onPress={() => router.push(`/(app)/post/${post.id}`)}
            >
              <Ionicons name="chatbubble-outline" size={16} color={colors.textMuted} />
              <Text style={styles.actionText}>{formatCount(post.comment_count)}</Text>
            </TouchableOpacity>

            <View style={styles.action}>
              <Ionicons name="eye-outline" size={16} color={colors.textMuted} />
              <Text style={styles.actionText}>{formatCount(post.view_count)}</Text>
            </View>

            <View style={styles.actionSpacer} />

            <TouchableOpacity style={styles.action} onPress={onBookmark}>
              <Ionicons
                name={post.is_bookmarked ? 'bookmark' : 'bookmark-outline'}
                size={16}
                color={post.is_bookmarked ? colors.primary : colors.textMuted}
              />
              <Text style={[styles.actionText, post.is_bookmarked && { color: colors.primary }]}>
                {post.is_bookmarked ? 'Scheduled' : 'Schedule'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Compact stats — only when collapsed */}
      {!expanded && (
        <View style={styles.compactStats}>
          <Ionicons
            name={post.is_liked ? 'heart' : 'heart-outline'}
            size={12}
            color={post.is_liked ? colors.error : colors.textMuted}
          />
          <Text style={styles.statText}>{formatCount(post.like_count)}</Text>
          <Ionicons name="chatbubble-outline" size={12} color={colors.textMuted} />
          <Text style={styles.statText}>{formatCount(post.comment_count)}</Text>
          <Ionicons name="eye-outline" size={12} color={colors.textMuted} />
          <Text style={styles.statText}>{formatCount(post.view_count)}</Text>
          {post.is_bookmarked && (
            <Ionicons name="bookmark" size={12} color={colors.primary} style={{ marginLeft: 'auto' }} />
          )}
        </View>
      )}

      {/* Soft separator */}
      <View style={styles.separator} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  compactCenter: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 14,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 1,
  },
  username: {
    ...typography.small,
    color: colors.textMuted,
    maxWidth: 100,
  },
  timeText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  rightColumn: {
    alignItems: 'center',
    gap: 4,
  },
  compactThumb: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  compactStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
    paddingLeft: 40,
  },
  statText: {
    ...typography.small,
    color: colors.textMuted,
    marginRight: spacing.sm,
  },
  expandedArea: {
    marginTop: spacing.sm,
    paddingLeft: 40,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  thumbnail: {
    width: '100%',
    height: 160,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    ...typography.small,
    color: colors.textMuted,
  },
  actionSpacer: {
    flex: 1,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
    opacity: 0.5,
  },
});
