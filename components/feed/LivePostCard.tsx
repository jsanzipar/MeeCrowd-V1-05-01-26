// LivePostCard — visually identical to PostCard, but renders an
// ExternalLiveNowRow (currently-live YouTube/Twitch/Kick stream).
// Reuses EventTag + PlatformBadge so icons, sizes, and placement match.
//
// Compact: avatar | title + channel + time | thumbnail | EventTag + PlatformBadge
//          ❤️ likes  💬 comments  👁 viewers (matches PostCard layout)
// Expanded: in-app player (autoplays on mount, stops on unmount)
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutAnimation,
  Platform as RNPlatform,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { FallbackImage } from '@/components/ui/FallbackImage';
import { EventTag } from '@/components/feed/EventTag';
import { PlatformBadge } from '@/components/feed/PlatformBadge';
import { EmbedPlayer } from '@/components/aggregation/EmbedPlayer';
import { formatCount, stripEmojis } from '@/lib/format';
import { colors, spacing, radius, typography } from '@/theme';
import type { ExternalLiveNowRow, Platform } from '@/types';

interface Props {
  row: ExternalLiveNowRow;
}

function timeSince(iso: string | null): string {
  if (!iso) return 'live';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'live now';
  if (mins < 60) return `live ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `live ${hrs}h`;
  return `live ${Math.floor(hrs / 24)}d`;
}

export function LivePostCard({ row }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  // Map slug → Platform enum value used by PlatformBadge.
  const platform = (row.platform_slug as Platform) ?? 'youtube';

  const toggleExpand = () => {
    if (RNPlatform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setExpanded((e) => !e);
  };

  const openChannelProfile = () => {
    router.push({
      pathname: '/(app)/external/[id]',
      params: { id: row.channel_id },
    });
  };

  const openExternally = () => {
    if (row.url) Linking.openURL(row.url);
  };

  return (
    <View style={styles.card}>
      {/* Compact row — only this is tappable. Tapping it toggles expand;
          taps on the player (when expanded) DO NOT bubble here. */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={toggleExpand}
        accessibilityRole="button"
        accessibilityLabel={`Live: ${row.title ?? 'Stream'} by ${row.channel_name}. Tap to ${expanded ? 'collapse' : 'play'}.`}
      >
        <View style={styles.compactRow}>
          <TouchableOpacity onPress={openChannelProfile} hitSlop={8}>
            <Avatar
              uri={row.channel_avatar}
              name={row.channel_name ?? '?'}
              size={32}
            />
          </TouchableOpacity>

          {/* Two-row content area: top = text + thumbnail, bottom = stats + icons.
              The bottom row makes the icons (live dot, platform badge) align
              horizontally with the like/comment/view counts. */}
          <View style={styles.contentColumn}>
            <View style={styles.topRow}>
              <View style={styles.textBlock}>
                <Text style={styles.title} numberOfLines={expanded ? undefined : 1}>
                  {stripEmojis(row.title) || 'Untitled stream'}
                </Text>
                <View style={styles.metaRow}>
                  <Text style={styles.username} numberOfLines={1}>
                    {row.channel_name ?? row.handle ?? 'Unknown'}
                  </Text>
                  <Text style={styles.timeText}>{timeSince(row.started_at)}</Text>
                </View>
              </View>
              {!expanded && (
                row.thumbnail_url ? (
                  <FallbackImage
                    uri={row.thumbnail_url}
                    style={styles.thumb}
                    fallbackIconSize={16}
                  />
                ) : (
                  <View style={styles.thumb} />
                )
              )}
            </View>

            {!expanded && (
              <View style={styles.bottomRow}>
                <View style={styles.statsRow}>
                  <Ionicons name="heart-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.statText}>{formatCount(row.like_count ?? 0)}</Text>
                  <Ionicons name="chatbubble-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.statText}>{formatCount(row.comment_count ?? 0)}</Text>
                  <Ionicons name="eye-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.statText}>
                    {formatCount(row.current_viewer_count ?? row.view_count ?? 0)}
                  </Text>
                </View>
                <View style={styles.iconsBlock}>
                  <EventTag status="live" />
                  <PlatformBadge platform={platform} size={14} />
                </View>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>

      {/* Expanded — player + actions live OUTSIDE the tappable wrapper so
          tapping play/pause on the YouTube player doesn't collapse the post. */}
      {expanded && row.embed_url && (
        <View style={styles.expandedArea}>
          <EmbedPlayer embedUrl={row.embed_url} autoplay />

          <View style={styles.actions}>
            <View style={styles.action}>
              <Ionicons name="radio" size={16} color={colors.error} />
              <Text style={[styles.actionText, { color: colors.error }]}>
                {row.current_viewer_count != null
                  ? `${formatCount(row.current_viewer_count)} watching`
                  : 'LIVE'}
              </Text>
            </View>

            <View style={styles.actionSpacer} />

            <TouchableOpacity
              style={styles.action}
              onPress={openChannelProfile}
              accessibilityRole="button"
              accessibilityLabel="View channel profile"
            >
              <Ionicons name="person-outline" size={16} color={colors.textMuted} />
              <Text style={styles.actionText}>Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.action}
              onPress={openExternally}
              accessibilityRole="button"
              accessibilityLabel={`Open on ${row.platform_name}`}
            >
              <Ionicons name="open-outline" size={16} color={colors.textMuted} />
              <Text style={styles.actionText}>Open</Text>
            </TouchableOpacity>

            {/* Explicit collapse handle — needed because the player area
                no longer toggles expand on tap. */}
            <TouchableOpacity
              style={styles.action}
              onPress={toggleExpand}
              accessibilityRole="button"
              accessibilityLabel="Collapse"
            >
              <Ionicons name="chevron-up" size={16} color={colors.textMuted} />
              <Text style={styles.actionText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.separator} />
    </View>
  );
}

// Styles intentionally mirror PostCard's compact + stats layout 1:1.
const styles = StyleSheet.create({
  card: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  contentColumn: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  textBlock: {
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
    maxWidth: 100,
  },
  timeText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  thumb: {
    // 16:9, sits at the top-right of the card.
    width: 80,
    height: 45,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconsBlock: {
    // Match the thumbnail's 80px width and center the icons within it
    // so the live dot + platform badge sit visually under the snapshot.
    width: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  expandedArea: {
    paddingTop: spacing.md,
    paddingLeft: 40,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
    paddingBottom: spacing.sm,
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
  statText: {
    ...typography.small,
    color: colors.textMuted,
    marginRight: 4,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: 0,
  },
});
