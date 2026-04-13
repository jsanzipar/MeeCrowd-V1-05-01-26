import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
import type { Platform } from '@/types';

const platformConfig: Record<Platform, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  youtube: { color: colors.youtube, icon: 'logo-youtube' },
  twitch: { color: colors.twitch, icon: 'logo-twitch' },
  kick: { color: colors.kick, icon: 'game-controller' },
  instagram: { color: colors.instagram, icon: 'logo-instagram' },
};

interface PlatformBadgeProps {
  platform: Platform;
  size?: 'sm' | 'md';
}

export function PlatformBadge({ platform, size = 'sm' }: PlatformBadgeProps) {
  const config = platformConfig[platform];
  return (
    <Ionicons name={config.icon} size={size === 'sm' ? 14 : 18} color={config.color} />
  );
}
