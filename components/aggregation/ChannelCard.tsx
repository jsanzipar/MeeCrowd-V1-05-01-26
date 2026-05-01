import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { formatCount } from '@/lib/format';
import { colors, spacing, radius, typography } from '@/theme';
import type { ExternalChannel } from '@/types';

interface Props {
  channel: ExternalChannel;
  onPress: () => void;
}

const PLATFORM_COLOR: Record<string, string> = {
  youtube: colors.youtube,
  twitch: colors.twitch,
  kick: colors.kick,
};

export function ChannelCard({ channel, onPress }: Props) {
  const slug = channel.platform?.slug ?? '';
  const platformColor = PLATFORM_COLOR[slug] ?? colors.primary;
  const platformName = channel.platform?.display_name ?? slug;
  return (
    <Pressable
      onPress={onPress}
      style={styles.wrap}
      accessibilityRole="button"
      accessibilityLabel={`${channel.display_name} on ${platformName}`}
    >
      <Avatar
        uri={channel.avatar_url}
        name={channel.display_name ?? channel.handle ?? '?'}
        size={56}
      />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {channel.display_name ?? channel.handle}
        </Text>
        <View style={styles.metaRow}>
          <View style={[styles.platformPill, { backgroundColor: platformColor }]}>
            <Text style={styles.platformText}>{platformName}</Text>
          </View>
          <Text style={styles.stats}>
            {formatCount(channel.subscriber_count)} subscribers
          </Text>
        </View>
        <Text style={styles.stats} numberOfLines={1}>
          {formatCount(channel.total_view_count)} total views ·{' '}
          {channel.video_count.toLocaleString()} videos
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  body: {
    flex: 1,
  },
  name: {
    ...typography.bodyBold,
    color: colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 4,
    marginBottom: 2,
  },
  platformPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  platformText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  stats: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
