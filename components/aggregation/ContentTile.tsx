import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FallbackImage } from '@/components/ui/FallbackImage';
import { formatCount, formatDuration } from '@/lib/format';
import { colors, spacing, radius, typography } from '@/theme';
import type { ExternalContent } from '@/types';

interface Props {
  content: ExternalContent;
  onPress: () => void;
}

export function ContentTile({ content, onPress }: Props) {
  const views = content.latest_metrics?.view_count ?? null;
  const liveViewers = content.latest_metrics?.current_viewer_count ?? null;
  const duration = formatDuration(content.duration_seconds);

  return (
    <Pressable
      onPress={onPress}
      style={styles.wrap}
      accessibilityRole="button"
      accessibilityLabel={content.title ?? 'Video'}
    >
      <View style={styles.thumbWrap}>
        <FallbackImage uri={content.thumbnail_url} style={styles.thumb} />
        {content.is_live ? (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        ) : (
          duration ? (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{duration}</Text>
            </View>
          ) : null
        )}
        {content.kind === 'short' && (
          <View style={styles.kindBadge}>
            <Ionicons name="flash" size={10} color={colors.white} />
            <Text style={styles.kindText}>Short</Text>
          </View>
        )}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {content.title ?? 'Untitled'}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {content.is_live && liveViewers != null
          ? `${formatCount(liveViewers)} watching now`
          : views != null
          ? `${formatCount(views)} views`
          : content.kind}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  thumbWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  liveBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: colors.error,
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.white,
  },
  liveText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  durationBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  durationText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  kindBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
    gap: 3,
  },
  kindText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  title: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: spacing.sm,
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
});
