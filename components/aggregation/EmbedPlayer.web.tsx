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
 * Append autoplay + muted params using each platform's expected names.
 * Browsers block UNMUTED autoplay, so muting is required for true autoplay.
 */
function withAutoplay(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      u.searchParams.set('autoplay', '1');
      u.searchParams.set('mute', '1');
      u.searchParams.set('playsinline', '1');
    } else if (host.includes('twitch.tv')) {
      u.searchParams.set('autoplay', 'true');
      u.searchParams.set('muted', 'true');
    } else if (host.includes('kick.com')) {
      u.searchParams.set('autoplay', 'true');
      u.searchParams.set('muted', 'true');
    } else {
      u.searchParams.set('autoplay', '1');
    }
    return u.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}autoplay=1&mute=1`;
  }
}

export function EmbedPlayer({ embedUrl, aspectRatio = 16 / 9, autoplay = false }: Props) {
  const url = autoplay ? withAutoplay(embedUrl) : embedUrl;
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
