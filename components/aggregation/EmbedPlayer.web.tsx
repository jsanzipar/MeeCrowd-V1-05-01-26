// Web-only EmbedPlayer. Metro picks this file when bundling for web, and
// falls back to EmbedPlayer.tsx for native — letting us avoid pulling in
// react-native-youtube-iframe (and its react-native-web-webview peer dep)
// on the web bundle, since browsers handle YouTube/Twitch/Kick embeds
// natively via <iframe>.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius } from '@/theme';

interface Props {
  embedUrl: string;
  aspectRatio?: number;
  autoplay?: boolean;
}

/**
 * Append autoplay params + (Twitch-only) the runtime hostname as `parent`.
 *
 * Twitch's iframe player requires `parent` to match the actual hosting
 * domain — we hard-coded `meecrowd.com` in the embed URL during ingest,
 * which fails on localhost during dev. Re-write it at render time using
 * window.location.hostname so the embed plays anywhere it's loaded.
 */
function withAutoplay(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      u.searchParams.set('autoplay', '1');
      u.searchParams.set('playsinline', '1');
    } else if (host.includes('twitch.tv')) {
      u.searchParams.set('autoplay', 'true');
      // Override the hard-coded parent with the live hostname.
      const liveHost = typeof window !== 'undefined' ? window.location.hostname : null;
      if (liveHost) {
        u.searchParams.delete('parent');
        u.searchParams.append('parent', liveHost);
      }
    } else if (host.includes('kick.com')) {
      u.searchParams.set('autoplay', 'true');
    } else {
      u.searchParams.set('autoplay', '1');
    }
    return u.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}autoplay=1`;
  }
}

/**
 * Twitch's iframe enforces the `parent` query param matches the actual
 * hosting hostname. We always rewrite, regardless of autoplay state.
 */
function withTwitchParent(url: string): string {
  if (!url.includes('player.twitch.tv')) return url;
  if (typeof window === 'undefined') return url;
  try {
    const u = new URL(url);
    u.searchParams.delete('parent');
    u.searchParams.append('parent', window.location.hostname);
    return u.toString();
  } catch {
    return url;
  }
}

export function EmbedPlayer({ embedUrl, aspectRatio = 16 / 9, autoplay = false }: Props) {
  const base = withTwitchParent(embedUrl);
  const url = autoplay ? withAutoplay(base) : base;
  return (
    <View style={[styles.wrap, { aspectRatio }]}>
      {/* eslint-disable-next-line react/no-unknown-property */}
      <iframe
        src={url}
        style={{
          border: 0,
          width: '100%',
          height: '100%',
          borderRadius: radius.md,
          backgroundColor: colors.surface,
        }}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
});
