import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '@/theme';
import type { Platform } from '@/types';

const platformConfig: Record<Platform, { color: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  youtube: { color: colors.youtube, icon: 'logo-youtube', label: 'YouTube' },
  twitch: { color: colors.twitch, icon: 'logo-twitch', label: 'Twitch' },
  kick: { color: colors.kick, icon: 'game-controller', label: 'Kick' },
  instagram: { color: colors.instagram, icon: 'logo-instagram', label: 'Instagram' },
};

interface PlatformBadgeProps {
  platform: Platform;
  size?: 'sm' | 'md';
}

export function PlatformBadge({ platform, size = 'sm' }: PlatformBadgeProps) {
  const config = platformConfig[platform];

  return (
    <View style={[styles.badge, { backgroundColor: config.color + '20' }, size === 'md' && styles.badgeMd]}>
      <Ionicons name={config.icon} size={size === 'sm' ? 12 : 16} color={config.color} />
      <Text style={[styles.label, { color: config.color }, size === 'md' && styles.labelMd]}>
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    gap: 4,
  },
  badgeMd: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  label: {
    ...typography.small,
    fontWeight: '600',
  },
  labelMd: {
    fontSize: 13,
  },
});
