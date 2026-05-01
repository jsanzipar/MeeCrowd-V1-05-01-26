// ExternalContentRow — compact row that visually matches PostCard's
// compact layout (avatar | title + meta | thumb | EventTag + PlatformBadge,
// then heart/chat/eye stats below). Used on the external/[id] profile so
// recent uploads feel consistent with mockup-profile past events.
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { FallbackImage } from '@/components/ui/FallbackImage';
import { EventTag } from '@/components/feed/EventTag';
import { PlatformBadge } from '@/components/feed/PlatformBadge';
import { formatCount, formatDuration } from '@/lib/format';
import { colors, spacing, radius, typography } from '@/theme';
import type { ExternalContent, Platform, EventStatus } from '@/types';

interface Props {
  content: ExternalContent;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

function statusOf(c: ExternalContent): EventStatus {
  if (c.is_live) return 'live';
  if (c.scheduled_start_at && new Date(c.scheduled_start_at) > new Date()) return 'upcoming';
  return 'past';
}

export function ExternalContentRow({ content }: Props) {
  const router = useRouter();
  const platform = (content.platform?.slug as Platform) ?? 'youtube';
  const status = statusOf(content);
  const m = content.latest_metrics;
  const duration = formatDuration(content.duration_seconds);

  const onPress = () => {
    router.push({
      pathname: '/(app)/aggregation/content/[id]',
      params: { id: content.id },
    });
  };

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={content.title ?? 'Video'}
    >
      <View style={styles.compactRow}>
        <Avatar
          uri={content.channel?.avatar_url ?? null}
          name={content.channel?.display_name ?? '?'}
          size={32}
        />

        <View style={styles.compactCenter}>
          <Text style={styles.title} numberOfLines={1}>
            {content.title ?? 'Untitled'}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.username} numberOfLines={1}>
              {content.channel?.display_name ?? content.channel?.handle ?? '—'}
            </Text>
            {content.published_at && (
              <Text style={styles.timeText}>{timeAgo(content.published_at)}</Text>
            )}
          </View>
        </View>

        {content.thumbnail_url && (
          <View>
            <FallbackImage
              uri={content.thumbnail_url}
              style={styles.compactThumb}
              fallbackIconSize={18}
            />
            {duration && !content.is_live && (
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{duration}</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.rightColumn}>
          <EventTag status={status} />
          <PlatformBadge platform={platform} size={14} />
        </View>
      </View>

      <View style={styles.compactStats}>
        <Ionicons name="heart-outline" size={12} color={colors.textMuted} />
        <Text style={styles.statText}>{formatCount(m?.like_count ?? 0)}</Text>
        <Ionicons name="chatbubble-outline" size={12} color={colors.textMuted} />
        <Text style={styles.statText}>{formatCount(m?.comment_count ?? 0)}</Text>
        <Ionicons
          name="eye-outline"
          size={12}
          color={content.is_live ? colors.error : colors.textMuted}
        />
        <Text
          style={[
            styles.statText,
            content.is_live && { color: colors.error, fontWeight: '700' },
          ]}
        >
          {formatCount(
            content.is_live
              ? m?.current_viewer_count ?? 0
              : m?.view_count ?? 0
          )}
        </Text>
      </View>

      <View style={styles.separator} />
    </TouchableOpacity>
  );
}

// Mirror PostCard compact + stats styles 1:1.
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
  title: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 14,
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
    maxWidth: 120,
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
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 4,
  },
  durationText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '700',
  },
  compactStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 40,
    marginTop: 4,
    paddingBottom: spacing.sm,
  },
  statText: {
    ...typography.small,
    color: colors.textMuted,
    marginRight: 4,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },
});
