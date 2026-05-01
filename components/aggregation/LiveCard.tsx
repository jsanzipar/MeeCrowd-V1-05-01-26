import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FallbackImage } from '@/components/ui/FallbackImage';
import { formatCount } from '@/lib/format';
import { colors, spacing, radius, typography } from '@/theme';
import type { ExternalLiveNowRow, ExternalPlatformSlug } from '@/types';

interface Props {
  row: ExternalLiveNowRow;
  onPress: () => void;
}

const PLATFORM_COLOR: Record<string, string> = {
  youtube: colors.youtube,
  twitch: colors.twitch,
  kick: colors.kick,
};

export function LiveCard({ row, onPress }: Props) {
  const platformColor = PLATFORM_COLOR[row.platform_slug] ?? colors.primary;
  return (
    <Pressable
      onPress={onPress}
      style={styles.wrap}
      accessibilityRole="button"
      accessibilityLabel={`${row.channel_name ?? 'Channel'} live: ${row.title ?? 'Stream'}`}
    >
      <View style={styles.thumbWrap}>
        <FallbackImage uri={row.thumbnail_url} style={styles.thumb} />
        <View style={[styles.liveBadge, { backgroundColor: platformColor }]}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        {row.current_viewer_count != null && (
          <View style={styles.viewerBadge}>
            <Ionicons name="eye-outline" size={12} color={colors.white} />
            <Text style={styles.viewerText}>
              {formatCount(row.current_viewer_count)}
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {row.title ?? 'Untitled stream'}
      </Text>
      <Text style={styles.channel} numberOfLines={1}>
        {row.channel_name} · {row.platform_name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 240,
    marginRight: spacing.md,
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
  viewerBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
    gap: 4,
  },
  viewerText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: spacing.sm,
  },
  channel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
});
