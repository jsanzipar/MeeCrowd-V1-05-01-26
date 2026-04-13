import React from 'react';
import { Image, StyleSheet } from 'react-native';
import type { Platform } from '@/types';

const STORAGE_BASE = 'https://nfreggighhtvznvcofql.supabase.co/storage/v1/object/public/assets/logos';

const platformLogo: Record<Platform, string> = {
  youtube: `${STORAGE_BASE}/YouTubeLogo.png`,
  twitch: `${STORAGE_BASE}/TwitchLogo.png`,
  kick: `${STORAGE_BASE}/KickLogo.png`,
  instagram: `${STORAGE_BASE}/InstagramLogo.png`,
  tiktok: `${STORAGE_BASE}/TikTokLogo.png`,
  x: `${STORAGE_BASE}/XLogo.png`,
  facebook: `${STORAGE_BASE}/FacebookLogo.png`,
  linkedin: `${STORAGE_BASE}/LinkedInLogo.png`,
};

interface PlatformBadgeProps {
  platform: Platform;
  size?: number;
}

export function PlatformBadge({ platform, size = 16 }: PlatformBadgeProps) {
  return (
    <Image
      source={{ uri: platformLogo[platform] }}
      style={[styles.logo, { width: size, height: size }]}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  logo: {
    borderRadius: 3,
  },
});
