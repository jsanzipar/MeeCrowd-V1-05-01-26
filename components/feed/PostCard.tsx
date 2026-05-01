import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  LayoutAnimation, Platform as RNPlatform,
  ScrollView, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '@/theme';
import { Avatar } from '@/components/ui/Avatar';
import { FallbackImage } from '@/components/ui/FallbackImage';
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

  // Media sources: prefer media_urls (array), fall back to single thumbnail_url
  const mediaList = useMemo<string[]>(() => {
    if (post.media_urls && post.media_urls.length > 0) return post.media_urls;
    if (post.thumbnail_url) return [post.thumbnail_url];
    return [];
  }, [post.media_urls, post.thumbnail_url]);
  const firstMedia = mediaList[0] ?? null;
  const extraMediaCount = Math.max(0, mediaList.length - 1);

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

        {!expanded && firstMedia && (
          <View>
            <FallbackImage uri={firstMedia} style={styles.compactThumb} fallbackIconSize={18} />
            {extraMediaCount > 0 && (
              <View style={styles.compactThumbBadge}>
                <Text style={styles.compactThumbBadgeText}>+{extraMediaCount}</Text>
              </View>
            )}
          </View>
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

          {mediaList.length > 0 && (
            <MediaGallery uris={mediaList} />
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.action}
              onPress={onLike}
              accessibilityRole="button"
              accessibilityLabel={post.is_liked ? 'Unlike post' : 'Like post'}
              accessibilityState={{ selected: post.is_liked }}
            >
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
              accessibilityRole="button"
              accessibilityLabel={`View ${post.comment_count} comments`}
            >
              <Ionicons name="chatbubble-outline" size={16} color={colors.textMuted} />
              <Text style={styles.actionText}>{formatCount(post.comment_count)}</Text>
            </TouchableOpacity>

            <View style={styles.action}>
              <Ionicons name="eye-outline" size={16} color={colors.textMuted} />
              <Text style={styles.actionText}>{formatCount(post.view_count)}</Text>
            </View>

            <View style={styles.actionSpacer} />

            <TouchableOpacity
              style={styles.action}
              onPress={onBookmark}
              accessibilityRole="button"
              accessibilityLabel={post.is_bookmarked ? 'Unsave post' : 'Save post'}
              accessibilityState={{ selected: post.is_bookmarked }}
            >
              <Ionicons
                name={post.is_bookmarked ? 'bookmark' : 'bookmark-outline'}
                size={16}
                color={post.is_bookmarked ? colors.primary : colors.textMuted}
              />
              <Text style={[styles.actionText, post.is_bookmarked && { color: colors.primary }]}>
                {post.is_bookmarked ? 'Saved' : 'Save'}
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

/** Swipeable paginated gallery for multiple media items in the expanded view */
function MediaGallery({ uris }: { uris: string[] }) {
  const [index, setIndex] = useState(0);
  const { width: screenWidth } = useWindowDimensions();
  // Expanded area has 40px of paddingLeft and the card has spacing.md (12) on each side
  const galleryWidth = Math.min(screenWidth, 600) - 40 - 12 - 12;

  if (uris.length === 1) {
    return (
      <FallbackImage
        uri={uris[0]}
        style={[styles.thumbnail, { width: galleryWidth }]}
        fallbackIconSize={32}
      />
    );
  }

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / galleryWidth);
    if (i !== index) setIndex(i);
  };

  return (
    <View style={{ marginBottom: spacing.sm }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        decelerationRate="fast"
        style={{ borderRadius: radius.md }}
      >
        {uris.map((uri, i) => (
          <FallbackImage
            key={i}
            uri={uri}
            style={{ width: galleryWidth, height: 200, backgroundColor: colors.surface }}
            resizeMode="cover"
            fallbackIconSize={32}
          />
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {uris.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === index && styles.dotActive]}
          />
        ))}
      </View>
      <View style={styles.galleryCounter}>
        <Text style={styles.galleryCounterText}>{index + 1} / {uris.length}</Text>
      </View>
    </View>
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
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  compactThumbBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 6,
  },
  compactThumbBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    marginTop: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 18,
  },
  galleryCounter: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
  },
  galleryCounterText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
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
    color: colors.textSecondary,
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
